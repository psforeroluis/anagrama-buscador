// Copia de seguridad en un único fichero .json: partidas, palabras vetadas,
// candidatas de diccionario y plantillas de letras aprendidas. Sirve para no
// perder los tableros al cambiar de navegador o de móvil.

import { Game, isValidGame, listGames, saveGame } from './gamesStore';
import { loadBlocked, saveBlocked } from './wordBlocklist';
import { exportTemplates, importTemplates } from './glyphStore';
import { loadCandidates, saveCandidates } from './wordCandidates';

const FORMAT = 'anagrama-backup';
const VERSION = 1;

interface Backup {
    format: string;
    version: number;
    exportedAt: string;
    games: Game[];
    blocked: string[];
    glyphs: { letter: string; bits: string }[];
    candidates?: string[];
}

export interface ImportSummary {
    games: number;
    gamesRenamed: number;
    blocked: number;
    glyphs: number;
    candidates: number;
}

export const buildBackup = async (): Promise<Backup> => ({
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    games: await listGames(),
    blocked: loadBlocked(),
    glyphs: await exportTemplates(),
    candidates: loadCandidates(),
});

/** Descarga la copia como fichero. */
export const downloadBackup = async (): Promise<string> => {
    const backup = await buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `anagrama-partidas-${stamp}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Damos margen a que el navegador arranque la descarga antes de soltar la URL.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return filename;
};

/**
 * Restaura una copia SIN borrar lo que ya tienes: las partidas se añaden y, si
 * una viene con un id que ya existe pero es otra partida, se le da uno nuevo.
 * Perder tableros por importar es justo lo que esto viene a evitar.
 */
export const restoreBackup = async (json: string): Promise<ImportSummary> => {
    let parsed: Backup;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error('El fichero no es un JSON válido.');
    }
    if (!parsed || parsed.format !== FORMAT) {
        throw new Error('Ese fichero no es una copia de Anagrama.');
    }
    if (typeof parsed.version !== 'number' || parsed.version > VERSION) {
        throw new Error('La copia es de una versión más nueva de la app.');
    }
    if (!Array.isArray(parsed.games)) {
        throw new Error('La copia no contiene una lista de partidas válida.');
    }

    const summary: ImportSummary = { games: 0, gamesRenamed: 0, blocked: 0, glyphs: 0, candidates: 0 };

    const existing = await listGames();
    const existingById = new Map(existing.map(g => [g.id, g]));
    const usedNames = new Set(existing.map(g => g.name));
    const signature = (g: Game) => g.board.letters.join('') + '|' + g.board.blanks.join('');

    for (const game of parsed.games ?? []) {
        if (!isValidGame(game)) continue;

        const clash = existingById.get(game.id);
        // Mismo id y mismo tablero: es la misma partida, no la duplicamos.
        if (clash && signature(clash) === signature(game)) continue;

        // Dos partidas con el mismo nombre en la lista no hay quien las
        // distinga, así que la que llega se marca como importada.
        let name = game.name;
        if (usedNames.has(name)) {
            name = `${game.name} (importada)`;
            let n = 2;
            while (usedNames.has(name)) name = `${game.name} (importada ${n++})`;
            summary.gamesRenamed++;
        }
        usedNames.add(name);

        const record: Game = clash
            ? { ...game, name, id: `${game.id}-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
            : { ...game, name };

        await saveGame(record);
        summary.games++;
    }

    if (Array.isArray(parsed.blocked)) {
        const before = loadBlocked();
        const merged = Array.from(new Set([...before, ...parsed.blocked.filter(w => typeof w === 'string')]));
        saveBlocked(merged);
        summary.blocked = merged.length - before.length;
    }

    if (Array.isArray(parsed.glyphs)) {
        summary.glyphs = await importTemplates(parsed.glyphs);
    }

    if (Array.isArray(parsed.candidates)) {
        const before = loadCandidates();
        const merged = saveCandidates([...before, ...parsed.candidates.filter(w => typeof w === 'string')]);
        summary.candidates = merged.length - before.length;
    }

    return summary;
};
