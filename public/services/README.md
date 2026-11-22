# public/services/

Motor de búsqueda y diccionario. Se sirve como recurso estático (no lo empaqueta Vite) y se ejecuta en un Web Worker, para no bloquear la interfaz.

| Fichero | Contenido |
|---|---|
| `anagramSolver.ts` | Código del worker: anagramas con patrón y comodines, y generador de jugadas de Scrabble sobre tablero (DAWG, casillas ancla, conjuntos cruzados, puntuación, bingo, valor del remanente, riesgo del rival por muestreo) |
| `dictionary.txt` | Diccionario, una palabra por línea (unas 688 mil líneas) |

## Contrato del worker

Se comunica por `onmessage`/`postMessage`. Mensajes de entrada (`type`):

- `init`: recibe `dictionaryText` y construye las estructuras. Debe ser el primer mensaje.
- `solve`: búsqueda de anagramas (letras, patrón, comodines, modo paralelo).
- `solveBoard`: jugadas sobre el tablero (`board`, `blanksBoard`, `rack`, `blanks`, `limit`, `rankBy`, `blocked`, ...); devuelve `data` y `total`.
- `warmupBoard`: precalienta el DAWG.
- `checkWord` / `checkWords`: comprueba existencia; `checkWords` devuelve `unknown`.

## Invariantes

- El fichero se evalúa como script suelto (usa `self`); los tests lo cargan con `node:vm`, así que no debe usar `import`/`export`.
- El alfabeto es a-z y ñ, sin tildes; las palabras vetadas (`blocked`) se ignoran sin alterar el diccionario.
- El número de jugadas en `tests/regresion.mjs` (774 en el caso de medio juego) depende del contenido de `dictionary.txt`: al cambiar el diccionario hay que revisar esas cifras.
- Las altas y bajas se registran en `data/` y se verifican con `tests/dictionary.mjs`.
