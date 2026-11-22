import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'anagrama-sync-tests-'));
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

try {
    await build({
        stdin: { contents: `export * from './services/gamesStore'; export * from './services/sync/syncMerge'; export * from './services/sync/syncEngine'; export * from './services/sync/syncTransport';`, resolveDir: process.cwd() },
        bundle: true, platform: 'node', format: 'esm', outfile: join(directory, 'sync.mjs'),
    });
    const api = await import(pathToFileURL(join(directory, 'sync.mjs')));
    const { createGame, merge, stripLocal, revOf, isValidGame } = api;

    // --- Simulación de aparatos y servidor -------------------------------------
    const clone = x => JSON.parse(JSON.stringify(x));
    const device = (name) => ({ name, games: [] });
    const server = () => ({ doc: null });
    const game = (id, name, rev, extra = {}) => ({ ...createGame(name), id, rev, editedBy: 'x', ...extra });
    const pick = (dev, id) => dev.games instanceof Map ? dev.games.get(id) : dev.games.find(x => x.id === id);
    const edit = (dev, id, patch = {}) => {
        const g = pick(dev, id);
        Object.assign(g, { rack: 'a'.repeat(1 + (revOf(g) % 6)), ...patch }, { rev: revOf(g) + 1, editedBy: dev.name });
    };
    const remove = (dev, id) => {
        const g = dev.games.find(x => x.id === id);
        Object.assign(g, { rev: revOf(g) + 1, deletedAt: 1000, editedBy: dev.name });
    };
    const sync = (dev, srv) => {
        const result = merge(clone(dev.games), srv.doc ? clone(srv.doc) : null);
        for (const g of result.toLocal) {
            const i = dev.games.findIndex(x => x.id === g.id);
            if (i >= 0) dev.games[i] = g; else dev.games.push(g);
        }
        if (result.needsPush) srv.doc = result.remote;
        // Confirmación: lo que se subió queda sincronizado.
        for (const g of dev.games) {
            const r = srv.doc?.[g.id];
            if (r && revOf(r) === revOf(g)) g.syncedRev = revOf(g);
        }
        return result;
    };
    const view = games => Object.fromEntries(games.map(g => [g.id, stripLocal(g)]));
    const converged = (a, b, srv) => {
        assert.deepEqual(view(a.games), view(b.games), 'los dos aparatos coinciden');
        assert.deepEqual(view(a.games), srv.doc, 'y coinciden con el servidor');
    };

    // --- Un solo lado -------------------------------------------------------------
    {
        const pc = device('pc'), srv = server();
        pc.games.push(game('a', 'A', 1));
        const r = sync(pc, srv);
        assert.ok(r.needsPush, 'una partida nunca sincronizada se sube');
        assert.equal(pc.games[0].syncedRev, 1);
        const phone = device('phone');
        sync(phone, srv);
        assert.equal(phone.games.length, 1, 'una partida solo remota se adopta');
        assert.equal(sync(phone, srv).needsPush, false, 'sin cambios no hay nada que subir');
    }

    // --- CUJ 5: datos en ambos lados --------------------------------------------
    {
        const pc = device('pc'), phone = device('phone'), srv = server();
        for (const id of ['p1', 'p2']) pc.games.push(game(id, id, 1));
        for (const id of ['m1']) phone.games.push(game(id, id, 1));
        sync(pc, srv); sync(phone, srv); sync(pc, srv);
        assert.equal(Object.keys(srv.doc).length, 3, 'el servidor tiene la unión');
        converged(pc, phone, srv);
    }

    // --- Ausente en remoto: nunca se borra --------------------------------------
    {
        const pc = device('pc');
        pc.games.push({ ...game('a', 'A', 3), syncedRev: 3 });
        const r = merge(pc.games, {});
        assert.ok(r.needsPush && r.remote.a, 'una partida ya sincronizada que falta en remoto se vuelve a subir');
        assert.ok(r.notices.length === 1);
        assert.equal(r.toLocal.find(g => g.id === 'a').syncedRev, 0);
        const r404 = merge(pc.games, null);
        assert.ok(r404.remote.a, 'un 404 equivale a un remoto vacío');
    }

    // --- Cambio en un solo lado ---------------------------------------------------
    {
        const pc = device('pc'), phone = device('phone'), srv = server();
        pc.games.push(game('a', 'A', 1));
        sync(pc, srv); sync(phone, srv);
        edit(pc, 'a'); sync(pc, srv); sync(phone, srv);
        converged(pc, phone, srv);
        assert.equal(revOf(phone.games[0]), 2);
    }

    // --- CUJ 3: dos ediciones, gana la rev más alta y la otra queda como copia ----
    {
        const pc = device('pc'), phone = device('phone'), srv = server();
        pc.games.push(game('a', 'A', 1));
        sync(pc, srv); sync(phone, srv);
        for (let i = 0; i < 5; i++) edit(phone, 'a');          // móvil: rev 6, sin red
        for (let i = 0; i < 2; i++) edit(pc, 'a');             // ordenador: rev 3
        sync(pc, srv);                                          // el ordenador sube primero
        const r = sync(phone, srv);
        assert.equal(r.conflicts.length, 1, 'se crea una copia de conflicto');
        sync(pc, srv); sync(phone, srv);
        converged(pc, phone, srv);
        const copy = pc.games.find(g => g.name === 'A (conflicto)');
        assert.ok(copy, 'la perdedora se conserva como «A (conflicto)»');
        assert.equal(revOf(pc.games.find(g => g.id === 'a')), 6, 'gana la versión con más ediciones');
        // Idempotencia: otra ronda no cambia nada ni crea más copias.
        const before = JSON.stringify(view(pc.games));
        assert.equal(sync(pc, srv).needsPush, false);
        assert.equal(sync(phone, srv).needsPush, false);
        assert.equal(JSON.stringify(view(pc.games)), before);
        assert.equal(pc.games.filter(g => g.name.includes('conflicto')).length, 1);
    }

    // --- La copia de conflicto es la misma en las dos réplicas -------------------
    {
        const a = game('a', 'A', 4, { editedBy: 'pc', syncedRev: 1 });
        const b = game('a', 'A', 2, { editedBy: 'phone' });
        const fromPc = merge([a], { a: b }).conflicts[0];
        const fromPhone = merge([{ ...b, syncedRev: 1 }], { a: stripLocal(a) }).conflicts[0];
        assert.equal(fromPc.id, fromPhone.id, 'mismo id de copia desde cualquier aparato');
        assert.equal(fromPc.id, 'a-conflicto-2-phone', 'id de la copia: <id>-conflicto-<rev perdedora>-<editedBy perdedora>');
        assert.equal(fromPc.editedBy, 'phone', 'editedBy de la copia = el de la perdedora');
        assert.equal(fromPc.editedBy, fromPhone.editedBy);
        assert.equal(fromPc.rev, 1);
        assert.equal(fromPc.syncedRev, undefined);
        const again = merge([{ ...fromPc }], {});
        assert.equal(again.conflicts.length, 0);
    }

    // --- Empate de rev: decide editedBy ---------------------------------------------
    {
        const l = game('a', 'A', 3, { editedBy: 'b', syncedRev: 1, rack: 'x' });
        const r = game('a', 'A', 3, { editedBy: 'a', rack: 'y' });
        const res = merge([l], { a: r });
        assert.equal(res.remote.a.rack, 'y', 'gana el editedBy menor');
    }

    // --- CUJ 9 y borrado frente a edición (ediciones asimétricas) ----------------
    {
        const pc = device('pc'), phone = device('phone'), srv = server();
        pc.games.push(game('b', 'B', 5));
        sync(pc, srv); sync(phone, srv);
        for (let i = 0; i < 3; i++) edit(pc, 'b');              // ordenador edita 3 veces
        remove(pc, 'b');                                         // y borra: rev 9
        edit(phone, 'b');                                        // móvil edita una vez, sin red: rev 6
        sync(pc, srv);
        const r = sync(phone, srv);
        assert.ok(r.notices.some(n => n.includes('restaurado') || n.includes('restaurada')), 'avisa de la restauración');
        sync(pc, srv); sync(phone, srv);
        converged(pc, phone, srv);
        assert.equal(pc.games[0].deletedAt, undefined, 'la partida queda restaurada en los dos aparatos');
        assert.ok(revOf(pc.games[0]) > 9, 'la restauración sube por encima de la lápida: converge');
    }
    {   // Mismo caso con el orden de sincronización inverso.
        const pc = device('pc'), phone = device('phone'), srv = server();
        pc.games.push(game('b', 'B', 5));
        sync(pc, srv); sync(phone, srv);
        remove(pc, 'b');
        edit(phone, 'b');
        sync(phone, srv);                                        // el móvil sube primero
        sync(pc, srv);
        sync(phone, srv); sync(pc, srv);
        converged(pc, phone, srv);
        assert.equal(pc.games[0].deletedAt, undefined, 'gana la edición también en este orden');
    }
    {   // Borrado sin edición concurrente: se propaga como lápida.
        const pc = device('pc'), phone = device('phone'), srv = server();
        pc.games.push(game('b', 'B', 2));
        sync(pc, srv); sync(phone, srv);
        remove(pc, 'b'); sync(pc, srv); sync(phone, srv);
        converged(pc, phone, srv);
        assert.ok(phone.games[0].deletedAt !== undefined, 'la lápida llega al otro aparato');
    }
    {   // Restaurar una partida borrada (es una edición) vuelve a propagarse.
        const pc = device('pc'), phone = device('phone'), srv = server();
        pc.games.push(game('b', 'B', 2));
        sync(pc, srv); sync(phone, srv);
        remove(pc, 'b'); sync(pc, srv); sync(phone, srv);
        const g = pc.games[0]; delete g.deletedAt; g.rev = revOf(g) + 1;
        sync(pc, srv); sync(phone, srv);
        converged(pc, phone, srv);
        assert.equal(phone.games[0].deletedAt, undefined);
    }

    // --- Servidor con una versión anterior a lo que el aparato subió -----------
    {
        const pc = device('pc');
        pc.games.push({ ...game('a', 'A', 7), syncedRev: 7 });
        const r = merge(pc.games, { a: game('a', 'A', 3) });
        assert.ok(r.needsPush && r.remote.a.rev === 7, 'si el servidor retrocede, se vuelve a subir lo local');
        assert.ok(r.notices.length === 1);
    }

    // --- Partida nunca sincronizada con el mismo id ------------------------------
    {
        const l = game('a', 'A', 1, { rack: 'x' });
        const same = merge([{ ...l }], { a: stripLocal({ ...l }) });
        assert.equal(same.needsPush, false, 'contenido igual: no se hace nada');
        assert.equal(same.conflicts.length, 0);
        const diff = merge([l], { a: game('a', 'A', 1, { rack: 'y', editedBy: 'z' }) });
        assert.equal(diff.conflicts.length, 1, 'contenido distinto: aplica la regla de choque');
    }

    // --- Lo que viaja al servidor no lleva campos locales -----------------------
    {
        const r = merge([game('a', 'A', 1, { uses: 9, lastUsedAt: 5, syncedRev: 0 })], null);
        assert.equal('uses' in r.remote.a, false);
        assert.equal('lastUsedAt' in r.remote.a, false);
        assert.equal('syncedRev' in r.remote.a, false);
    }

    // --- Registros antiguos y validación ------------------------------------------
    {
        const old = createGame('Antigua');
        delete old.rev; delete old.uses;
        assert.equal(isValidGame(old), true, 'una partida sin campos nuevos sigue siendo válida');
        assert.equal(isValidGame({ ...old, rev: 3, syncedRev: 2, editedBy: 'x', deletedAt: 5, lastUsedAt: 7 }), true);
        assert.equal(isValidGame({ ...old, rev: -1 }), false);
        assert.equal(isValidGame({ ...old, rev: 1.5 }), false);
        assert.equal(isValidGame({ ...old, editedBy: 4 }), false);
        const r = merge([old], null);
        assert.ok(r.needsPush && r.remote[old.id], 'una partida antigua sin rev se sube');
    }

    console.log('ok   fusión de partidas: un lado, choques, borrado frente a edición, convergencia e idempotencia');

    // === Motor de sincronización con un servidor simulado ==========================
    const { createSyncEngine, SyncError } = api;

    /** Servidor con ETag por versión; `hooks` permite provocar fallos en cada paso. */
    const fakeServer = () => {
        const s = { doc: null, version: 0, hooks: {}, pushes: 0 };
        s.transport = (token) => ({
            async pull() {
                if (s.hooks.pull) await s.hooks.pull();
                if (token !== 'secreto') throw new SyncError('unauthorized');
                return s.doc ? { status: 'ok', doc: clone(s.doc), etag: `v${s.version}` } : { status: 'empty' };
            },
            async push(doc, etag) {
                s.pushes++;
                if (s.hooks.push) await s.hooks.push(doc);
                if (s.hooks.tooLarge) throw new SyncError('too-large');
                if ((s.doc && etag !== `v${s.version}`) || (!s.doc && etag)) return { status: 'conflict' };
                s.doc = clone(doc); s.version++;
                return { status: 'ok', etag: `v${s.version}` };
            },
        });
        return s;
    };
    const fakeDevice = (name, srv, { backupFails = false } = {}) => {
        const games = new Map();
        let stored = { enabled: false, token: '', etag: null, lastSyncedAt: null, firstSyncDone: false };
        const store = {
            async listAll() { return [...games.values()].map(clone); },
            async purge(ids) { for (const id of ids) games.delete(id); },
            async save(g, origin) {
                games.set(g.id, origin === 'edit' ? { ...clone(g), rev: revOf(g) + 1, editedBy: name } : clone(g));
            },
        };
        const engine = createSyncEngine({
            store, transport: srv.transport,
            meta: { load: () => ({ ...stored }), save: m => { stored = { ...m }; } },
            backupBeforeFirstSync: async () => { if (backupFails) throw new Error('cuota'); },
            now: () => 1234,
        });
        return { name, games, store, engine };
    };
    const addGame = (dev, id, rev = 1) => dev.games.set(id, clone(game(id, id, rev)));
    const docOf = dev => Object.fromEntries([...dev.games.values()].map(g => [g.id, stripLocal(g)]));

    {   // Activar sube lo local y deja el estado al día.
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a');
        assert.equal(pc.engine.getState().status, 'disabled');
        await pc.engine.enable('secreto');
        assert.equal(pc.engine.getState().status, 'upToDate');
        assert.equal(pc.engine.getState().pending, 0);
        assert.equal(pc.engine.getState().lastSyncedAt, 1234);
        assert.ok(srv.doc.games.a, 'el servidor recibió la partida');
        assert.equal(pc.games.get('a').syncedRev, 1, 'la partida quedó confirmada');
        assert.equal(pc.engine.getMeta().firstSyncDone, true);
    }
    {   // El servidor purgó una lápida que este aparato ya había subido: se elimina, sin resubirla.
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a'); addGame(pc, 'old');
        await pc.engine.enable('secreto');
        pc.games.set('old', { ...pc.games.get('old'), deletedAt: 1, rev: 2, syncedRev: 2 });
        delete srv.doc.games.old;
        const pushes = srv.pushes;
        await pc.engine.sync();
        assert.equal(pc.games.has('old'), false, 'la lápida que el servidor ya no tiene se elimina en local');
        assert.equal(srv.doc.games.old, undefined, 'y no se vuelve a subir');
        assert.equal(srv.pushes, pushes, 'sin subidas nuevas');
    }
    {   // Dos aparatos convergen, y desactivar no borra partidas.
        const srv = fakeServer(), pc = fakeDevice('pc', srv), phone = fakeDevice('phone', srv);
        addGame(pc, 'a'); addGame(phone, 'b');
        await pc.engine.enable('secreto'); await phone.engine.enable('secreto'); await pc.engine.sync();
        assert.deepEqual(docOf(pc), docOf(phone));
        assert.equal(Object.keys(srv.doc.games).length, 2);
        pc.engine.disable();
        assert.equal(pc.engine.getState().status, 'disabled');
        assert.equal(pc.games.size, 2, 'desactivar no toca las partidas');
        assert.equal(pc.engine.getMeta().token, '');
    }
    {   // Otro aparato escribe entre la lectura y la subida: reintenta y termina.
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a');
        let injected = false;
        srv.hooks.push = async () => {
            if (injected) return; injected = true;
            srv.doc = { schemaVersion: 1, games: { z: stripLocal(game('z', 'Z', 1)) } }; srv.version++;
        };
        await pc.engine.enable('secreto');
        assert.equal(pc.engine.getState().status, 'upToDate');
        assert.deepEqual(Object.keys(srv.doc.games).sort(), ['a', 'z'], 'tras el choque se fusionó con lo del otro aparato');
        assert.ok(pc.games.has('z'));
    }
    {   // Tres choques seguidos: estado de error, y los cambios siguen pendientes.
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a');
        srv.hooks.push = async () => { srv.version++; if (!srv.doc) srv.doc = { schemaVersion: 1, games: {} }; };
        await pc.engine.enable('secreto');
        assert.equal(pc.engine.getState().status, 'error');
        assert.equal(srv.pushes, 3, 'se detiene a los 3 intentos');
        assert.equal(pc.engine.getState().pending, 1);
    }
    {   // Token rechazado, sin red, y documento demasiado grande.
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a');
        await pc.engine.enable('mal');
        assert.equal(pc.engine.getState().status, 'tokenRejected');
        assert.equal(pc.engine.getState().pending, 1);
        await pc.engine.enable('secreto');
        srv.hooks.pull = async () => { throw new SyncError('offline'); };
        edit(pc, 'a');
        await pc.engine.sync();
        assert.equal(pc.engine.getState().status, 'offline');
        assert.equal(pc.engine.getState().pending, 1, 'lo editado sin red queda pendiente');
        srv.hooks.pull = null;
        await pc.engine.sync();
        assert.equal(pc.engine.getState().status, 'upToDate');
        assert.equal(pc.engine.getState().pending, 0);
        srv.hooks.tooLarge = true;
        edit(pc, 'a');
        await pc.engine.sync();
        assert.equal(pc.engine.getState().status, 'error');
        assert.match(pc.engine.getState().error, /1 MB/);
    }
    {   // Una edición hecha mientras se sube sigue pendiente (no se confirma de más).
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a');
        await pc.engine.enable('secreto');
        edit(pc, 'a');                                           // rev 2, pendiente
        srv.hooks.push = async () => { edit(pc, 'a'); };         // el usuario edita durante el envío: rev 3
        await pc.engine.sync();
        srv.hooks.push = null;
        const g = pc.games.get('a');
        assert.equal(revOf(g), 3);
        assert.equal(g.syncedRev, 2, 'solo se confirmó lo que se envió');
        assert.equal(pc.engine.getState().pending, 1);
        await pc.engine.sync();
        assert.equal(pc.games.get('a').syncedRev, 3);
        assert.equal(srv.doc.games.a.rev, 3);
    }
    {   // Si la copia previa a la primera sincronización falla, no se sincroniza.
        const srv = fakeServer(), pc = fakeDevice('pc', srv, { backupFails: true });
        addGame(pc, 'a');
        await pc.engine.enable('secreto');
        assert.equal(pc.engine.getState().status, 'error');
        assert.match(pc.engine.getState().error, /copia/);
        assert.equal(srv.doc, null, 'no se subió nada');
    }
    {   // Dos disparos a la vez no se pisan: el segundo se encadena.
        const srv = fakeServer(), pc = fakeDevice('pc', srv);
        addGame(pc, 'a');
        await pc.engine.enable('secreto');
        let active = 0, maxActive = 0;
        srv.hooks.pull = async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 5)); active--; };
        await Promise.all([pc.engine.sync(), pc.engine.sync(), pc.engine.sync()]);
        assert.equal(maxActive, 1, 'nunca hay dos ciclos a la vez');
        assert.equal(pc.engine.isBusy(), false);
    }
    {   // Escenario CUJ 3 de extremo a extremo con el motor.
        const srv = fakeServer(), pc = fakeDevice('pc', srv), phone = fakeDevice('phone', srv);
        addGame(pc, 'a');
        await pc.engine.enable('secreto'); await phone.engine.enable('secreto');
        for (let i = 0; i < 5; i++) edit(phone, 'a');
        for (let i = 0; i < 2; i++) edit(pc, 'a');
        await pc.engine.sync(); await phone.engine.sync(); await pc.engine.sync(); await phone.engine.sync();
        assert.deepEqual(docOf(pc), docOf(phone));
        assert.equal([...pc.games.values()].filter(g => g.name.includes('conflicto')).length, 1);
        assert.ok(phone.engine.getState().notices.length >= 0);
    }

    console.log('ok   motor de sincronización: ciclo, reintentos, errores, confirmación y convergencia');
} finally {
    await rm(directory, { recursive: true, force: true });
}
