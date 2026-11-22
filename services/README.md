# services/

Lógica de la app sin React: persistencia, copias de seguridad, lectura de capturas del tablero y listas de palabras. El motor de búsqueda no está aquí sino en `public/services/` (ver su README). Todo el almacenamiento es local al navegador; no hay red.

## Módulos

| Fichero | Responsabilidad | Almacenamiento |
|---|---|---|
| `gamesStore.ts` | Partidas (tablero, atril, comodines, contador de uso) y su orden | IndexedDB `anagrama`/`games`; respaldo `localStorage` `anagrama.games.v1`; partida activa en `anagrama.activeGame.v1` |
| `backup.ts` | Exporta/restaura un `.json` (`format: "anagrama-backup"`, `version: 1`) con partidas, vetadas, candidatas y plantillas | Usa los demás módulos |
| `boardLayout.ts` | Constantes del tablero 15x15: casillas premium, valores y distribución de fichas, bingo (+35), censo de fichas, `emptyBoard`, `setCell`, `countTiles` | Ninguno |
| `boardImage.ts` | Recorte (`defaultCrop`, `autoDetectCrop`), lectura de celdas de una captura (`readBoard`) y recuerdo del recorte (`saveCrop`/`loadCrop`) | `localStorage` (recorte) |
| `glyphs.ts` | Normaliza y clasifica letras en rejillas de 16x16 (`normalizeGlyph`, `glyphDistance`, `classifyGlyph`, plantillas sintéticas). Alfabeto sin K ni W | Ninguno |
| `glyphStore.ts` | Plantillas aprendidas de las correcciones del usuario (máx. 12 por letra) | IndexedDB `anagrama-glyphs`; respaldo `anagrama.glyphs.v1` |
| `wordBlocklist.ts` | Palabras vetadas que el motor ignora; `normalizeWord` (minúsculas, sin tildes) | `localStorage` `anagrama.blocked.v1` |
| `wordCandidates.ts` | Bandeja pasiva de palabras vistas en tableros aún no incluidas en el diccionario; exporta altas/bajas como `.txt` | `localStorage` `anagrama.candidates.v1` |
| `dictionaryService.ts` | Stub vacío; el diccionario se carga por `fetch` en el worker | Ninguno |

## gamesStore.ts

### Contrato de `Game`

`{ id, name, board, rack, blanks (0..2), createdAt, updatedAt, uses? }`. `isValidGame` es la puerta de entrada de todo dato leído o importado: rechaza tableros que no sean 15 filas de 15 caracteres `[.a-zñ]`, banderas de comodín (`0`/`1`) sobre casillas vacías, atriles con caracteres no válidos y `uses` negativo o no finito. `uses` es opcional.

### Contador `uses` y orden por uso

- `createGame` crea la partida con `uses: 0`.
- `App.tsx` suma 1 a `uses` y actualiza `updatedAt` cada vez que se edita la partida activa y cada vez que se abre otra (abrir cuenta como usar). Las partidas antiguas sin `uses` se tratan como `0` al incrementarlas.
- `usageScore(game, now)` = `(1 + actividad) * 0.5^(días / 7)`, donde `actividad` es `uses` o, si falta, las fichas colocadas en el tablero (`countTiles`), y `días` son los transcurridos desde `updatedAt`. La semivida es de 7 días (`HALF_LIFE_DAYS`): una partida muy jugada pero abandonada acaba por debajo de una reciente con poco movimiento.
- `sortByUsage(games, now)` devuelve una copia ordenada de mayor a menor puntuación; el desempate es `updatedAt` descendente. No muta la entrada. `now` es inyectable para pruebas.
- `listGames` sigue devolviendo las partidas por `updatedAt` descendente; el orden por uso se aplica solo en la UI (`components/GameSwitcher.tsx`).
- `nextGameName(games)` propone el primer "Partida N" libre.

### Invariantes y efectos

- Las escrituras (`saveGame`, `deleteGame`) pasan por una cola serie (`enqueueWrite`); la última gana y no se pierden por concurrencia. `saveGame` fija `updatedAt = Date.now()` al guardar.
- Si IndexedDB falla (modo privado, permisos), se cambia a `localStorage` de forma transparente y ya no se vuelve a IndexedDB en esa sesión.
- `initGames` cachea la promesa (StrictMode monta los efectos dos veces), migra el tablero antiguo `anagrama.board.v1` si existe y garantiza al menos una partida.

## Pruebas

`npm test` ejecuta `tests/`; `tests/persistence.mjs` cubre `gamesStore.ts` (incluidos `usageScore` y `sortByUsage`) y `backup.ts`. `npm run typecheck` comprueba tipos.
