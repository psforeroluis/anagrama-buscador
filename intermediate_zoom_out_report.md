# Informe de la etapa 8: revisión Zoom Out intermedia

**Documento:** `docs/designs/anagrama-sync-y-uso-movil.md` (archivo completo).
**Revisor:** `egm-zoom-out`, una instancia, completada, sin reintentos. Estándar: `zoom-out-standard.md`.
**Enfoque pedido:** qué añadieron las etapas 6 y 7 (comprensión y dos rondas críticas) y si hicieron el diseño más grande de lo que pide el problema; qué hallazgos de la etapa 5 siguen abiertos; dónde el plan detallado ya no encaja con la especificación.

**Salvedades.**
*   El revisor no abrió `comprehension_report.md`, `critic_report.md` ni `goldfish_review_report.md`. Dedujo los cambios comparando el diseño con el informe de la etapa 5, así que alguna atribución puede ser inexacta.
*   Las referencias del revisor a las líneas 503, 542, 553, 585 y 596-607 del plan quedan fuera de las 489 líneas que leyó el sintetizador y no se comprobaron.
*   Los números de línea son los del documento en el momento de la revisión.

**Veredicto del revisor:** la especificación es más correcta que en la etapa 5, pero más grande de lo que pide el problema (un usuario, dos aparatos, decenas de partidas, uno activo a la vez). El plan detallado quedó claramente desfasado.
*   **Se mantienen** los arreglos de corrección: `rev` frente a recencia, `syncedRev` atómico, `rev` dentro de la transacción de IndexedDB, id determinista de la copia de conflicto y borrado frente a edición con `deletedBaseRev`.
*   **Sobran** las redes de seguridad y los casos límite apilados encima.

**Totales (cada hallazgo contado una vez):** 0 Blocker, 15 Major, 5 Nit. Especificación: 7 Major (1-7) y 4 Nit (8-11). Plan: 8 Major (P1-P8) y 1 Nit (P9). P5 y P7 repiten los hallazgos 4 y 9 de la etapa 5.

--------------------------------------------------------------------------------

## Estado de los hallazgos de la etapa 5

*   **Cerrados:** #5 (CUJ 3), #12, #13 y #10 en parte (el texto dice "sin cambiar de versión mayor", pero el plan fija la 3.4).
*   **Abiertos:** #1, #2 (peor ahora), #3, #4 (con contradicción interna), #6, #7, #8, #9 (en parte), #11 y #14.

## Hallazgos sobre la especificación

### Major

**1. Agrupación de alcance** (etapa 5 #1, antes Blocker). Overview y Nota de alcance (L13-30); tabla de fases (L380-391).
El autor decidió un solo documento y añadió criterios de salida por bloque, por eso baja a Major. Sigue abierto: son tres diseños más un refactor, y el bloque 3 admite (L29) que su detalle es "intención provisional" porque no se leyeron siete componentes.
*Recomendación:* extraer los bloques 2 y 3 a documentos propios (L23 ya lo permite). Este documento cubriría las fases 0-5, con la fase 6 como prerrequisito.

**2. La pila de sincronización sigue creciendo** (etapa 5 #2). Fusión (L192-199), guardado local (L207-213), motor (L215-232), servidor (L236-241) y Estado visible (L254).
Se añadió: heurística de "menos de la mitad" de partidas, hash determinista del id (L197), `lastUsedAt` (L176), purga local al arrancar con la sincronización apagada (L213), `deletedAt` reescrito por el servidor (L173, 237), bloqueo por `schemaVersion` y conservación de campos desconocidos (L237, 241), omisión del push `keepalive` por tamaño (L225), espera de 2/8/30/120 s, alternativa sin Web Locks (L230), siete estados y Diagnóstico de 200 eventos. El servidor deja de ser un almacén con `If-Match` y pasa a tener lógica de purga, recuento y versionado.
*Recomendación:* mantener `rev`/`syncedRev` y la regla de lápida. Eliminar o diferir: el líder con Web Locks (basta `If-Match` más reintento), el backoff escalonado (un reintento al volver `online`), el push `keepalive` (el arranque recupera los pendientes), el bloqueo por `schemaVersion` y la reescritura de `deletedAt` por el servidor (usar la hora del cliente con purga conservadora).

**3. Cuatro redes de seguridad apiladas contra la misma pérdida de datos.** L192, 232, 237, 278, 290, 294.
Coexisten: fusión sin borrado por ausencia (L201), "servidor reiniciado" por `404` o menos de la mitad, lápidas de 30 días con contenido, copia previa a la primera sincronización, `anagrama-sync.prev.json` y el `409` con `X-Confirm-Bulk` y confirmación. La heurística de la mitad es redundante con la regla 1. El `409` añade recuento en el servidor, una cabecera, un flujo de confirmación y pruebas, y no aparece en ningún CUJ.
*Recomendación:* quedarse con la fusión sin borrado por ausencia, las lápidas, `prev.json` y la copia previa. Quitar el `409`, `X-Confirm-Bulk` y la heurística de la mitad.

**4. Contradicción sobre `restoreBackup`** (etapa 5 #4). Non-Goals (L69), L190 y archivo 8 (L445).
La L69 prohíbe reutilizar `restoreBackup` como algoritmo de sincronización; la L190 dice que `syncMerge` también se usa en la restauración de copias. La restauración actual crea "(importada)" y `syncMerge` crea "(conflicto)"; no se dice cuál gana. Restaurar una copia antigua sobre una partida con `rev` mayor no hace nada, así que no se puede volver atrás con una copia.
*Recomendación:* dejar `restoreBackup` como está y quitar la frase de la L190, o decidir lo contrario y retirar el Non-Goal. Un solo camino.

**5. Lápidas y exportación sin definir** (etapa 5 #6). L211-213.
No se dice si `buildBackup` incluye lápidas ni qué pasa al restaurar una copia que las contenga.
*Recomendación:* la copia JSON exporta solo partidas vivas.

**6. Refactor de la fase 1 demasiado grande** (etapa 5 #7). L243-250.
La sincronización solo necesita `useGames`. Siguen listados `useSolverWorker`, `useDictionaryMaintenance`, `useToast`, `useSync` y `useHotkeys`; `useHotkeys` es del bloque 3.
*Recomendación:* dejar en esta etapa solo `useGames` y `useToast` (por los avisos persistentes).

**7. Open Questions y spike previo** (etapa 5 #8 y #9). L74-78, 141, 602 y tabla L382-391.
La L141 detiene el diseño si la prueba de `412` falla, pero el spike solo figura al final, en el Verification Plan. La tabla de fases no tiene fase de spike. Siguen abiertas la URL del origen y los aparatos del autor.
*Recomendación:* añadir una fase 2.5 de spike de `ifMatch` como puerta antes de la fase 3.

### Nit

**8.** `lastUsedAt` es un arreglo del orden por uso, no de sincronización (L176, 208). Añade un campo y un origen `usage` para corregir `usageScore`, que ya está en el código sin confirmar (L399). *Recomendación:* confirmarlo y sacarlo del diseño de sincronización.
**9.** Detalle técnico en secciones de alto nivel (L186, 197, 207, 225): el cálculo de 809 bytes y 1.296 partidas, el algoritmo del hash y el límite de 64 KiB. Son útiles como justificación; *recomendación:* moverlos a notas o al plan.
**10.** Identificadores con tilde (etapa 5 #11), L221 y 476: `alDía`, `sinSesión`. *Recomendación:* usar ASCII.
**11.** El archivo 1 de la fase 0 (L397-400) se presenta como parte del diseño (etapa 5 #14). *Recomendación:* describirlo como puerta previa.

## Desajustes entre el Detailed Implementation Plan y la especificación

El revisor no evaluó el detalle de implementación; solo señaló dónde el plan ya no encaja.

**P1 (Major). Archivo 6, `gamesStore.ts` (L430-435), frente al modelo de datos (L168-176) y al guardado local (L203-213).** Faltan `deletedBaseRev` y `lastUsedAt`. El origen `usage` es solo `uses`. `remote` no fija `syncedRev = rev` en la misma transacción ni cubre un `rev` remoto menor que `syncedRev`. `edit` no menciona la transacción única de IndexedDB. `purgeDeleted` usa siempre el reloj local, mientras la especificación atribuye la purga al servidor. `isValidGame` no valida los campos nuevos.

**P2 (Major). Archivo 7, `syncMerge` (L437-440).** La firma lleva `now` y la purga a 30 días dentro de la fusión, cuando la especificación dice que la fusión no usa relojes. La copia de conflicto recibe "id nuevo", frente al hash determinista de la L197. Faltan la regla de ausente en remoto con `syncedRev > 0` y la regla del `404`.

**P3 (Major). Archivo 11, `api/sync.ts` (L459-466).** Faltan `prev.json`, el `409` con `X-Confirm-Bulk`, el `400` por `schemaVersion` menor, la sustitución de `deletedAt` por la hora del servidor, la purga en el servidor y el recuento de lápidas. Si se elimina el `409` (hallazgo 3), el plan solo necesita `prev.json`.

**P4 (Major). Archivo 13, motor (L473-476).** Lista 6 estados frente a los 7 de la especificación (falta `sinToken` y `tokenRechazado`; usa `sinSesión`). La copia previa guarda "las 3 últimas", la especificación solo la última (L232). Faltan la alternativa sin Web Locks, el `QuotaExceeded`, el estado terminal tras 3 `412`, el tope de 120 s, la omisión de `keepalive` por tamaño y el bloqueo por `schemaVersion` mayor.

**P5 (Major). Archivo 8, `restoreBackup` (L442-445).** Delega en `syncMerge`, lo que el Non-Goal de la L69 prohíbe (hallazgo 4). No dice qué hacer con las lápidas.

**P6 (Major). Tabla de fases (L380-391).** La L380 dice que la fase 6 es independiente de la sincronización, pero la especificación (L25, 276, 278) la hace requisito previo de activarla. Falta el spike. `diagnostics.ts` se crea en la fase 3, pero el archivo 6 de la fase 2 ya registra en él y dice "fase 4" (L433).

**P7 (Major). Archivo 25, PWA (L542).** Precachea `dictionary.txt` y sube `maximumFileSizeToCacheInBytes` a unos 12 MB. La especificación (L259) lo descarga aparte con `CacheFirst` y estado "disponible sin conexión".

**P8 (Major). Verification Plan (L596-607).** No cubre `rev < syncedRev`, el `404` tras haber sincronizado, la atomicidad de `rev` entre pestañas, el id determinista de las copias, `409` y `prev.json`, el `400` por esquema, el `413`, el `keepalive` omitido ni `deletedBaseRev` (CUJ 9).

**P9 (Nit). Texto suelto en el plan.** La L603 dice "los ocho CUJ" y ahora son nueve. La L604 dice "Sin conexión · 3 pendientes" y el chip dice "Sin red · 3 pendientes". La L508 propone el pie "Sincronizado con tu cuenta" pese a "no hay cuentas" (L272). Las L553 y 585 dependen del bloque 3.

--------------------------------------------------------------------------------

## Ruta recomendada por el revisor

Recortar primero la especificación (hallazgos 2, 3, 4, 5 y 6), porque cada recorte elimina a su vez un desajuste del plan (P3, P4, P5). Después regenerar el plan desde la especificación reducida en lugar de parchearlo.

## Tensión con las etapas anteriores

Varias recomendaciones de recorte deshacen cosas que las rondas críticas añadieron a petición de otros revisores: el `409` con `X-Confirm-Bulk` y la versión previa (M3 de la ronda 1), la reescritura de `deletedAt` por el servidor (R2-M3), el bloqueo por `schemaVersion` (M11) y la alternativa sin Web Locks (R2-N2). Hay que decidir qué pesa más antes de recortar: la protección contra pérdida de datos o la simplicidad.

================================================================================

# Re-auditoría de la etapa 8 (tras recortar la especificación y regenerar el plan)

**Documento:** `docs/designs/anagrama-sync-y-uso-movil.md` (631 líneas, leído completo por el revisor).
**Revisor:** `egm-zoom-out`, completado, una instancia, sin reintentos. Los números de línea son los del documento en ese momento; los identificadores A-M son nuestros.
**Salvedades:** no abrió `zoom_out_report.md` (etapa 5) y usó el informe intermedio previo, que lo resume; su persona está en `agents/zoom_out.md`; no verificó los nombres de funciones de `gamesStore.ts`; en el repo no existen `hooks/`, `services/sync/`, `api/` ni `scripts/`.
**Límite:** esta es la única re-auditoría que permite la etapa 8. Si se pide otra edición manual, el límite se alcanza y lo que quede se registra como compromiso aceptado.

**Totales (cada hallazgo contado una vez):** 0 Blocker, 4 Major, 9 Nit. Antes eran 15 Major y 5 Nit.

## Estado de los hallazgos del informe previo

**Cerrados:**
*   Especificación 2 (la pila crece): en lo esencial; ya no están el líder con Web Locks, la espera escalonada, el `keepalive`, el `deletedAt` reescrito por el servidor ni el bloqueo por `schemaVersion`. Lo que queda está en B, C, D y M.
*   Especificación 3 (redes de seguridad apiladas): ya no hay `409`, `X-Confirm-Bulk` ni heurística de la mitad. Lo que sobra es `prev.json` (C).
*   Especificación 4 (`restoreBackup`): intacto (L69, L189, archivo 10).
*   Especificación 6 (refactor): reducido a `useGames` y `useToast`.
*   Especificación 7 (spike): existe la fase 2b y actúa como puerta.
*   Especificación 8 (`lastUsedAt`): aislado en la fase 0.
*   Especificación 10 (identificadores con tilde) y 11 (archivo 1 de la fase 0 como puerta previa).
*   Plan P1 a P7 y P9: el plan coincide ahora con la especificación en campos y orígenes de guardado, `syncMerge` sin relojes, servidor con `prev.json` y sin `409`, seis estados y una sola copia previa, `restoreBackup` intacto, dependencias de fases, diccionario descargado aparte, "nueve recorridos", "Sin red · 3 pendientes" y el pie "Solo en este aparato".

**Siguen abiertos:** especificación 1 (hallazgo A), especificación 9 (hallazgo E, reducido) y plan P8 (cerrado en parte; huecos en los CUJ 6 a 8, hallazgo I). **Nuevos:** B, C, D, F, G, H, J, K, L y M.

## Proporcionalidad

El diseño es ahora casi proporcionado al problema (un usuario, dos aparatos, decenas de partidas, un aparato activo a la vez). Se mantiene lo que protege datos: `rev`, `syncedRev`, lápidas y un único documento con `If-Match`. La puerta del spike es correcta. La PWA y la migración de Tailwind son necesarias para el uso sin conexión y para no exponer el token a CDN externos.

## Hallazgos

### Major

**A. Tres bloques en un solo documento** (abierto desde la etapa 5). Overview y Nota de alcance (L13-30); tabla de fases (L380-392). El autor decidió mantenerlos juntos y hay criterios de salida por bloque, así que no es Blocker. El bloque 3 admite que su detalle es provisional por siete componentes sin leer (L29, L567-569). *Recomendación:* extraer las fases 6 y 7 a documentos propios (L23 ya lo permite); este documento quedaría con las fases 0 a 5 y la 6 como prerrequisito.

**B. La regla de borrado frente a edición puede perder una edición.** L134 (CUJ 9), L174, L197 y plan L454. Gana la edición solo si su `rev` supera `deletedBaseRev`, y ambos son contadores por aparato. Ejemplo: el ordenador edita 3 veces y borra (`deletedBaseRev` = b+3); el móvil, sin conexión, edita una vez (`rev` = b+1); gana la lápida y la edición del móvil se pierde al purgar. Contradice el Goal "si un borrado choca con una edición, gana la edición" (L43) y "no se pierde ninguna edición"; el CUJ 9 solo funciona cuando quien borra no editó más. *Recomendación:* decidir por cambios pendientes respecto a `syncedRev`: si un lado tiene cambios sin subir y el otro una lápida, gana la edición. Así sobra `deletedBaseRev`, un campo menos en el modelo y en `api/sync.ts`. Añadir un caso de prueba con ediciones asimétricas.

**C. `anagrama-sync.prev.json` no protege lo que dice proteger.** L233 (servidor), L288 (riesgos), L372 (alternativa M) y plan L479. Cada `PUT` copia el documento actual a `prev.json`, y hay un `PUT` 2 s después de cada edición: un push malo deja `prev.json` con el estado bueno solo hasta el siguiente push, que lo reemplaza por el documento ya dañado. Además cuesta una escritura extra de Blob por cada `PUT`, no atómica con `ifMatch`. *Recomendación:* quitar `prev.json`; las lápidas, la copia previa a la primera sincronización, la fusión sin borrado por ausencia y el JSON de exportación cubren el riesgo. Si se conserva, copiar solo al crear el documento o cuando el número de partidas baje. Corregir la fila de riesgos de L288.

**D. El modo `pushOnly`/`full` aparece en el plan sin definir en la especificación.** L277 (solo la secuencia de despliegue); plan L489, L494 y L543. El plan lo convierte en estado persistido del motor, con pruebas y procedimiento, pero no dice qué sube `pushOnly` (¿local o fusionado?) ni cómo obtiene el `ETag` sin aplicar el `pull`. Si sube lo local sobre un remoto con datos de otro aparato, puede pisarlos; para un usuario con dos aparatos es una segunda ruta de código que probar. *Recomendación:* sustituirlo por activación manual (activar en el ordenador, revisar el documento remoto, activar en el móvil). Si se conserva, definirlo en la especificación y justificarlo.

### Nit

*   **E.** Detalle en secciones de alto nivel: L185 (cálculo de 809 bytes y 1.296 partidas) y L196 (derivación del id de la copia). *Recomendación:* dejar la cifra y la regla y mover el cálculo a una nota o al plan.
*   **F.** La especificación no dice qué exporta `buildBackup` (el plan omite lápidas, `syncedRev` y `lastUsedAt`; L210-212 y L270 callan). *Recomendación:* una línea en "Cambios en el guardado local"; incluir `uses` si tampoco se exporta.
*   **G.** Contenido del plan que no está en la especificación ni en los Goals. Fase 4: menú "Copia de seguridad" y resumen completo de restaurar, texto del diálogo de borrar sobre los demás aparatos, y la pantalla "Diagnóstico" reducida a "Copiar diagnóstico". Fase 7: trampa de foco en `Overlay`, estados de forma o texto además del color, "lista de jugadas sin scroll anidado" y medición de contraste. *Recomendación:* añadirlo al Goal correspondiente o quitarlo del plan.
*   **H.** Detalles del servidor solo en el plan: `304` con `If-None-Match` y `Cache-Control: no-store`. *Recomendación:* añadirlos a la especificación del servidor o quitarlos del plan.
*   **I.** El Verification Plan no cubre los criterios del bloque 3: faltan botones de al menos 44 px, "Mejor jugada" en el tercio inferior, Ctrl/Cmd+Z, Supr con confirmación, el flujo "aplicar aquí / nueva partida" y la confirmación al cerrar la importación; y agrupa los nueve CUJ bajo "dos aparatos reales" aunque los CUJ 6 a 8 no son de sincronización. *Recomendación:* una entrada por CUJ 6, 7 y 8 en la fase 7.
*   **J.** La fase 4 depende de componentes no leídos (`Overlay`, `Toast`). *Recomendación:* leerlos antes de la fase 4, no solo antes de la 7, y reflejarlo en la nota de la fase 7.
*   **K.** Señal sin productor en la fase 1: `onRemoteAdopted` se expone en `useGames` cuando no hay sincronización hasta la fase 4. *Recomendación:* crearla en la fase 4 junto con `useSync`.
*   **L.** Dependencia innecesaria de la fase 2b: `blob-race.mjs` solo necesita el almacén Blob, no la fase 2; si falla, el trabajo de la fase 2 puede quedar sin uso. *Recomendación:* que dependa solo de las fases 0 y 1 y del alta del almacén, y ejecutarla antes de la 2.
*   **M.** Dos rutas de purga de lápidas con dos relojes (servidor y local con la sincronización apagada); además `deviceId` queda en `gamesStore` en el plan y en el motor en la especificación. *Recomendación:* una sola política de purga y fijar en la especificación quién es dueño de `deviceId`.

## Coincidencia del plan con la especificación

Coinciden las fases, el orden de entrega y las dependencias, el vocabulario, los seis estados y los textos del chip, los nueve CUJ, los criterios de salida por bloque y los archivos y campos del modelo de datos. Los desajustes de contenido son D, F, G y H; los de orden o dependencias son J, K y L.

## Compromisos aceptados al cerrar la etapa 8

El autor decidió pasar a la etapa 9 sin más cambios. Quedan registrados como compromisos aceptados: A (tres bloques en un documento, decisión anterior del autor), B (la regla de borrado frente a edición compara contadores de aparatos distintos y puede perder una edición en el caso de ediciones asimétricas), C (`prev.json` se sobrescribe en el siguiente `PUT`), D (modo `pushOnly`/`full` sin definir en la especificación) y los Nit E a M. B es el único que puede perder datos; el revisor recomendaba decidir por cambios pendientes respecto a `syncedRev` y retirar `deletedBaseRev`.
