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
    const now = Date.now();
    const day = 86_400_000;
    const busy = { ...first, uses: 40, updatedAt: now };
    const abandoned = { ...first, id: 'a', uses: 40, updatedAt: now - 60 * day };
    const idle = { ...first, id: 'b', uses: 0, updatedAt: now - 20 * day };
    const order = api.sortByUsage([idle, abandoned, busy], now).map(g => g.id);
    assert.equal(order[0], busy.id, 'la partida muy usada y reciente va primero');
    assert.equal(order[2], 'a', 'la abandonada hace meses va a la cola aunque se jugara mucho');
    assert.ok(api.usageScore({ ...first, uses: 0, updatedAt: now }, now) > api.usageScore({ ...first, uses: 0, updatedAt: now - 30 * day }, now),
        'a igual actividad, la reciente pesa más');
    assert.ok(api.usageScore(idle, now) < api.usageScore({ ...first, uses: 1, updatedAt: now }, now),
        'una partida sin movimiento y vieja queda en la cola');
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
    // Revisiones y lápidas.
    const stored = () => api.listAllGames().then(all => all.find(g => g.id === first.id));
    const rev0 = (await stored()).rev;
    await api.saveGame({ ...updated, rack: 'otra' });
    assert.equal((await stored()).rev, rev0 + 1, 'una edición sube rev');
    assert.equal((await stored()).editedBy, api.getDeviceId(), 'y anota el aparato');
    await api.saveGame({ ...(await stored()), rack: 'abierta' }, 'usage');
    assert.equal((await stored()).rev, rev0 + 1, 'abrir una partida no sube rev');
    await api.saveGame({ ...(await stored()), syncedRev: 99 }, 'remote');
    assert.equal((await stored()).syncedRev, 99, 'un guardado remoto conserva syncedRev');
    await api.saveGame({ ...(await stored()), syncedRev: 1, rack: 'sinsync' });
    assert.equal((await stored()).syncedRev, 99, 'una edición con una copia desfasada no pisa syncedRev');
    const tomb = api.createGame('Para borrar');
    await api.saveGame(tomb);
    await api.deleteGame(tomb.id);
    assert.equal((await api.listGames()).some(g => g.id === tomb.id), false, 'borrar oculta la partida');
    assert.equal((await api.listDeletedGames()).some(g => g.id === tomb.id), true, 'y la deja en la papelera');
    assert.ok((await api.listAllGames()).find(g => g.id === tomb.id).board, 'la lápida conserva el contenido');
    await api.saveGame({ ...tomb, name: 'Restaurada' });
    assert.equal((await api.listGames()).some(g => g.id === tomb.id), true, 'guardar sin lápida la restaura');
    await api.deleteGame(tomb.id);
    await api.purgeDeleted(Date.now() + 31 * 86_400_000);
    assert.equal((await api.listAllGames()).some(g => g.id === tomb.id), false, 'la purga elimina lápidas de más de 30 días');
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
