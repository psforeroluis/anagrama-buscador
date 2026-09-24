import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'anagrama-tests-'));
const values = new Map();
let denyWrites = false;
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (denyWrites) throw new Error('sin cuota'); values.set(key, value); },
    removeItem: key => values.delete(key),
};
try {
    // Un único bundle comparte el estado de persistencia entre copias y partidas.
    await build({ stdin: { contents: `export * from './services/gamesStore'; export * from './services/backup';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(directory, 'services.mjs') });
    const api = await import(pathToFileURL(join(directory, 'services.mjs')));
    const first = api.createGame('Primera');
    const second = api.createGame('Segunda');
    await Promise.all([api.saveGame(first), api.saveGame(second)]);
    assert.equal((await api.listGames()).length, 2, 'las escrituras simultáneas conservan ambas partidas');
    const updated = { ...first, rack: 'casa', blanks: 1 };
    await Promise.all([api.saveGame({ ...first, rack: 'ca' }), api.saveGame(updated)]);
    assert.equal((await api.listGames()).find(g => g.id === first.id).rack, 'casa');
    const backup = game => JSON.stringify({ format: 'anagrama-backup', version: 1, games: [game] });
    assert.equal(api.isValidGame({ ...first, board: { ...first.board, letters: ['x'.repeat(15), ...first.board.letters.slice(1)] } }), true);
    assert.equal(api.isValidGame({ ...first, board: { ...first.board, letters: ['!'.repeat(15), ...first.board.letters.slice(1)] } }), false,
        'un tablero importado no admite símbolos ajenos al juego');
    assert.equal(api.isValidGame({ ...first, board: { ...first.board, blanks: ['1' + '0'.repeat(14), ...first.board.blanks.slice(1)] } }), false,
        'un comodín importado debe ocupar una casilla con letra');
    assert.equal((await api.restoreBackup(backup(updated))).games, 0, 'una copia idéntica no se duplica');
    assert.equal((await api.restoreBackup(backup({ ...updated, rack: 'sol' }))).games, 1, 'conserva un atril distinto');
    assert.equal((await api.restoreBackup(backup({ ...updated, blanks: 2 }))).games, 1, 'conserva comodines distintos');
    denyWrites = true;
    await assert.rejects(api.saveGame({ ...updated, rack: 'fallo' }), /sin cuota/, 'el error de guardado llega al consumidor');
    denyWrites = false;
    await api.saveGame({ ...updated, rack: 'recuperado' });
    assert.equal((await api.listGames()).find(g => g.id === first.id).rack, 'recuperado', 'la cola sigue funcionando tras un error');
    await api.deleteGame(second.id);
    assert.equal((await api.listGames()).some(g => g.id === second.id), false);
    values.clear();
    globalThis.indexedDB = { open() {
        const request = {};
        queueMicrotask(() => {
            request.result = { transaction() {
                const transaction = { objectStore: () => ({
                    getAll() {
                        const read = {};
                        queueMicrotask(() => { read.result = [first, second]; read.onsuccess(); transaction.oncomplete(); });
                        return read;
                    },
                    put() {
                        const write = {};
                        queueMicrotask(() => { write.error = new Error('IndexedDB no disponible'); write.onerror(); });
                        return write;
                    },
                }) };
                return transaction;
            } };
            request.onsuccess();
        });
        return request;
    } };
    const primary = await import(pathToFileURL(join(directory, 'services.mjs')).href + '?primary');
    assert.equal((await primary.listGames()).length, 2);
    await primary.saveGame(updated);
    assert.equal((await primary.listGames()).length, 2, 'al fallar IndexedDB el respaldo conserva las otras partidas');
    const reloaded = await import(pathToFileURL(join(directory, 'services.mjs')).href + '?reloaded');
    assert.equal((await reloaded.listGames()).find(g => g.id === first.id).rack, 'casa', 'al recargar se conserva el respaldo más reciente');
    console.log('ok   persistencia: concurrencia, última edición, copias, errores y recuperación');
} finally {
    await rm(directory, { recursive: true, force: true });
}
