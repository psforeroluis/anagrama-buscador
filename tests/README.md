# tests/

Pruebas en Node (ESM, sin framework, con `node:assert`). No requieren servidor ni navegador.

```
npm test          # ejecuta las tres, en este orden
npm run typecheck # tsc --noEmit (aparte)
```

| Fichero | Qué comprueba |
|---|---|
| `dictionary.mjs` | Carga `public/services/anagramSolver.ts` en `node:vm` y verifica contra `data/dictionary-maintenance-*.json` que las altas existen, las bajas no, y las pendientes siguen sin validar |
| `regresion.mjs` | Motor de tablero: apertura por el centro, puntuación conocida (ACTRIZ 34), 774 jugadas en el caso de medio juego, bingo con bonus de 35, comodines y vetos. Termina con fallo si alguna comprobación falla |
| `persistence.mjs` | `gamesStore.ts` y `backup.ts` (transpilados con esbuild): guardado concurrente, validación `isValidGame`, restauración de copias y, para el cambio reciente, `usageScore`/`sortByUsage` (reciente y muy usada primero; abandonada hace meses al final; a igual actividad pesa más la reciente) |

## Notas

- `dictionary.mjs` y `regresion.mjs` leen `dictionary.txt`; cambiarlo puede alterar las cifras esperadas.
- `dictionary.mjs` tiene fijado el nombre del fichero de mantenimiento de `data/`; si se añade uno nuevo hay que actualizar la ruta.
- Los tests no cubren los componentes React, incluido el diálogo de nombre de `GameSwitcher`.
