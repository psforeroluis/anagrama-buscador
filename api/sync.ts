// Función serverless de Vercel: guarda las partidas de un único usuario en un solo
// documento JSON de Vercel Blob (privado), con escritura condicional por ETag.
//
//   GET  /api/sync  -> 200 con el documento y su ETag, 404 si aún no existe
//   PUT  /api/sync  -> exige If-Match con el ETag leído (o ninguno para crear)
//                      200 con el ETag nuevo | 412 si otro aparato escribió antes
//                      413 si pesa más de 1 MB | 400 si el documento no es válido
//
// Variables de entorno: SYNC_TOKEN (token personal) y las del almacén Blob
// (BLOB_READ_WRITE_TOKEN, que Vercel define al conectar el almacén al proyecto).

import { timingSafeEqual } from 'node:crypto';
import { BlobPreconditionFailedError, get, head, put } from '@vercel/blob';

const PATH = 'anagrama-sync.json';
const PREV_PATH = 'anagrama-sync.prev.json';
const MAX_BYTES = 1_048_576;
const SCHEMA_VERSION = 1;
const TOMBSTONE_MS = 30 * 86_400_000;

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

interface RemoteGame { id: string; deletedAt?: number }

/** Valida la forma del documento sin entrar en el contenido de cada tablero. */
const parseDoc = (text: string): { schemaVersion: number; games: Record<string, RemoteGame> } | 'schema' | 'invalid' => {
    let doc: unknown;
    try { doc = JSON.parse(text); } catch { return 'invalid'; }
    if (!doc || typeof doc !== 'object') return 'invalid';
    const d = doc as { schemaVersion?: unknown; games?: unknown };
    if (d.schemaVersion !== SCHEMA_VERSION) return 'schema';
    if (!d.games || typeof d.games !== 'object' || Array.isArray(d.games)) return 'invalid';
    for (const [key, g] of Object.entries(d.games as Record<string, RemoteGame>)) {
        if (!g || typeof g !== 'object' || g.id !== key) return 'invalid';
        if (g.deletedAt !== undefined && !Number.isFinite(g.deletedAt)) return 'invalid';
    }
    return d as { schemaVersion: number; games: Record<string, RemoteGame> };
};

const readBlobText = async (path: string): Promise<{ text: string; etag: string } | null> => {
    const result = await get(path, { access: 'private', useCache: false });
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
                return new Response(current.text, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ETag: current.etag },
                });
            }

            const text = await request.text();
            if (new TextEncoder().encode(text).length > MAX_BYTES) return json(413, { error: 'too-large' });
            const parsed = parseDoc(text);
            if (parsed === 'schema') return json(400, { error: 'schema' });
            if (parsed === 'invalid') return json(400, { error: 'invalid' });

            // El servidor purga las lápidas de más de 30 días con su propia hora.
            const limit = Date.now() - TOMBSTONE_MS;
            for (const [id, g] of Object.entries(parsed.games)) {
                if (g.deletedAt !== undefined && g.deletedAt < limit) delete parsed.games[id];
            }
            const body = JSON.stringify(parsed);
            const ifMatch = request.headers.get('if-match');

            // Versión previa como red de seguridad (mejor esfuerzo: si falla, no impide guardar).
            try {
                const previous = await readBlobText(PATH);
                if (previous) {
                    await put(PREV_PATH, previous.text, {
                        access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json',
                    });
                }
            } catch { /* sin versión previa */ }

            const written = await put(PATH, body, {
                access: 'private', addRandomSuffix: false, contentType: 'application/json',
                ...(ifMatch ? { allowOverwrite: true, ifMatch } : { allowOverwrite: false }),
            });
            const etag = (written as { etag?: string }).etag ?? (await head(PATH)).etag;
            return json(200, { ok: true }, { ETag: etag });
        } catch (error) {
            // Otro aparato escribió antes, o la creación chocó con un documento ya existente.
            // Lo segundo no está verificado contra el SDK real (ver la prueba de la fase 2b).
            if (error instanceof BlobPreconditionFailedError) return json(412, { error: 'conflict' });
            const message = error instanceof Error ? error.message : '';
            if (/already exists/i.test(message)) return json(412, { error: 'conflict' });
            return json(500, { error: 'server' });
        }
    },
};
