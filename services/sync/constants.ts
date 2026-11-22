// Constantes compartidas por el cliente y por `api/sync.ts`.

/** Días que se conserva una partida borrada (lápida). Valor provisional: ver Open Questions del diseño. */
export const TOMBSTONE_DAYS = 30;
export const TOMBSTONE_MS = TOMBSTONE_DAYS * 86_400_000;
