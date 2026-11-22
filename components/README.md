# components/

Componentes React (TSX, Tailwind) de la interfaz. No guardan datos por su cuenta: reciben estado y callbacks de `App.tsx` y delegan la lógica en `services/` y en el worker de `public/services/`.

| Componente | Función |
|---|---|
| `Header` | Cabecera de la app |
| `WordInput` | Entrada de atril, comodines, patrón de casillas (`BoardBuilder`) y modo paralelo para el buscador de anagramas |
| `BoardBuilder` | Editor de las casillas del patrón (`BoardSlot[]`) |
| `Results` | Lista de palabras encontradas (`FoundWord[]`) según modo de búsqueda |
| `BoardPanel` | Panel de Scrabble: tablero, atril, comodines, jugadas (`BoardMove[]`), orden por puntos u otro criterio, vetadas, candidatas y verificación de mantenimiento del diccionario |
| `ScrabbleBoard` | Tablero 15x15 editable con vista previa de una jugada (`preview`) |
| `ScreenshotImport` | Importa el tablero desde una captura: recorte, lectura (`services/boardImage.ts`) y corrección que alimenta las plantillas aprendidas |
| `GameSwitcher` | Selector de partidas (ver abajo) |
| `ShortWordsGuide` | Guía de palabras cortas |
| `Overlay` | Capa modal en portal sobre `<body>` (evita que un ancestro con `transform` descoloque los modales) |
| `Toast` | Aviso temporal con acción opcional |
| `Spinner` | Indicador de carga |

## GameSwitcher

Props: `games`, `activeId`, `onSelect`, `onCreate: () => Game`, `onRename`, `onDelete`, `onExport` y las de importación.

- **Orden por uso**: la lista se muestra con `sortByUsage(games)` (`services/gamesStore.ts`, semivida de 7 días), memoizada sobre `games`. Las más usadas suben; las de poco movimiento pasan al final. El buscador por nombre (sin tildes) aparece a partir de `SEARCH_FROM` partidas y filtra sobre esa lista ordenada.
- **Diálogo de nombre al crear**: "Nueva partida" llama a `onCreate()`, que en `App.tsx` ya crea, guarda y abre la partida con el nombre por defecto (`nextGameName`) y la devuelve. Después se abre un diálogo (`Overlay`) con el nombre propuesto seleccionado:
  - "Guardar nombre" (Enter): recorta el texto, lo limita a 40 caracteres y llama a `onRename` solo si no está vacío y difiere del defecto.
  - "Dejar «nombre»", Escape o cerrar el overlay: conserva el nombre por defecto.
  - Cerrar el diálogo nunca pierde la partida, porque ya existe.
- El borrado pide confirmación en un diálogo aparte.

## Invariantes

- Los modales usan siempre `Overlay`.
- El texto de la interfaz está en español.
