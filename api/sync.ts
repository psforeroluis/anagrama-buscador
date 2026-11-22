// Función serverless de Vercel: guarda las partidas de un único usuario en un solo
// documento JSON de Vercel Blob (privado), con escritura condicional por ETag.
//
//   GET  /api/sync  -> 200 con el documento y su ETag, 304 si coincide If-None-Match,
//                      404 si aún no existe
//   PUT  /api/sync  -> exige If-Match con el ETag leído (o ninguno para crear)
//                      200 con cabecera ETag y cuerpo { etag } | 412 si otro aparato
//                      escribió antes, si falta If-Match y el documento existe, o si
//                      llega If-Match y no existe | 413 si pesa más de 1 MB |
//                      400 con { error: 'schema' | 'body' } | 405 otros métodos
//
// Variables de entorno: SYNC_TOKEN (token personal) y las del almacén Blob. Un almacén
// conectado con el modelo nuevo de Vercel define BLOB_READ_WRITE_TOKEN_STORE_ID y autentica
// con OIDC; con el modelo antiguo, BLOB_READ_WRITE_TOKEN (el SDK lo lee solo).

import { timingSafeEqual } from 'node:crypto';
import { BlobPreconditionFailedError, get, head, put } from '@vercel/blob';
import { TOMBSTONE_MS } from '../services/sync/constants.js';

const PATH = 'anagrama-sync.json';
const PREV_PATH = 'anagrama-sync.prev.json';
const MAX_BYTES = 1_048_576;
/** Con el modelo nuevo de Vercel Blob hay que indicar el almacén; sin él, el SDK usa el token. */
const STORE = process.env.BLOB_READ_WRITE_TOKEN_STORE_ID ? { storeId: process.env.BLOB_READ_WRITE_TOKEN_STORE_ID } : {};
const SCHEMA_VERSION = 1;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    });

const authorized = (request: Request): boolean => {
    const expected = process.env.SYNC_TOKEN ?? '';
    const header = request.headers.get('authorization') ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (expected.length < 32 || given.length === 0) return false;
    const a = Buffer.from(given), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
};

interface RemoteGame { id: string; rev: number; deletedAt?: number }

/** Valida la forma del documento sin entrar en el contenido de cada tablero. */
const parseDoc = (text: string): { schemaVersion: number; games: Record<string, RemoteGame> } | 'schema' | 'body' => {
    let doc: unknown;
    try { doc = JSON.parse(text); } catch { return 'body'; }
    if (!doc || typeof doc !== 'object') return 'body';
    const d = doc as { schemaVersion?: unknown; games?: unknown };
    if (d.schemaVersion !== SCHEMA_VERSION) return 'schema';
    if (!d.games || typeof d.games !== 'object' || Array.isArray(d.games)) return 'body';
    for (const [key, g] of Object.entries(d.games as Record<string, RemoteGame>)) {
        if (!g || typeof g !== 'object' || g.id !== key || typeof g.rev !== 'number') return 'body';
        if (g.deletedAt !== undefined && !Number.isFinite(g.deletedAt)) return 'body';
    }
    return d as { schemaVersion: number; games: Record<string, RemoteGame> };
};

/**
 * El ETag puede llegar débil (`W/"..."`): Vercel lo debilita al comprimir la respuesta, y con
 * documentos de cierto tamaño el almacén ya lo entrega así. El contenido es el mismo, así que
 * siempre se compara sin el prefijo, en las dos direcciones.
 */
const strongEtag = (value: string | null): string | null => value?.trim().replace(/^W\//, '') ?? null;

const readBlobText = async (path: string): Promise<{ text: string; etag: string } | null> => {
    const result = await get(path, { access: 'private', useCache: false, ...STORE });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return { text: await new Response(result.stream).text(), etag: result.blob.etag };
};

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method !== 'GET' && request.method !== 'PUT') return json(405, { error: 'method' }, { Allow: 'GET, PUT' });
        if (!authorized(request)) return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });

        try {
            if (request.method === 'GET') {
                const current = await readBlobText(PATH);
                if (!current) return json(404, { error: 'empty' });
                if (strongEtag(request.headers.get('if-none-match')) === strongEtag(current.etag)) {
                    return new Response(null, { status: 304, headers: { 'Cache-Control': 'no-store', ETag: current.etag } });
                }
                return new Response(current.text, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ETag: current.etag },
                });
            }

            // El tamaño se comprueba con la cabecera (sin leer el cuerpo) y con la longitud real.
            const declared = Number(request.headers.get('content-length'));
            if (Number.isFinite(declared) && declared > MAX_BYTES) return json(413, { error: 'too-large' });
            const text = await request.text();
            if (new TextEncoder().encode(text).length > MAX_BYTES) return json(413, { error: 'too-large' });
            const parsed = parseDoc(text);
            if (parsed === 'schema') return json(400, { error: 'schema' });
            if (parsed === 'body') return json(400, { error: 'body' });

            // El servidor purga las lápidas de más de 30 días con su propia hora.
            const limit = Date.now() - TOMBSTONE_MS;
            for (const [id, g] of Object.entries(parsed.games)) {
                if (g.deletedAt !== undefined && g.deletedAt < limit) delete parsed.games[id];
            }
            const body = JSON.stringify(parsed);
            const ifMatch = strongEtag(request.headers.get('if-match'));

            // Precondiciones explícitas (el `ifMatch` del almacén las repite de forma atómica):
            // crear solo si no existe; sobrescribir solo con el ETag leído.
            const existing = await readBlobText(PATH);
            if (!ifMatch && existing) { console.warn('sync: 412 crear con documento existente'); return json(412, { error: 'conflict' }); }
            if (ifMatch && (!existing || strongEtag(existing.etag) !== ifMatch)) {
                console.warn('sync: 412 precondición', JSON.stringify({ ifMatch, existing: existing?.etag ?? null }));
                return json(412, { error: 'conflict' });
            }

            // Versión previa como red de seguridad (mejor esfuerzo: si falla, no impide guardar).
            try {
                if (existing) {
                    await put(PREV_PATH, existing.text, {
                        access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', ...STORE,
                    });
                }
            } catch (e) { console.warn('sync: no se pudo guardar la versión previa', e instanceof Error ? e.message : e); }

            const written = await put(PATH, body, {
                access: 'private', addRandomSuffix: false, contentType: 'application/json', ...STORE,
                // Al almacén se le pasa el ETag en su forma fuerte: `get` puede devolverlo débil
                // (`W/"..."`), pero la precondición de `put` se compara con la forma fuerte.
                ...(existing && ifMatch ? { allowOverwrite: true, ifMatch: strongEtag(existing.etag) ?? ifMatch } : { allowOverwrite: false }),
            });
            const etag = (written as { etag?: string }).etag ?? (await head(PATH, STORE)).etag;
            return json(200, { etag }, { ETag: etag });
        } catch (error) {
            // Otro aparato escribió antes, o la creación chocó con un documento ya existente.
            if (error instanceof BlobPreconditionFailedError) { console.warn('sync: 412 del almacén', error.message); return json(412, { error: 'conflict' }); }
            const message = error instanceof Error ? error.message : '';
            // Dos escrituras condicionales simultáneas: el almacén rechaza a la perdedora con
            // "conflicting operation" (comprobado en la fase 2b), que es también un choque.
            if (/already exists|conflicting operation/i.test(message)) return json(412, { error: 'conflict' });
            // Solo nombre y mensaje del error: nunca el contenido de las partidas.
            console.error('sync: error del servidor', error instanceof Error ? `${error.name}: ${message}` : String(error));
            return json(500, { error: 'server' });
        }
    },
};
