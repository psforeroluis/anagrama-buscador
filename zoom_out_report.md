# Informe de la etapa 5: revisión Zoom Out

**Documento revisado:** `docs/designs/anagrama-sync-y-uso-movil.md` (archivo completo)
**Revisores:** `egm-zoom-out` (completado), `egm-inventive-catalyst` (completado)
**Contexto adicional dado a los revisores:** ninguno.

**Limitaciones.** El revisor zoom-out usó `zoom_out.md` más el estándar, porque no encontró `zoom-out.md`. El revisor inventive-catalyst no recibió estándar y no abrió el código citado. Solo zoom-out comprobó referencias, con búsquedas en `services/backup.ts` y `skipSaveRef`.

**Recuento aproximado.** Blocker: 1. Major: 12 (zoom-out 8, inventive-catalyst 5; el hallazgo de `restoreBackup` lo dieron ambos y se cuenta una vez). Nit: unos 14. Inventive-catalyst no usa Blocker, pero dijo que su hallazgo 1 roza el Blocker para "Nunca perder una edición en silencio" y "Borrar … la borra en el otro".

--------------------------------------------------------------------------------

## Revisor `egm-zoom-out` (simplicidad y alcance)

**Veredicto:** no aprobar como un solo diseño. Es técnicamente sólido, pero agrupa tres iniciativas independientes y un refactor.

### Blocker

**1. Agrupación de alcance.** Secciones: Overview y la tabla de fases del Detailed Implementation Plan.
El documento dice que las fases 6 y 7 son "independientes entre sí y de la sincronización". Son tres diseños distintos (sincronización, sin conexión/PWA, uso móvil y teclado) más un refactor previo. Unas 20 mejoras de uso (atajos, barra lateral plegable, `Tabs`, "Mejor jugada" fija, textos de importar captura, renombres de vocabulario) no hacen falta para quitar el paso manual de JSON, que es el problema raíz.
*Recomendación:* enviar solo la sincronización (fases 0-5) y tratar las fases 6 y 7 como diseños separados con su propia justificación. El PWA no es requisito de la sincronización.

### Major

**2. Pila de sincronización más grande de lo necesario.** Secciones: Motor de sincronización, Estado visible, archivos 12, 13 y 14.
Para un usuario, dos aparatos y uno activo a la vez, el documento añade: líder con Web Locks y `BroadcastChannel`; interfaz `SyncTransport` con una sola implementación; máquina de 6 estados; espera creciente de 2, 8, 30 y 120 s; registro de diagnóstico de 200 eventos con pantalla propia; push `keepalive` en `pagehide`; 3 copias previas rotativas.
*Mínimo propuesto:* traer, fusionar y subir al arrancar, al volver `online` y tras una edición con espera. Mostrar errores en el indicador. Una sola copia previa. Con `If-Match` y reintento tras un `412`, dos pestañas en carrera ya son seguras; el líder queda como optimización. Un módulo con `fetch` basta.

**3. Nivel de detalle demasiado bajo para un diseño.** Archivos 3, 6, 7, 11, 12 y 29.
Hay pseudocódigo de `updateActive`, firmas exactas de `merge(...)`, `SyncTransport` y `saveGame(game, origin)`, la fórmula `rev = (rev ?? 0) + 1`, los segundos de la espera y referencias a líneas como `ScrabbleBoard.tsx:154-171`, que se quedan obsoletas. La lista de 33 archivos se parece a una lista de tareas.

**4. Reutilizar `restoreBackup` y duplicar la fusión.** Secciones: Fusión, Non-Goals y archivo 8. (También lo reportó inventive-catalyst, punto 5.)
`services/backup.ts` ya tiene `buildBackup` (línea 31) y `restoreBackup` (línea 65). El documento dice que no reutilizará `restoreBackup` para sincronizar y luego lo reescribe para delegar en `syncMerge`. Eso cambia una función que funciona y está probada: `tests/persistence.mjs` (líneas 45-47) comprueba "no se duplica" y "conserva atril distinto", y choca con la semántica "(importada)".
*Recomendación:* dejar `restoreBackup` como está y reutilizar solo `buildBackup()` y el formato como transporte y copia previa.

**5. `rev` como regla de conflicto.** Secciones: Modelo de datos, Fusión y CUJ 3. (También inventive-catalyst, punto 1.)
El documento afirma "Ninguna decisión de fusión usa relojes" y elige ganador por `rev` mayor, que cuenta ediciones y no recencia. El CUJ 3 dice "la revisión más reciente": un móvil con 12 ediciones sin conexión vencería a un escritorio que editó después. Corregir el texto o declarar que gana quien tiene más ediciones. Las copias perdedoras reciben `id` nuevo y `rev = 1`: cada conflicto sin resolver genera duplicados que se sincronizan a todos los aparatos, sin camino de limpieza.

**6. El borrado lógico cambia la semántica central del almacén.** Cambios en el guardado local y archivo 6.
`deleteGame` pasa a escribir una lápida, `listGames` la oculta y se añade `purgeDeleted`. Hay que auditar todos los consumidores (`backup.ts`, exportaciones, pruebas). No se dice si una copia exportada incluye lápidas. La papelera de 30 días y "Eliminadas recientemente" van más allá del objetivo.
*Recomendación:* cambiar la semántica solo para partidas sincronizadas, o definir la exportación. Empezar con una lápida mínima y sin interfaz de restauración.

**7. El refactor de la fase 1 es demasiado grande.** Archivos 3 a 5.
`skipSaveRef` aparece 5 veces en `App.tsx` (líneas 339-462), así que la fragilidad es real y `useGames` está justificado. Pero la misma fase extrae también `useSolverWorker`, `useDictionaryMaintenance`, `useToast`, `useSync` y `useHotkeys`. La sincronización solo necesita `useGames`.

**8. Las preguntas abiertas bloquean el diseño.** Sección Open Questions.
La URL de despliegue, el almacén Blob y los aparatos usados (Safari o Android) condicionan la viabilidad; IndexedDB es por origen. Además, "Qué leyeron los revisores" admite que no se leyeron `BoardPanel.tsx`, `Results` ni `WordInput`, aunque 7 archivos de la fase 7 dependen de ellos: otra razón para diferir esa fase.

**9. Rendimiento prematuro y verificación débil.** Uso sin conexión, Open Questions y Verification Plan.
Se decide precachear `dictionary.txt` (7,7 MB, límite subido a unos 12 MB) antes de la medición de arranque que el propio documento dice que falta, y sin declarar el coste de la primera instalación. El Verification Plan depende de que `ifMatch` funcione como se documenta: hacerlo un spike previo a construir `api/sync.ts`.

### Nit

10. Fijar Tailwind 3.4 por PostCSS como decisión explícita: el CDN sirve la versión que sirva, así que "tal cual" no está garantizado.
11. Identificadores del código en inglés y ASCII (`sinSesión`, `alDía` son español con tilde); español solo en el texto de interfaz.
12. Se propone "partida (no juego)", pero el código usa `Game` y `gamesStore`: indicar si se renombran identificadores.
13. "Decisiones de arquitectura tomadas por el autor" repite las Alternativas: consolidar. La nota de la Alternativa C ("Cuatro de siete revisores recomendaron esta opción") sobre una opción descartada parece sin resolver.
14. El archivo 1 de la fase 0 exige confirmar antes los cambios sin commit: presentarlo como puerta previa, no como parte del diseño.

**Ruta recomendada por zoom-out:** aprobar las fases 0, una fase 1 reducida (solo `useGames`), 2 y 3-5 recortadas (sin líder, sin `SyncTransport`, sin diagnóstico, y con `restoreBackup` intacto) como diseño de sincronización. Mover las fases 6 y 7 a diseños separados.

--------------------------------------------------------------------------------

## Revisor `egm-inventive-catalyst` (contradicciones y transformaciones)

Escala Major/Nit. No encontró nada que bloquee el diseño entero. Consideró equilibrados el rechazo de CRDT, el servidor por registro y la ausencia de interfaz de resolución de conflictos. Los falsos compromisos se concentran en las reglas de fusión y el transporte.

### Major

**1. La fusión corre en el cliente con relojes y un contador compartido, y rompe las invariantes.** "Fusión", reglas 2, 3 y 4; CUJ 3; archivo 7.
*   La regla 4 purga lápidas por `deletedAt` de hace más de 30 días: es un reloj de pared en cada cliente. Un aparato con el reloj adelantado puede purgar lápidas del documento remoto y los otros resucitarían la partida borrada. La prueba "dos réplicas con reloj desfasado" solo cubre al ganador.
*   `rev` cuenta ediciones, no recencia, aunque el CUJ 3 diga "más reciente".
*   La regla 3 hace que una lápida con `rev` mayor venza a una edición con `rev` menor sin conservar la edición perdedora: una edición sin conexión en B frente a un borrado en A se descarta en silencio.
*   *Resolución propuesta:* ejecutar `syncMerge` en `api/sync.ts`. El cliente envía solo `{id, rev, baseRev, fields}` de las pendientes; el servidor lee, fusiona y hace `put(ifMatch)` en bucle, y es dueño de la purga con hora de servidor. Borrado frente a edición: gana la edición; una lápida solo vence si el otro lado no tiene edición pendiente. Conflictos decididos por el orden del servidor, usando `syncedRev` como base.
*   *Costes:* más lógica y riesgo de desfase de versiones cliente-servidor (relevante con un PWA que puede ejecutar un cliente antiguo), módulo de fusión compartido, una edición reciente del aparato tardío puede quedar como copia, y las partidas borradas pueden reaparecer.

**2. El estado pendiente es incoherente.** "Modelo de datos" (`syncedRev`) y origen `remote`.
Pendiente es `rev > syncedRev`, pero `remote` "conserva `rev`, `updatedAt` y `syncedRev`" y no marca pendiente. Si se adopta un `rev` remoto de 7 con `syncedRev` antiguo de 5, la partida parece pendiente y rebota. No se especifica el caso `remote.rev < syncedRev` (Blob vaciado o restaurado).
*Resolución:* `remote` debe fijar `syncedRev = rev` de forma atómica, en la misma transacción de IndexedDB. Especificar `remote.rev < syncedRev` y 404 tras haber sincronizado, y añadirlos a `tests/sync.mjs`.

**3. Los incrementos de `rev` no son atómicos entre pestañas.** Fase 1 punto 3 con Fase 2 punto 6.
`rev` se incrementa desde la copia en memoria. Dos pestañas del mismo aparato editando la misma partida escriben ambas `rev = n+1` y la segunda pisa a la primera: edición perdida sin copia de conflicto. El líder de Web Locks solo serializa la red, no las escrituras locales.
*Resolución:* hacer la lectura-modificación-escritura de `rev` dentro de una transacción `readwrite` de IndexedDB en `saveGame`, y que las pestañas no líderes rederiven el estado con `BroadcastChannel`. Alternativa: una sola pestaña escritora.

**4. `pagehide` con `keepalive` sube el documento entero y no escala.** Motor, Alternativas E y F, archivo 12.
El cuerpo de un `fetch` con `keepalive` está limitado a unos 64 KB para todas las peticiones en vuelo. Unas 40 partidas de 1-2 KB ya se acercan, y el último push puede fallar sin aviso. En iOS `pagehide` tampoco es fiable. Cada push resube además partidas sin cambios.
*Resolución:* la fusión en servidor del punto 1, enviando solo lo cambiado. *Costes:* el servidor pasa a tener lógica con estado, `SyncTransport` cambia a una llamada delta y hacen falta pruebas de deltas parciales.

**5. Delegar `restoreBackup` en `syncMerge` anula el sentido de restaurar.** (Coincide con zoom-out, punto 4.)
Los Non-Goals rechazan reutilizar `restoreBackup` para sincronizar, pero el archivo 8 hace que delegue en `syncMerge`: el mismo acoplamiento en sentido contrario. Restaurar una copia antigua sobre una partida con `rev` mayor no hace nada, porque gana la versión actual, y el usuario no puede volver atrás.
*Resolución:* mantener la restauración como intención distinta, con "(importada)" para ids distintos como hoy. Compartir solo validación y ayudantes de lápidas, o dar a `syncMerge` un parámetro de política `'sync' | 'restore'`.

**6. Sin id determinista para las copias de conflicto, el ciclo no es idempotente.** Archivo 7 y el reintento tras `412`.
Se genera un id aleatorio en cada fusión. Si el ciclo se interrumpe entre fusionar y aplicar, o dos aparatos fusionan el mismo conflicto por separado, cada uno crea una copia distinta. La prueba "fusionar dos veces no cambia nada" es falsa con ids aleatorios.
*Resolución:* derivar el id de la copia con un hash de `(originalId, loserRev, loserEditedBy)` y aplicar fusión y push en un único paso duradero.

### Nit

7. Retroceso "2, 8, 30, 120 s" sin meseta, y sin estado terminal tras 3 errores `412` seguidos o un `401`. Una pestaña líder oculta puede retener el bloqueo. Definir meseta y estado de error terminal con "Reintentar", y que el líder ceda el bloqueo al ocultarse.
8. Pegar el token en el móvil es el paso manual que la Alternativa J rechaza. Propuesta: emparejar por QR o por fragmento de URL (`#token=`, que no se envía al servidor), limpiarlo del historial y limitar por IP los `401`. Revocar implica rotar `SYNC_TOKEN` y reemparejar todo.
9. Precachear 7,7 MB en la instalación del service worker retrasa el "uso sin conexión" en enlaces débiles. Propuesta: precachear solo shell y worker, y bajar el diccionario como precarga aparte con `CacheFirst` y un estado visible "disponible sin conexión".
10. Compatibilidad hacia delante sin declarar: un cliente antiguo en caché que sube el documento por `isValidGame` puede borrar campos añadidos después. Conservar campos desconocidos al ir y volver, con límites de tamaño, y pedir actualizar si el servidor informa un esquema más nuevo.
11. Menores: un aparato sin conexión más de 30 días resucita partidas borradas (declararlo como comportamiento aceptado); las fases 4 y 7 modifican ambas `GameSwitcher.tsx` y `App.tsx` y no son tan independientes; el refactor de la fase 1 quita `skipSaveRef` "sin cambio de comportamiento" pero la fase 0 solo fija la persistencia con pruebas de Node; el tope de 1 MB (413) no tiene mitigación; la nota de la Alternativa C es ambigua; en el CUJ 5 cada aparato puede haber creado su "Partida 1" con id distinto y la unión puede traer duplicados vacíos.

--------------------------------------------------------------------------------

## Coincidencias y tensiones entre revisores

*   **Coinciden** en que `restoreBackup` no debe delegar en `syncMerge`, en que `rev` mide ediciones y no recencia (el texto del CUJ 3 engaña), en que precachear 7,7 MB es discutible y en que el detalle del plan es excesivo y está acoplado.
*   **Tensión de dirección.** Zoom-out pide quitar complejidad (sin `SyncTransport`, sin líder, sin diagnóstico). Inventive-catalyst propone mover la fusión al servidor y enviar deltas, lo que añade lógica en `api/sync.ts` y cambia `SyncTransport`. Hay que decidir una dirección antes de la siguiente ronda.
*   **Camino coherente con ambos:** el recorte de zoom-out más los arreglos de corrección de inventive-catalyst que no dependen del servidor: `syncedRev` atómico, `rev` dentro de la transacción de IndexedDB, id determinista de copias y la regla de borrado frente a edición que conserva la edición.
