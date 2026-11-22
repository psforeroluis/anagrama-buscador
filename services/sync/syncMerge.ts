// Fusión de partidas entre el aparato y el servidor. Función pura: no usa red,
// almacenamiento ni relojes. El servidor es quien purga las lápidas vencidas.
//
// Reglas (ver docs/designs/anagrama-sync-y-uso-movil.md):
//  - Una partida tiene cambios pendientes si nunca se sincronizó o `rev > syncedRev`.
//  - Si solo cambió un lado, gana ese lado.
//  - Si cambiaron los dos: borrado frente a edición, gana la edición; dos ediciones,
//    gana la `rev` más alta (empate: `editedBy` menor) y la perdedora se conserva
//    como "Nombre (conflicto)" con id determinista (cadena).
//  - Nunca se borra una partida local por no estar en el servidor.

import type { Game } from '../gamesStore';

export type RemoteGames = Record<string, Game>;

export interface MergeResult {
    /** Partidas que hay que guardar en local con origen `remote`. */
    toLocal: Game[];
    /** Documento remoto resultante (todas las partidas, ya fusionadas). */
    remote: RemoteGames;
    /** ¿Hay algo que subir al servidor? */
    needsPush: boolean;
    /** Copias "(conflicto)" creadas (ya incluidas en toLocal y en remote). */
    conflicts: Game[];
    /** Avisos para el usuario. */
    notices: string[];
}

const CONFLICT_SUFFIX = ' (conflicto)';

export const revOf = (g: Game): number => g.rev ?? 1;

/** Campos que nunca viajan al servidor. */
export const stripLocal = (g: Game): Game => {
    const { syncedRev, uses, lastUsedAt, ...rest } = g;
    void syncedRev; void uses; void lastUsedAt;
    return rest as Game;
};

export const hasPending = (g: Game): boolean =>
    g.syncedRev === undefined || revOf(g) > g.syncedRev;

const sameContent = (a: Game, b: Game): boolean =>
    a.name === b.name && a.rack === b.rack && a.blanks === b.blanks
    && a.deletedAt === b.deletedAt
    && a.board.letters.join('|') === b.board.letters.join('|')
    && a.board.blanks.join('|') === b.board.blanks.join('|');

/** Gana la `rev` más alta; empate: `editedBy` menor; último recurso: orden de texto del contenido. */
const winner = (a: Game, b: Game): Game => {
    if (revOf(a) !== revOf(b)) return revOf(a) > revOf(b) ? a : b;
    const ea = a.editedBy ?? '', eb = b.editedBy ?? '';
    if (ea !== eb) return ea < eb ? a : b;
    return JSON.stringify(stripLocal(a)) <= JSON.stringify(stripLocal(b)) ? a : b;
};

const makeConflictCopy = (loser: Game): Game => {
    const base = loser.name.endsWith(CONFLICT_SUFFIX)
        ? loser.name
        : `${loser.name}${CONFLICT_SUFFIX}`;
    const { syncedRev, deletedAt, ...rest } = loser;
    void syncedRev; void deletedAt;
    // Id y `editedBy` son cadenas derivadas de la perdedora: dos aparatos que fusionan el
    // mismo choque obtienen la misma copia, sin hash ni `crypto.subtle`.
    return { ...rest, id: `${loser.id}-conflicto-${revOf(loser)}-${loser.editedBy ?? 'sin-aparato'}`, name: base, rev: 1, editedBy: loser.editedBy } as Game;
};

export const merge = (local: Game[], remote: RemoteGames | null): MergeResult => {
    const remoteDoc: RemoteGames = { ...(remote ?? {}) };
    const out: MergeResult = { toLocal: [], remote: remoteDoc, needsPush: false, conflicts: [], notices: [] };
    const localById = new Map(local.map(g => [g.id, g]));

    const adopt = (r: Game) => {
        out.toLocal.push({ ...r, syncedRev: revOf(r) });
        remoteDoc[r.id] = r;
    };
    const upload = (l: Game, game: Game = l) => {
        remoteDoc[l.id] = stripLocal(game);
        out.needsPush = true;
        if (game !== l || game.rev !== l.rev || game.deletedAt !== l.deletedAt) {
            // El aparato también debe guardar la versión resultante, pendiente de subir.
            out.toLocal.push({ ...game, syncedRev: l.syncedRev });
        }
    };

    for (const l of local) {
        const r = remote?.[l.id];
        if (!r) {
            // Solo en local: se sube. Si ya se había sincronizado y falta en el servidor
            // (purgada o servidor reiniciado), no se borra: se conserva y se vuelve a subir.
            if ((l.syncedRev ?? 0) > 0) out.notices.push(`«${l.name}» ya no estaba en el servidor; se ha vuelto a subir.`);
            remoteDoc[l.id] = stripLocal(l);
            out.needsPush = true;
            if (l.syncedRev !== undefined) out.toLocal.push({ ...l, syncedRev: 0 });
            continue;
        }

        const lr = revOf(l), rr = revOf(r);

        // El servidor ha vuelto atrás respecto a lo último que este aparato sabe que subió.
        if (l.syncedRev !== undefined && rr < l.syncedRev) {
            out.notices.push(`El servidor tenía una versión anterior de «${l.name}»; se ha vuelto a subir.`);
            remoteDoc[l.id] = stripLocal(l);
            out.needsPush = true;
            out.toLocal.push({ ...l, syncedRev: 0 });
            continue;
        }

        if (sameContent(l, r) && lr === rr) {
            if (l.syncedRev !== rr) out.toLocal.push({ ...l, syncedRev: rr });
            continue;
        }

        const localChanged = hasPending(l);
        const remoteChanged = l.syncedRev === undefined || rr > l.syncedRev;

        if (!localChanged) { adopt(r); continue; }
        if (!remoteChanged) { upload(l); continue; }

        // Cambiaron los dos lados.
        const lDeleted = l.deletedAt !== undefined, rDeleted = r.deletedAt !== undefined;

        if (lDeleted && rDeleted) { adopt(winner(l, r)); continue; }

        if (rDeleted && !lDeleted) {
            // Edición local frente a borrado remoto: gana la edición y se restaura.
            const restored: Game = { ...l, rev: Math.max(lr, rr) + 1 };
            out.notices.push(`«${l.name}» se había borrado en otro aparato, pero la editaste: se ha restaurado.`);
            remoteDoc[l.id] = stripLocal(restored);
            out.needsPush = true;
            out.toLocal.push({ ...restored, syncedRev: l.syncedRev });
            continue;
        }

        if (lDeleted && !rDeleted) {
            // Borrado local frente a edición remota: gana la edición.
            out.notices.push(`«${r.name}» se editó en otro aparato después de borrarla aquí: se ha restaurado.`);
            adopt(r);
            continue;
        }

        // Dos ediciones: gana una y la otra se conserva como copia.
        const win = winner(l, r);
        const lose = win === l ? r : l;
        const copy = makeConflictCopy(lose);
        out.conflicts.push(copy);
        out.notices.push(`«${l.name}» se editó en dos aparatos: se conservó una versión y la otra quedó como «${copy.name}».`);
        if (win === r) adopt(r);
        else upload(l);
        remoteDoc[copy.id] = stripLocal(copy);
        out.toLocal.push(copy);
        out.needsPush = true;
    }

    // Solo en remoto: se adopta.
    for (const r of Object.values(remote ?? {})) {
        if (!localById.has(r.id)) adopt(r);
    }

    return out;
};
