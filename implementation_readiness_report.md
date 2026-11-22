# Informe de la etapa 9: preparación para implementar (ronda 1)

**Documento:** `docs/designs/anagrama-sync-y-uso-movil.md`, líneas 376-630 (Detailed Implementation Plan). La especificación (líneas 1-375) se usó solo como contexto.
**Estándar:** `implementation-readiness-standard.md` para `egm-implementation-readiness` y `egm-codebase-details`. Estilo sin estándar.
**Contexto adicional:** ninguno. Los revisores comprobaron el plan contra el código real (solo lectura).

## Estado de los revisores

| Revisor | Estado |
|---|---|
| `egm-implementation-readiness` | completado |
| `egm-codebase-details` | completado |
| `egm-style` | completado |

Ninguno falló ni se reintentó.

**Veredicto del sintetizador:** el plan no está listo para implementarse. **53 hallazgos únicos tras deduplicar: 5 Blocker, 25 Major y 23 Nit.** Los números de línea son los del documento en el momento de la revisión; las referencias a líneas de código vienen de los revisores y el sintetizador no las comprobó. Los identificadores (B1…, M1…, N1…) son nuestros.

**Verificado contra el código por `egm-codebase-details`:**
*   Todos los archivos marcados "Modify" existen.
*   Ninguna ruta "Create" colisiona con un archivo existente (`hooks/`, `scripts/`, `api/`, `public/icons/`, `tailwind.config.js`, `vercel.json`, `services/sync/`).
*   Todos los símbolos citados existen: `saveGame`, `deleteGame`, `listGames`, `initGames`, `runInit`, `isValidGame`, `usageScore` y `sortByUsage` en `services/gamesStore.ts`; `buildBackup` y `restoreBackup` en `services/backup.ts`; `handleSelectGame`, `skipSaveRef` y `persistGame` en `App.tsx`.
*   El orden de entrega 0, 1, 6, 2, 2b, 3, 4, 5 es coherente; el problema está en dependencias ocultas entre fases y en decisiones que el plan deja al implementador.
*   Limitación: ese revisor no pudo ejecutar `git` ni comparar con `HEAD`.

--------------------------------------------------------------------------------

## Blocker (5)

**B1. Fase 7 provisional, no construible** (L567-609).
El propio plan la declara provisional (L567-569) y deja sin decidir: qué tecla cambia la dirección del tablero (L584, "otra tecla"); qué es un paso de deshacer y qué estado guarda (L589); cómo se detecta Mac para el aviso de ⌘V (L599); el diseño de la barra lateral plegable y qué componente fija "Mejor jugada" (L589); qué hacen exactamente `/` y Alt+N (L594); si el aviso de nombre duplicado bloquea o solo avisa (L574); qué estados reciben "forma o texto" (L599). No tiene casos de prueba, aunque `useBoardHistory` es lógica pura y se puede probar en Node. Además, `max-w-7xl` y la barra lateral se asignan a `BoardPanel.tsx` (L589), pero el contenedor `max-w-6xl` probablemente está en `App.tsx` o `GameSwitcher.tsx`.
*Qué hacer:* leer los componentes y congelar el detalle con pruebas, o sacar la fase 7 de este plan, e indicar el archivo del contenedor.

**B2. Convergencia tras borrar y restaurar** (L454, regla 3 de la L197, CUJ 9).
Ejemplo: B está en `rev` 5 y el ordenador lo borra: la lápida queda con `rev` 6 y `deletedBaseRev` 5. El móvil edita sin conexión hasta `rev` 6. La edición gana (6 > 5) y se sube con `rev` 6; el ordenador conserva la lápida con `rev` 6 y `syncedRev` 6. La regla "local sin cambios y remoto con `rev` mayor: adoptar el remoto" (L193) no se dispara, porque 6 no es mayor que 6, y los aparatos quedan divergentes. El plan no dice qué `rev` recibe una partida restaurada (una regla razonable es `max(rev local, rev remoto) + 1`) ni qué hace `merge` con `rev` igual pero contenido o lápida distintos.
*Qué hacer:* fijar la regla y probarla en `tests/sync.mjs` (L464), cuya lista solo prueba "con y sin `rev` mayor que `deletedBaseRev`".

**B3. Puerta de la fase 2b invertida** (L471-472).
La L472 detiene el diseño "si una de las dos subidas simultáneas no recibe el error", pero la L471 espera justamente que una sola reciba `BlobPreconditionFailedError`. Leída al pie de la letra, la puerta detiene el diseño cuando la prueba pasa. Las L28 y L141 lo dicen bien (detener si ninguna o ambas reciben el error). Además, la L472 detiene el diseño si la creación sin `allowOverwrite` no falla, mientras la L141 limita la parada a la prueba de carrera y la L228 trata ese fallo como no verificado con reintento: hay que decir si es condición de parada o solo respaldo.

**B4. Configuración de Tailwind errónea** (L552-555, archivo 27).
Dice que se conserven los colores `ink`, `accent`, `brand` y las fuentes. En `index.html:15-66` no existe `brand`; las claves son `ink`, `accent`, `aqua`, `brand-text` y `brand-subtle`. También hay `borderRadius.4xl`, `animation` (`fade-in`, `rise`, `pop`, `float`) y `keyframes` que el plan omite. `App.tsx:508-509` usa `bg-aqua/10` y `animate-float`, así que seguir el texto cambiaría el aspecto en silencio. Los globs `content` no están fijados: deben cubrir `index.html`, `App.tsx`, `components/**`, `hooks/**` y `services/**` (los archivos están en la raíz, no en `src/`).

**B5. Renombrado "Importar" a "Restaurar copia" mal atribuido** (L601-604, archivo 36).
El plan lo asigna a `BoardPanel.tsx` y `ScreenshotImport.tsx`, pero "Importar" está en `components/GameSwitcher.tsx:95-107`. `GameSwitcher.tsx` falta en la lista del archivo 36 y `ScreenshotImport.tsx` no tiene texto que renombrar. El archivo 20 (L516) ya mueve Exportar/Importar a un menú "Copia de seguridad" en la fase 4, así que el renombrado choca con ese trabajo. El archivo 25 "oculta" Exportar e Importar sin aclarar si es el menú o los botones. Hay que usar una sola etiqueta final.

## Major (25)

**M1. La fase 2 rompe la fase 1** (L420, 439-449, 454). El archivo 8 cambia `saveGame` a `(game, origin)` y también `deleteGame` y `listGames`, pero ningún archivo de la fase 2 modifica `hooks/useGames.ts` ni `App.tsx`. El archivo 4 dice "origen `edit` desde la fase 2" y ninguno lo implementa: pasar `origin` en `updateActive`, `usage` en `select`, llamar a `purgeDeleted` y a `runInit({createDefault})`. Sin eso falla el typecheck, o `origin` queda opcional, que es una decisión no documentada.

**M2. Fase 1 mal delimitada** (L417-430). El archivo 6 cambia las props de `BoardPanel.tsx`, que no está en la lista de la fase (hoy recibe setters `onBoardChange`, `onRackChange`, `onBlanksChange` y `onClear`, `App.tsx:555-557`) y el nuevo contrato no se define. `GameSwitcher.tsx` y `Toast.tsx` consumen `useGames` y `useToast` y no están listados. Quedan sin asignar de `App.tsx`: `persistGame`, `saveStatus`, `pendingWrites` y `failedGames` (L100-118), el reintento de exportación (L381-395), `handleImportGames` (L397-421), el respaldo `createGame('Partida 1')` de la L324 y el incremento de `uses` en cada cambio (L347), pese a "sin cambio de comportamiento". El archivo 5 da 3 s a los avisos y pierde los 9 s del aviso con acción (`App.tsx:80`, el aviso Deshacer).

**M3. APIs de `useGames` y `useToast` sin definir** (L420, 425, 506). `useSync` "refresca `useGames`", pero el archivo 4 solo expone `activeGame`, `updateActive`, `select` y `onRemoteAdopted`; falta algo como `refresh()` o `applyRemote()`. No se define la forma de la señal `onRemoteAdopted`, ni quién la dispara (`useSync` según la L506, `useGames` según la L420), ni la forma del aviso persistente con acción. La fase 7 puede salir justo tras la fase 1 (L392), pero nada dispara la señal hasta la fase 4. Estas decisiones de API las consumen fases posteriores y deben fijarse en la fase 1.

**M4. `syncMerge` con valores sin definir** (L443, 454, 464). Faltan el algoritmo y el formato del id y de `editedBy` de la copia de conflicto, que deben ser idénticos en dos réplicas (y `crypto.subtle` es asíncrono mientras la función se describe como pura); la prueba del determinismo no da valor esperado. No se define qué campos cuentan como "contenido distinto", ni la forma del retorno de `merge` y de sus avisos. Falta el origen de guardado de la copia: con `edit` subiría `rev` a 2, pero la especificación pide `rev` 1 y `syncedRev` 0. Nadie normaliza un `rev` ausente a 1 al activar. Se omite la excepción de la regla 1 (L191): una partida local con `syncedRev > 0` ausente en remoto "no tiene lápida" y se conserva.

**M5. La purga de lápidas locales con sincronización activa no tiene responsable** (L454 frente a 198 y 446). La regla 4 dice que cada aparato elimina las lápidas que ya no están en el remoto; el archivo 9 dice que `merge` no purga, y la regla 1 puede leerse como "volver a subir lo que solo está en local". El archivo 8 solo purga con la sincronización desactivada. Nada implementa la limpieza local con sincronización activa, y ni las pruebas (L464) ni la cobertura (L616) la contemplan.

**M6. Firma de `saveGame` sin origen por defecto** (L439-449). Los llamadores son `App.tsx` `persistGame`, `backup.ts:111`, `runInit` (`gamesStore.ts:198` y `:205`) y pruebas con un solo argumento. No se dice qué origen usa `runInit` ni si `createGame` fija `rev`; es ambiguo si la primera edición de un registro sin `rev` escribe 1 o 2, aunque la L170 dice que `rev` ausente cuenta como 1. `usage` toca "solo `uses` y `lastUsedAt`", pero el registro se pasa entero y la semántica de mezcla no está definida. El archivo dice que `remote` "avisa" (L444), pero `saveGame` devuelve `Promise<void>` y no tiene canal de aviso.

**M7. Transacción de IndexedDB y respaldo `localStorage`** (L439-449). El helper `tx` actual (`gamesStore.ts:76-88`) envuelve una sola petición; la transacción atómica de lectura y escritura sobre `rev` necesita un helper nuevo. No se dice cómo se leen, escriben y purgan `rev` y lápidas en la ruta `localStorage` (`snapshot`, `readFallback`); la atomicidad entre pestañas queda sin especificar. `tests/persistence.mjs` corre en Node sin `indexedDB`, así que solo ejercita la ruta `localStorage` y la transacción queda sin prueba.

**M8. `listGames`, `snapshot` y lápidas en la ruta de respaldo** (L449; `gamesStore.ts:109-121, 142, 159`). `listGames` oculta las lápidas, pero también refresca el `snapshot` interno que usan `saveGame` y `deleteGame` en el respaldo. El `deleteGame` de respaldo llama a `listGames()` y reescribe toda la lista con `writeFallback`, borrando las lápidas existentes. Hace falta una función interna que liste todo, separada de la pública. `purgeDeleted(now)` no tiene llamador especificado ("en cada arranque").

**M9. `writeFallback` entre `try/catch` es ambiguo** (L449). `tests/persistence.mjs:49-52` exige que `saveGame` rechace cuando falla la escritura en `localStorage`, y `App.tsx` usa ese rechazo para mostrar el error. Si el `catch` lo traga, se rompen la prueba y la experiencia de error: el plan debe decir "registrar y relanzar". Otros `catch` de `gamesStore.ts` (L96, 103, 114, 138, 155, 165, 169, 203) están vacíos o solo con comentario; el plan dice que todos "registran el error" sin regla de relanzado por sitio.

**M10. `runInit({createDefault})` sin llamador y estado "primera sincronización pendiente"** (L228, 448; `gamesStore.ts:180-187`, `App.tsx:324`). `initGames()` cachea `initPromise` y no recibe argumentos. El respaldo de `App.tsx:324` crea "Partida 1" y rompe el CUJ 5. `gamesStore` necesita leer un estado que define el motor en `anagrama.sync.v1` (fase 3); no se dice qué clave o parámetro lee la fase 2, ni quién lo calcula, ni cómo se relee la lista tras la primera sincronización.

**M11. `diagnostics.ts` sin medio de almacenamiento** (L434-437). No se fija si es memoria o una clave de `localStorage`, ni su nombre ni el formato del registro. Registrar desde los `catch` de cuota excedida escribiría en un `localStorage` lleno.

**M12. Dependencias ocultas de la fase 2b** (L468-472, 499). `scripts/blob-race.mjs` usa `@vercel/blob`, que se añade en el archivo 17 (fase 3), después de la puerta. No dice cómo cargar las variables de entorno (qué archivo ni qué nombre de token); el `.gitignore` para `.env*` llega en la fase 3, así que un `.env` podría confirmarse antes. No dice cómo se obtiene el ETag ni qué devuelven `put` y `get`. La 2b no depende realmente de la fase 2 y, como puede matar el diseño, conviene ejecutarla antes.

**M13. Contrato HTTP incompleto** (L479, 484, 489, 218, 233, 237). Faltan el estado, el cuerpo y el ETag devueltos por un `PUT` exitoso, y el formato del ETag en `If-Match` (comillas); la respuesta a `PUT` sin `If-Match` cuando el Blob existe (`412` o `428`) y a `PUT` con `If-Match` cuando no existe; cómo representa `pull` un `304`; la respuesta a otros métodos (`405`); cómo se detecta el límite de 1 MB; la profundidad de validación de "objeto con partidas" (superficial o `isValidGame` por entrada); cómo se escribe `anagrama-sync.prev.json` y qué pasa si esa escritura falla. Los nombres de opciones del SDK (`useCache`, `ifMatch`, `BlobPreconditionFailedError`) no se pudieron verificar porque el paquete no está instalado. El `400` está sobrecargado: el servidor lo usa para cualquier cuerpo o `schemaVersion` inválido y el cliente lo traduce siempre a "Actualiza la app", así que un cuerpo mal formado mostraría un aviso de actualización falso. La firma de `SyncTransport` difiere (`pull()` y `push(doc, etag)` en la L218, frente a `pull(etag?)` y `push(doc, etag?)` en la L484). `tsconfig.json` no está en la lista, así que no se sabe si `api/` pasa el typecheck. La constante de 30 días está fija sin etiqueta "provisional".

**M14. Diseño del motor incompleto** (L486-494). No define la concurrencia de disparadores (`online` y `visibilitychange` durante un ciclo en curso, y la unión del temporizador de 2 s). Faltan estados del motor para `413` y `400` (el enum no los cubre). Las pruebas del motor (L494) no nombran `offline`, `syncing`, `disabled` ni `upToDate`, aunque el plan exige "todos los estados". No define la inyección de dependencias: las pruebas del archivo 16 corren en Node sin `window`, `localStorage` ni `fetch`, así que almacenamiento, reloj, temporizadores y fuente de eventos deben ser inyectables. `deviceId` (en `anagrama.deviceId.v1`) falta en la lista de persistencia del motor y no se dice si `disable()` lo conserva. La clave de la copia de seguridad es "una clave nueva" sin nombre.

**M15. Modos `pushOnly` y `full` sin definir** (L489, 494, 543, 220, 277, 511). No hay control para elegir el modo (`SyncPanel`, archivo 19, no lo tiene), así que el paso del archivo 25 no es ejecutable. `pushOnly` "no aplica datos remotos", pero el ciclo igual hace `pull` y `merge`; no se dice qué sube si el remoto tiene datos más nuevos (subir lo local pisaría ediciones remotas y contradice "nunca perder una edición"), ni cómo trata conflictos, `412` y los estados del chip. Los modos solo aparecen en el plan, no en la especificación del motor, y las L220 y L277 los llaman "solo subir / bidireccional".

**M16. Piezas de interfaz sin responsable** (L508-511, 516, 521-526, 540-543). La pantalla "Diagnóstico" (últimos 50 errores, última sincronización, pendientes) solo tiene "Copiar diagnóstico" en el archivo 19. La franja de error no tiene componente ni archivo propio; "pantalla", "panel" y "diálogo" se usan indistintamente para Sincronización. "Ocultar Exportar/Importar" no tiene archivo ni bandera. El archivo 25 dice "sin archivo nuevo" pero requiere cambios de código, está redactado como procedimiento bajo un encabezado de archivos, y su "marcha atrás" repite la L277.

**M17. Solapamiento entre las fases 4 y 7, aunque la 7 puede ir tras la 1** (L392, 513-516, 571-574, 604). Ambas modifican `GameSwitcher.tsx` y `App.tsx`. No se dice si el deshacer tras "Aplicar a la partida" (archivo 35) usa `useBoardHistory` (archivo 33) o `useToast`. Hay que fijar un orden entre 4 y 7 o dividir los archivos.

**M18. Cableado de la PWA incompleto** (L550-565). Nada registra el service worker (`registerSW` o `virtual:pwa-register`) ni monta `UpdateBanner`; el archivo 29 solo trata el estado del diccionario. `npm run typecheck` necesita los tipos cliente de `vite-plugin-pwa`; `tsconfig.json` tiene `types: ["node"]` y no está en la lista. Los tres PNG de iconos no tienen arte fuente. Los globs de precaché no están fijados: los valores por defecto de Workbox excluyen `.ts` y `.txt` en `public/` y no incluyen las fuentes `woff2` de Fontsource y Font Awesome, así que fallarían sin conexión; el worker se obtiene como `/services/anagramSolver.ts` en bruto (`App.tsx:128`) y se convierte en Blob, sin `globPatterns` ni `additionalManifestEntries`. La regla `CacheFirst` apunta a `public/services/dictionary.txt` (ruta del repo) y la app pide `/services/dictionary.txt` (`App.tsx:129`). "El worker" es ambiguo (Web Worker o service worker), y "descarga aparte" se trata como cerrado aunque la pregunta abierta de la L76 lo llama provisional.

**M19. Dependencias sin versiones ni ubicación** (L499, 552, 496). `@vercel/blob`, `@vercel/node` (¿`devDependency`?), `vite-plugin-pwa`, `@fontsource/inter`, `@fontsource/jetbrains-mono`, `@fortawesome/fontawesome-free`, `tailwindcss`, `postcss` y `autoprefixer` están nombrados sin versión (solo "Tailwind 3.4" está fijado). `postcss` hoy solo es transitiva. `package-lock.json` no está en ninguna lista, aunque cambiará. El estándar prohíbe añadir dependencias de forma oportunista.

**M20. Puerta de la fase 0 y archivos sin seguimiento** (L399-403, 535-538, 606-609). La puerta solo dice "confirmar los cambios" de cuatro archivos. El árbol también tiene sin seguimiento `components/README.md`, `data/README.md`, `services/README.md`, `tests/README.md`, `public/services/README.md`, `docs/` y los informes de la raíz (`comprehension_report.md`, `concepts_brief.md`, `critic_report.md`, `design_draft.md`, `goldfish_review_report.md`, `intermediate_zoom_out_report.md`, `zoom_out_report.md`). Un `git add -A` ciego los incluiría. Los archivos 24 y 37 "modifican" READMEs que aún no están en seguimiento; el 24 omite `public/services/README.md` y el 37 omite `data/README.md`.

**M21. Lista de archivos no leídos incoherente** (L29, 569, 528, 584). La L29 declara sin leer `wordCandidates.ts`, `glyphs.ts` y partes de `index.css`, y la L569 los quita de la lista de lectura previa. El archivo 23 (fase 4) modifica `wordCandidates.ts` y no está marcado como provisional. El archivo 32 modifica `ScrabbleBoard.tsx`, que no está en ninguna lista. `Results`, `WordInput` y `BoardBuilder` aparecen sin extensión (L29, 569).

**M22. Mantenimiento del diccionario: archivo contradictorio** (L430, 604, 241, 271). El archivo 6 dice que está en `App.tsx` y que no se toca. El archivo 36 lo integra como opción avanzada pero lista solo `BoardPanel.tsx` y `ScreenshotImport.tsx`. Hay que nombrar el archivo a modificar.

**M23. Atajos frente al campo oculto del tablero** (L594, 268). Los atajos son "inactivos dentro de campos de texto", pero Ctrl/Cmd+Z debe funcionar mientras se escribe en el input oculto del tablero (CUJ 7). Hay que decir si ese input cuenta como campo de texto y listar la excepción.

**M24. Alcance sin objetivo, CUJ ni línea de especificación** (L589, 599, 623). La lista de jugadas sin scroll anidado, los estados dudoso/ok/error con forma o texto, los roles de diálogo y la trampa de foco de `Overlay`, el aviso ⌘V en Mac y la comprobación de 11 px y contraste 4,5:1 no tienen origen. Hay que añadirlos a objetivos o CUJ, o quitarlos.

**M25. Verificación incoherente** (L471, 617, 494, 616, 620-622, 27, 76). La L471 comprueba `BlobPreconditionFailedError` y la L617 dice "una recibe `412`"; el script usa el SDK de Blob, no `api/sync.ts`, así que no hay estado HTTP. La comprobación de `get` con `useCache: false` no declara resultado esperado y no puede pasar ni fallar. La L620 exige los nueve CUJ en dos aparatos reales, pero la L27 asigna al bloque 1 solo los CUJ 1-5 y 9; los CUJ 6-8 son del bloque 3 y no necesitan segundo aparato, y la L621 repite el CUJ 2. La medición de arranque en frío está en "Móvil real (fase 7)" (L622), pero la pregunta abierta de la L76 la liga al bloque sin conexión (fase 6); el aparato es "gama media" en la L76 y "móvil del autor" en la L622. "Todas las ramas" (L616) no es medible: lista casos, no cobertura, y no nombra herramienta.

## Nit (23)

1.  **L391:** la fase 6 "depende de 0", pero el archivo 29 modifica `App.tsx`, que la fase 1 refactoriza. Declarar dependencia de la 1 o fijar el orden.
2.  **L496:** `.gitignore` aparece como Create junto a `.env.example`, pero ya existe: es Modify. Faltan las líneas exactas de `.env*` con negación.
3.  **L550 y 560:** `<link rel="manifest">` a mano y `vite-plugin-pwa` lo inyecta también. Al manifest le faltan `start_url`, `scope`, `background_color` y `lang`.
4.  **L411-624 y 459:** el plan de pruebas es global; las fases 1, 6 y 7 no tienen casos concretos y las comprobaciones manuales no están asignadas a una fase. La constante de 30 días no tiene hogar único (cliente y servidor). `buildBackup` descarta `syncedRev` y `lastUsedAt` pero no dice nada de `uses`, `rev` ni `editedBy`.
5.  **L378:** "se regeneró desde la especificación recortada (sin líder de Web Locks, …)" es historial de revisión; "Web Locks" y "líder" no están definidos y "la especificación" (también L454) no tiene referente.
6.  **L403:** "sesión anterior" y "cambios ya hechos" dependen del contexto de la conversación. Citar los archivos sin confirmar. El archivo 1 está numerado pero "no parte del diseño".
7.  **L384, 394, 472 y 617:** "puerta" se usa para la fase 0, la puerta 2b y el paso de verificación 2b.
8.  **L420:** "la usa la fase 4 y la 7" debe ser "la usan".
9.  **L408, 459, 168, 443 y 538:** `lastUsedAt` falta en la tabla del modelo de datos y en la validación de `isValidGame`, aunque la L538 promete una tabla en el README de lo que sincroniza.
10. **L489 y 447:** además de lo dicho sobre `deviceId`, "una sola" (L228) y "solo la última" describen la misma regla con otras palabras.
11. **L522-526:** el pie "Solo en este aparato" o "Sincronizado" no mapea estados del motor a textos. El pie actual (`App.tsx:617`) dice "Tu tablero y tus partidas se guardan en este dispositivo." y no menciona la red, así que "dejan de decir que no hay red" no aplica. El "Guardado" suelto es un `<p role="status">` en `App.tsx:503-505`.
12. **L538 y 609:** los archivos 24 y 37 editan los mismos cuatro README con contenido solapado. Fusionar o declarar el reparto.
13. **L540-543:** véase M16 sobre el archivo 25. Como residuo, "Marcha atrás: apagar el interruptor" repite la L277.
14. **L555:** "Capturas antes y después para comprobar que no cambia el aspecto" no tiene criterio de aceptación.
15. **L449:** `writeFallback` no se describe en ningún otro punto del documento.
16. **L574, 579 y 584:** "truncar a 40 caracteres" no tiene fuente (aunque el `.slice(0,40)` existe en `GameSwitcher:81`); "botones hermanos de 44 px" debería decir "mínimo 44 px"; los `tabpanel` y la "dirección" `aria-live` se añaden a las listas de la especificación (L265-266) sin mención.
17. **L613 y 550:** la comprobación en `dist/` nombra cuatro dominios mientras la L28 dice que no hay dominios externos. Falta `fonts.gstatic.com`, y los `preconnect` a `fonts.googleapis.com` y `fonts.gstatic.com` (`index.html:11-12`) no se nombran. "Las cifras de `tests/regresion.mjs` no deben cambiar" no dice cuáles.
18. **L619, 623 y 624:** no se indica cómo inspeccionar valores de `rev` almacenados. La L623 mete una acción correctiva dentro de un paso de medición. La L624 dice "consola de Chrome" aunque los riesgos incluyen iOS Safari.
19. **Todo el bloque:** etiquetas en inglés (Type / Scope, Proposed Changes, Target Files, Given/When/Then) en un documento en español. Mantenerlas solo si la plantilla lo exige y decirlo una vez.
20. **L413 (archivo 3):** `restoreBackup` añade "(importada)" solo cuando el nombre entrante ya existe (`backup.ts:99`), no cuando el id choca con contenido distinto.
21. **L521 (archivo 21):** `Toast.tsx:19` ya tiene `role="status"` y ya admite `action` (`ToastAction`). El temporizador de cierre vive en `showToast` de `App.tsx`. Debería decir solo "añadir `role="alert"` para errores y un modo persistente".
22. **L464 y 494:** `tests/sync.mjs` importa TypeScript desde `.mjs` y el plan no dice usar el patrón de bundle con esbuild de `persistence.mjs:18`. Los disparadores `visibilitychange` y `online` necesitan stubs de DOM en Node.
23. **L408:** `byRecent` en `listGames` y el desempate de `sortByUsage` siguen usando `updatedAt`, y `App.tsx:363` y `:426` fijan `updatedAt` al abrir y renombrar. El texto de la fase 0 no dice si eso cesa en la fase 0.

--------------------------------------------------------------------------------

## Totales

*   **Blocker:** 5
*   **Major:** 25
*   **Nit:** 23
*   **Total:** 53 hallazgos únicos tras deduplicar entre los tres revisores.
