# data/

Datos de mantenimiento del diccionario, fuera del código y del bundle.

## dictionary-maintenance-2026-09-06.json

Listas leídas de las páginas de mantenimiento de anagrama-buscador.vercel.app el 2026-09-06.

| Campo | Significado |
|---|---|
| `source` | Origen y fecha de lectura |
| `additions` | Palabras confirmadas que deben estar en el diccionario (5) |
| `removals` | Palabras confirmadas que no deben estar (muchas; siglas, fragmentos, formas dudosas) |
| `pending` | Palabras sin validar; deben seguir ausentes hasta decidir |

## Uso e invariantes

- Es la referencia que lee `tests/dictionary.mjs` (ruta fija a este fichero) contra `public/services/dictionary.txt`.
- Palabras en minúsculas, sin tildes, alfabeto a-z y ñ.
- Al decidir una palabra pendiente, muévela a `additions` o `removals`, aplica el cambio en `dictionary.txt` y ejecuta `npm test`; revisa también las cifras de `tests/regresion.mjs`.
- La app exporta altas y bajas como `.txt` (`services/wordCandidates.ts`) para aplicarlas aquí.
