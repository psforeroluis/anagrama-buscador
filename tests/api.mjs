// Contrato HTTP de api/sync.ts con un almacén Blob simulado en memoria (el almacén real
// se comprueba en la fase 2b). Verifica 401, 404, creación, 412, 413, 400, 405 y 304.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'anagrama-api-'));
try {
    const fakeBlob = `
        export class BlobPreconditionFailedError extends Error {}
        const files = new Map(); let version = 0;
        globalThis.__blobFiles = files;
        export const get = async path => {
            const f = files.get(path);
            return f ? { statusCode: 200, stream: new Blob([f.text]).stream(), blob: { etag: f.etag } } : null;
        };
        export const head = async path => ({ etag: files.get(path).etag });
        export const put = async (path, text, opts) => {
            const f = files.get(path);
            if (f && !opts.allowOverwrite) throw new Error('This blob already exists');
            if (f && opts.ifMatch && opts.ifMatch !== f.etag) throw new BlobPreconditionFailedError('stale');
            if (globalThis.__blobRace && path === 'anagrama-sync.json') { globalThis.__blobRace = false; throw new Error('Vercel Blob: The conditional request cannot succeed due to a conflicting operation against this resource.'); }
            const etag = '"v' + (++version) + '"';
            files.set(path, { text, etag });
            return { etag };
        };`;
    await build({
        entryPoints: ['api/sync.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(directory, 'sync.mjs'),
        plugins: [{ name: 'blob', setup: b => {
            b.onResolve({ filter: /^@vercel\/blob$/ }, () => ({ path: 'blob', namespace: 'fake' }));
            b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: fakeBlob, loader: 'js' }));
        } }],
    });
    process.env.SYNC_TOKEN = 'x'.repeat(40);
    const { default: handler } = await import(pathToFileURL(join(directory, 'sync.mjs')));
    const files = globalThis.__blobFiles;

    const call = (method, { token = process.env.SYNC_TOKEN, headers = {}, body } = {}) =>
        handler.fetch(new Request('http://x/api/sync', {
            method, body,
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        }));
    const game = (id, rev, extra = {}) => ({ id, name: id, rev, ...extra });
    const doc = (...games) => JSON.stringify({ schemaVersion: 1, games: Object.fromEntries(games.map(g => [g.id, g])) });

    assert.equal((await call('GET', { token: '' })).status, 401, 'sin token: 401');
    assert.equal((await call('GET', { token: 'otro' })).status, 401, 'token incorrecto: 401');
    assert.equal((await call('DELETE')).status, 405, 'otros métodos: 405');
    assert.equal((await call('GET')).status, 404, 'sin documento: 404');
    assert.equal((await call('PUT', { headers: { 'If-Match': '"v9"' }, body: doc(game('a', 1)) })).status, 412, 'If-Match sin documento: 412');

    let res = await call('PUT', { body: doc(game('a', 1)) });
    assert.equal(res.status, 200, 'creación');
    const etag1 = res.headers.get('ETag');
    assert.equal((await res.json()).etag, etag1, 'el cuerpo repite el ETag');
    assert.equal((await call('PUT', { body: doc(game('a', 2)) })).status, 412, 'sin If-Match con documento existente: 412');
    assert.equal((await call('PUT', { headers: { 'If-Match': '"viejo"' }, body: doc(game('a', 2)) })).status, 412, 'ETag viejo: 412');

    res = await call('GET');
    assert.equal(res.status, 200); assert.equal(res.headers.get('ETag'), etag1);
    assert.equal((await call('GET', { headers: { 'If-None-Match': etag1 } })).status, 304, 'If-None-Match igual: 304');

    assert.equal((await call('GET', { headers: { 'If-None-Match': `W/${etag1}` } })).status, 304, 'ETag débil (respuesta comprimida): 304');
    res = await call('PUT', { headers: { 'If-Match': `W/${etag1}` }, body: doc(game('a', 2)) });
    assert.equal(res.status, 200, 'sobrescritura con el ETag débil que devuelve la compresión');
    assert.ok(files.has('anagrama-sync.prev.json'), 'guarda la versión previa');
    assert.equal(JSON.parse(files.get('anagrama-sync.prev.json').text).games.a.rev, 1);
    assert.equal((await call('GET', { headers: { 'If-None-Match': etag1 } })).status, 200, 'con ETag viejo devuelve el documento');

    const etag2 = res.headers.get('ETag');
    assert.equal((await call('PUT', { headers: { 'If-Match': etag2 }, body: JSON.stringify({ schemaVersion: 2, games: {} }) })).status, 400);
    res = await call('PUT', { headers: { 'If-Match': etag2 }, body: JSON.stringify({ schemaVersion: 2, games: {} }) });
    assert.deepEqual(await res.json(), { error: 'schema' }, 'otro schemaVersion: 400 schema');
    res = await call('PUT', { headers: { 'If-Match': etag2 }, body: 'no es json' });
    assert.deepEqual(await res.json(), { error: 'body' }, 'cuerpo no válido: 400 body');
    res = await call('PUT', { headers: { 'If-Match': etag2 }, body: JSON.stringify({ schemaVersion: 1, games: { a: { id: 'a' } } }) });
    assert.deepEqual(await res.json(), { error: 'body' }, 'partida sin rev numérico: 400 body');

    const big = doc(game('a', 2, { pad: 'x'.repeat(1_100_000) }));
    assert.equal((await call('PUT', { headers: { 'If-Match': etag2 }, body: big })).status, 413, 'más de 1 MB: 413');
    assert.equal((await call('PUT', { headers: { 'If-Match': etag2, 'content-length': '2000000' }, body: doc(game('a', 2)) })).status, 413, 'content-length declarado de más de 1 MB: 413');

    // Dos escrituras simultáneas: el almacén rechaza a la perdedora con "conflicting operation" y es un 412.
    globalThis.__blobRace = true;
    res = await call('PUT', { headers: { 'If-Match': etag2 }, body: doc(game('a', 2)) });
    assert.equal(res.status, 412, 'escritura simultánea perdida: 412');
    globalThis.__blobRace = false;

    // Las lápidas de más de 30 días se purgan al escribir.
    const old = Date.now() - 31 * 86_400_000;
    res = await call('PUT', { headers: { 'If-Match': etag2 }, body: doc(game('a', 3), game('b', 1, { deletedAt: old }), game('c', 1, { deletedAt: Date.now() })) });
    assert.equal(res.status, 200);
    const stored = JSON.parse(files.get('anagrama-sync.json').text).games;
    assert.deepEqual(Object.keys(stored).sort(), ['a', 'c'], 'se purga la lápida vencida y se conserva la reciente');
    console.log('ok   api/sync: autenticación, ETag, 304, 412, 413, 400, 405, versión previa y purga');
} finally {
    await rm(directory, { recursive: true, force: true });
}
