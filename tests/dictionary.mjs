import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const maintenance = JSON.parse(readFileSync(new URL('data/dictionary-maintenance-2026-09-06.json', root), 'utf8'));
let response;
const context = vm.createContext({ self: { postMessage: message => { response = message; } }, console });
vm.runInContext(readFileSync(new URL('public/services/anagramSolver.ts', root), 'utf8'), context);
context.self.onmessage({ data: {
    type: 'init',
    dictionaryText: readFileSync(new URL('public/services/dictionary.txt', root), 'utf8'),
} });

const unknown = words => {
    context.self.onmessage({ data: { type: 'checkWords', payload: { words } } });
    assert.equal(response.type, 'checkWords');
    return [...response.unknown];
};

assert.deepEqual(unknown(maintenance.additions), [], 'todas las altas confirmadas deben estar disponibles');
assert.deepEqual(unknown(maintenance.removals), maintenance.removals,
    'ninguna baja confirmada debe aparecer en el diccionario del motor');
assert.deepEqual(unknown(maintenance.pending), maintenance.pending,
    'las palabras sin validar siguen pendientes');
console.log(`ok   diccionario: ${maintenance.additions.length} altas, ${maintenance.removals.length} bajas y ${maintenance.pending.length} pendiente`);
