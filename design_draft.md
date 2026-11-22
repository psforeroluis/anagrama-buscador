# Anagrama: sincronización de partidas, uso sin conexión y mejoras de uso en móvil y ordenador

*   **Author:** psforeroluis
*   **Status:** Draft
*   **Date:** 2026-11-22

--------------------------------------------------------------------------------

## Overview

Anagrama es una app web personal, de un solo usuario, para buscar anagramas y calcular jugadas sobre un tablero de 15 × 15. Hoy guarda todo en el navegador de cada aparato (IndexedDB, con `localStorage` como respaldo) y no usa servidor ni claves.

Este documento cubre un solo conjunto de cambios con tres bloques:

1. **Sincronización de partidas** entre móvil y ordenador, con el almacenamiento local como fuente de verdad y la nube como copia en segundo plano.
2. **Uso sin conexión real**: quitar las dependencias de red en tiempo de ejecución y añadir una app instalable con caché.
3. **Uso en móvil y ordenador**: botones táctiles, entrada de letras en el tablero, accesibilidad, atajos de teclado, deshacer y flujo de importar captura.

El motor de búsqueda de anagramas y jugadas (Web Worker) no cambia.

## The Problem

Para seguir una partida en otro aparato hay que exportar un JSON en uno e importarlo en el otro. Es lento y se olvida. Como cada aparato conserva su propia copia, el usuario nunca sabe cuál es la más reciente.

Además, la app no es tan local como dice ser. `index.html` carga Tailwind, iconos, fuentes y React desde servidores externos al ejecutarse, y no hay manifest ni service worker. Sin red la app puede no arrancar. En el móvil, que es donde más se juega, hay botones de 28 px, renombrar solo con doble clic, un teclado virtual que tapa el tablero y filas de partida que no se pueden usar con teclado.

La solución propuesta es una sincronización "local primero": cada edición se guarda al instante en el aparato y una cola en segundo plano la envía a una función serverless personal. Sin red o sin sesión, la app funciona como hoy. En paralelo se corrigen las dependencias de red y los problemas de uso en móvil y ordenador.

## Goals

*   Seguir la misma partida en móvil y ordenador sin exportar ni importar archivos a mano. Una partida editada en un aparato aparece en el otro al abrir la app o al volver a estar en línea.
*   Nunca perder una edición en silencio. Si dos versiones chocan, se conserva la perdedora como "Nombre (conflicto)".
*   Borrar una partida en un aparato la borra en el otro, con una papelera de 30 días y Deshacer.
*   Mostrar el estado de la sincronización por separado de "Guardado" (sin sesión, sincronizando, sincronizado hace X, sin conexión con N pendientes, error).
*   Abrir y usar la app sin red después de la primera visita, con el diccionario en caché.
*   Que todos los botones de acción en pantalla táctil midan al menos 44 px y no dependan de pasar el ratón por encima.
*   Poder renombrar una partida sin doble clic y escribir en el tablero del móvil sin que el teclado tape la celda activa.
*   Poder usar la lista de partidas, las pestañas y el tablero solo con teclado, y salir del tablero con Tab.
*   Deshacer y rehacer en el tablero (Ctrl/Cmd+Z, y botón en móvil).
*   Avisar antes de que "Aplicar a la partida" o cerrar la importación de captura descarten trabajo.
*   Mantener Exportar/Importar JSON como copia de seguridad que no necesita cuenta.
*   Que el núcleo (anagramas y jugadas de tablero) siga funcionando igual, con las pruebas actuales en verde.

## Non-Goals

*   Multijugador, otros idiomas y otros juegos.
*   Cuentas con perfiles, compartir partidas, historial de versiones y edición en tiempo real.
*   CRDT y fusión del tablero por celdas.
*   Sincronizar capturas de pantalla o ficheros binarios.
*   Sincronizar palabras vetadas, palabras candidatas y plantillas de letras en esta fase. Siguen por copia JSON.
*   Sincronizar el orden por uso, el contador `uses`, la partida activa y el recorte de captura: son datos de cada aparato.
*   Cambiar el algoritmo de búsqueda, el diccionario o el Web Worker.
*   Reutilizar `restoreBackup` como algoritmo de sincronización.

## Open Questions

*   **Plazo de las lápidas**: ¿cuántos días se conserva una partida borrada antes de purgarla? Propuesta del brief: 30 días. Pendiente de confirmar.
*   **Origen fijo en Vercel**: IndexedDB es por origen. Hay que confirmar la URL definitiva (`data/README.md` cita `anagrama-buscador.vercel.app`) y revisar `vite.config.ts` antes de mover datos.
*   **Alta del almacén en Vercel**: hay que crear un almacén Vercel Blob privado en el panel del proyecto y definir las variables `SYNC_TOKEN` y las de Blob. Lo hace el autor; el repo no contiene `vercel.json` ni carpeta `api/`.
*   **Arranque del diccionario en móvil**: `dictionary.txt` tiene 688.255 líneas y pesa 7,7 MB sin comprimir. Falta medir el tiempo de arranque (descarga y construcción del DAWG) en un móvil de gama media antes de decidir si se cambia la carga.
*   **Teclados Android**: falta comprobar si el input oculto del tablero recibe `e.key` válidos o "Unidentified".
*   **Aparatos del autor**: ¿se usa Safari en iPhone y/o Android Chrome? Condiciona la instalación como app (manifest) y la entrada de letras.
*   **Qué leyeron los revisores**: no se leyeron a fondo `BoardPanel.tsx`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast`, `wordCandidates.ts`, `boardImage.ts`, `glyphs.ts` ni partes de `index.css`. Los hallazgos que dependen de ellos se verificarán al planificar la implementación.

## Critical User Journeys (CUJs)

### CUJ 1: Seguir una partida en otro aparato

*   **Given**: La sincronización está activada en el móvil y en el ordenador con el mismo token. El ordenador tiene la partida "Liga del viernes" con 40 fichas.
*   **When**: El usuario añade una jugada en el ordenador, cierra la pestaña y abre la app en el móvil.
*   **Then**: El móvil muestra "Liga del viernes" con la jugada nueva, sin exportar ni importar. El indicador dice "Sincronizado hace unos segundos".

### CUJ 2: Jugar sin red y ponerse al día

*   **Given**: La app instalada en el móvil, con la caché del diccionario cargada. No hay conexión.
*   **When**: El usuario edita tres partidas y vuelve a tener red.
*   **Then**: La app funcionó sin red todo el rato y el indicador mostró "Sin conexión, 3 pendientes". Al volver la red envía los cambios y pasa a "Sincronizado".

### CUJ 3: Dos versiones chocan

*   **Given**: El usuario editó la partida A en el móvil sin red y, después, editó la misma partida en el ordenador con red.
*   **When**: El móvil recupera la red y sincroniza.
*   **Then**: Gana la versión con la revisión más reciente. La otra se guarda como "A (conflicto)" y un aviso lo dice. No se pierde ninguna edición.

### CUJ 4: Borrar y deshacer entre aparatos

*   **Given**: La partida B existe en ambos aparatos.
*   **When**: El usuario la elimina en el ordenador y, días después, la busca en "Eliminadas recientemente" del móvil.
*   **Then**: B desapareció de la lista del móvil tras sincronizar. Está en la papelera y se puede restaurar hasta cumplirse el plazo. Después se purga.

### CUJ 5: Primera sincronización con datos en ambos lados

*   **Given**: El ordenador tiene 5 partidas y el móvil 3, y el servidor está vacío.
*   **When**: El usuario activa la sincronización en el ordenador y después en el móvil.
*   **Then**: Se hace una copia automática antes de empezar. El servidor acaba con la unión de las 8 partidas por id y ningún aparato pierde datos. No se crea una "Partida 1" vacía durante el proceso.

### CUJ 6: Jugar con una mano en el móvil

*   **Given**: El usuario tiene el tablero abierto en un móvil de 360 px.
*   **When**: Toca una casilla y escribe una palabra, renombra una partida y pulsa "Mejor jugada".
*   **Then**: La casilla activa sigue visible sobre el teclado, renombrar tiene un botón visible, todos los botones miden al menos 44 px y "Mejor jugada" queda al alcance del pulgar.

### CUJ 7: Usar el ordenador solo con teclado

*   **Given**: El usuario abre la app en el ordenador.
*   **When**: Cambia de pestaña, elige una partida de la lista, entra al tablero, escribe y sale con Tab.
*   **Then**: Cada paso se hace con flechas, Enter, F2/Supr o Tab, sin quedar atrapado en el tablero. Ctrl/Cmd+Z deshace la última edición del tablero.

### CUJ 8: Importar una captura sin perder trabajo

*   **Given**: El usuario corrigió 30 letras tras leer una captura. La partida activa ya tiene fichas.
*   **When**: Pulsa "Aplicar a la partida" o cierra el diálogo.
*   **Then**: La app muestra el nombre de la partida destino y avisa de que ya tiene contenido. Ofrece "aplicar aquí" o "nueva partida", y Deshacer después. Cerrar pide confirmación si hay correcciones sin aplicar.

## Technical Plan (Architecture)

### Decisiones de arquitectura tomadas por el autor

*   **Servidor: un único documento.** El servidor guarda toda la colección de partidas en un solo JSON.
*   **Almacén: Vercel Blob privado.** Soporta escritura condicional con `put(..., { ifMatch: etag })`, que falla con `BlobPreconditionFailedError` si el fichero cambió, y lectura sin caché con `get(..., { useCache: false })`. Esto se comprobó en la documentación de Vercel el 2026-11-22.
*   **Conflictos: un aparato activo a la vez.** Gana la versión con más revisiones; la otra se conserva como copia.
*   **Entrada de letras en móvil: teclado del sistema, arreglado** con `beforeinput`/`input` y `visualViewport`.

### Vista general

```text
 Móvil / Ordenador                                       Vercel
┌──────────────────────────────────────┐     ┌──────────────────────────────┐
│ App (React)                          │     │ api/sync.ts (función)        │
│  useGames ──► gamesStore (IndexedDB) │     │  GET  -> Blob + ETag         │
│     │  edición local: rev+1, pending │     │  PUT  -> put(ifMatch=ETag)   │
│     ▼                                │     │  token: SYNC_TOKEN (env)     │
│  syncEngine (1 pestaña líder)        │     └──────────────┬───────────────┘
│   pull ─► syncMerge(local, remoto)   │  HTTPS             │
│   push ─► PUT con If-Match           │◄──────────────────►│  Vercel Blob
│  Estado: sin sesión / sincronizando  │                    │  (privado) 1 JSON
│  / al día / sin red / error          │                    └──────────────────┘
└──────────────────────────────────────┘
 Sin token o sin red: todo funciona como hoy (local primero).
```

### Modelo de datos

Las partidas ganan campos opcionales (las anteriores siguen siendo válidas en `isValidGame`):

| Campo | Dónde | Significado |
|---|---|---|
| `rev` | local y remoto | Contador entero. Sube 1 en cada edición local (tablero, atril, comodines, nombre, borrado, restauración). No sube al abrir la partida ni al aplicar datos remotos. |
| `syncedRev` | solo local | Última `rev` que se sabe que está en el servidor. La partida tiene cambios pendientes si `rev > syncedRev`. |
| `editedBy` | local y remoto | Identificador aleatorio del aparato que hizo la última edición. Solo desempata. |
| `deletedAt` | local y remoto | Marca de borrado (lápida). La partida se conserva con su contenido hasta purgarla. |
| `uses` | solo local | Ya existe. No se sube; el orden por uso es propio de cada aparato. |

Documento remoto:

```text
{ schemaVersion: 1,
  games: { "<id>": { id, name, board, rack, blanks, createdAt, updatedAt,
                     rev, editedBy, deletedAt? } } }
```

`updatedAt` viaja solo como información (por ejemplo, para mostrar "hace X"). Ninguna decisión de fusión usa relojes. Tamaño esperado: menos de 1 KB por partida. El servidor rechaza documentos de más de 1 MB.

### Fusión (función pura `syncMerge`)

Se usa tanto en la sincronización como en la restauración de copias. Para cada `id`:

1.  Solo existe en un lado: se toma esa versión.
2.  Existe en ambos:
    *   Local sin cambios (`rev == syncedRev`) y remoto con `rev` mayor: se adopta el remoto.
    *   Local con cambios y remoto sin cambios (`remote.rev == syncedRev`): se conserva el local y se sube.
    *   Cambiaron los dos lados: gana la `rev` más alta (empate: gana el `editedBy` menor en orden de texto). La perdedora se guarda como partida nueva con id nuevo y nombre "Nombre (conflicto)", y se avisa.
3.  Una lápida con `rev` mayor gana a una edición con `rev` menor. Una edición posterior a la lápida la anula (restaurar es una edición).
4.  Las lápidas con `deletedAt` de hace más de 30 días se purgan del documento remoto y del almacenamiento local.

Todo dato remoto pasa por `isValidGame` antes de entrar en local. El resultado de la fusión nunca borra una partida local sin lápida.

### Cambios en el guardado local

`saveGame` hoy fija `updatedAt = Date.now()` en cada guardado (`services/gamesStore.ts:127-143`). Pasa a recibir un origen:

*   `edit`: sube `rev`, fija `updatedAt` y marca la partida como pendiente.
*   `usage`: solo cambia `uses` (abrir una partida). No toca `rev`, `updatedAt` ni pendientes.
*   `remote`: aplica datos remotos conservando `rev`, `updatedAt` y `syncedRev`. No marca pendiente, para evitar ecos.

`deleteGame` marca `deletedAt` y sube `rev` en lugar de borrar. El Deshacer de 9 s y "Eliminadas recientemente" quitan la lápida con una edición. `listGames` oculta las partidas con lápida; un listado aparte alimenta la papelera.

### Motor de sincronización

Módulo nuevo `services/sync/` con tres piezas:

*   **Cliente de transporte** detrás de una interfaz `SyncTransport` (`pull()` y `push(doc, etag)`). La implementación usa `fetch` a `/api/sync` con `Authorization: Bearer <token>`. Cambiar de proveedor solo toca esta pieza.
*   **Fusión pura** (`syncMerge`), probada en Node.
*   **Motor** con estados `desactivado | sinSesión | sincronizando | alDía | sinRed | error`. Guarda en `localStorage`: token, `deviceId`, último ETag, `lastSyncedAt` y último error.

Disparadores: al arrancar, al volver la pestaña a primer plano (`visibilitychange`), al recuperar red (`online`), 2 s después de una edición local, y al ocultar la página con `fetch` con `keepalive`. Si falla, reintenta con espera creciente; los pendientes se deducen de `rev > syncedRev`, así que sobreviven a recargas.

Ciclo de una sincronización: `GET` (con `If-None-Match`) → fusión → aplicar a local con origen `remote` → si hay cambios locales, `PUT` con `If-Match` = ETag leído. Un `412` repite el ciclo desde el `GET` (máximo 3 intentos seguidos).

**Varias pestañas.** Una sola pestaña sincroniza, elegida con Web Locks (`anagrama-sync`). Las demás se enteran de los cambios por `BroadcastChannel` y releen el almacenamiento local.

**Primera sincronización.** Antes de empezar se guarda una copia automática (`buildBackup()`) en `localStorage` bajo una clave nueva, conservando las 3 últimas. Si el servidor no tiene documento, se crea con las partidas locales (`put` sin `allowOverwrite`; si otro aparato lo creó antes, el `put` falla y se repite el ciclo). Si lo tiene, se hace la unión por `id`. Mientras la primera sincronización está pendiente y no hay partidas locales, no se crea "Partida 1" (cambio en `runInit`).

### Función serverless `api/sync.ts`

*   `GET`: lee el Blob con `get(path, { access: 'private', useCache: false })` y devuelve el JSON con su `ETag`. Sin Blob: `404`.
*   `PUT`: exige `If-Match` (o ausencia del Blob para crear). Valida `schemaVersion`, tamaño máximo y que el cuerpo sea un objeto con partidas. Escribe con `put(path, body, { access: 'private', allowOverwrite: true, ifMatch })`. Si salta `BlobPreconditionFailedError`, responde `412`.
*   Autenticación: comparación en tiempo constante del bearer con `SYNC_TOKEN`. Respuestas `401` sin detalles. Sin token válido no se lee ni escribe nada.
*   Mismo origen que la app, así que no hace falta CORS. El token nunca se compila en el cliente: el usuario lo pega una vez en cada aparato (pantalla "Sincronización" y `localStorage`).
*   Cerrar sesión en un aparato borra el token y los metadatos de sincronización de ese aparato, sin tocar las partidas.

### Refactor de `App.tsx` (previo a la sincronización, sin cambio de comportamiento)

`App.tsx` mezcla worker, búsqueda, partidas, mantenimiento, avisos y diseño, y duplica el estado de la partida activa (`board`, `boardRack`, `boardBlanks`) reponiéndolo a mano en cinco sitios con `skipSaveRef`. Se separa en hooks:

*   `useGames`: lista de partidas y `activeGameId`. La partida activa es un valor derivado, no tres `useState` copiados. Recibe cambios con origen `edit`, `usage` o `remote`. Elimina `skipSaveRef`.
*   `useSolverWorker`, `useDictionaryMaintenance`, `useToast`, `useSync` y `useHotkeys`.

Si llega un cambio remoto a la partida abierta y esa partida no tiene cambios pendientes, se adopta y se avisa con un aviso. Si los tiene, se aplica la regla de conflicto de la fusión.

### Estado visible

Un chip junto a la lista de partidas sustituye al "Guardado" suelto de `App.tsx:503`. Muestra por separado "Guardado en este aparato" y el estado de sincronización ("Sincronizado hace X", "Sin conexión · N pendientes", "Error: …"). Los errores persistentes usan una franja con botón "Reintentar", no un aviso de 3 s. Una pantalla "Diagnóstico" lista los últimos 200 eventos (partida, `rev` local y remota, decisión) y se puede copiar. Los `catch {}` de `gamesStore.ts`, `wordBlocklist.ts` y `App.tsx` pasan a registrar el error en ese listado.

### Uso sin conexión

*   **Quitar la red de `index.html`**: Tailwind por PostCSS con `tailwind.config.js` (la configuración inline se traslada tal cual, sin cambiar de versión mayor), fuentes con `@fontsource` (Inter y JetBrains Mono), Font Awesome desde el paquete local y fuera el `importmap` a `aistudiocdn.com`.
*   **App instalable**: `manifest` (iconos 192 y 512, `maskable`, `display: standalone`) y service worker con `vite-plugin-pwa` (Workbox). Precaché del shell, del worker y de `dictionary.txt` (se sube el límite de tamaño del precaché). `/api/sync` va siempre a red (`NetworkOnly`). Registro con aviso "Hay una versión nueva · Recargar", nunca una recarga automática a mitad de partida.
*   **Medición**: `performance.mark` alrededor de la descarga del diccionario, la construcción del DAWG y `solveBoard`. No se cambia la carga del diccionario hasta ver los números.

### Mejoras de uso en móvil y ordenador

*   **Botones táctiles**: mínimo 44 px. La visibilidad de las acciones de fila se decide con `@media (hover: hover)` y `(pointer: coarse)`, no con el ancho de pantalla. Renombrar tiene botón visible; en teclado, F2 renombra y Supr pide confirmar el borrado.
*   **Filas de partida**: la zona principal pasa a ser un `<button>` (selección por Tab/Enter) con las acciones como botones hermanos. Se muestra la hora de la última edición también en móvil y se avisa de nombres duplicados al renombrar.
*   **Pestañas accesibles**: componente `Tabs` con `role="tablist"`, `tab`, `aria-selected` y flechas.
*   **Tablero**: entrada con `beforeinput`/`input` y `visualViewport` para mantener visible la casilla activa. Tab sale del tablero (la dirección se cambia con otra tecla), `Escape` suelta el foco, y se anuncian fila y columna en una región `aria-live`. Las 225 casillas pasan a un componente `Cell` memoizado. `touch-action: manipulation` en el tablero.
*   **Deshacer/rehacer del tablero**: pila en memoria de 50 pasos por partida activa, que se vacía al cambiar de partida y no se sincroniza. Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, y botones en móvil. "Vaciar tablero" entra en la pila.
*   **Atajos** (`useHotkeys`, inactivos dentro de campos de texto): Ctrl/Cmd+Enter buscar o "Mejor jugada", `/` buscar partida, Alt+N nueva partida, `?` ayuda.
*   **Escritorio y móvil**: en pantallas grandes se amplía el ancho máximo y la lista de partidas pasa a barra lateral plegable. En móvil "Mejor jugada" queda fija abajo.
*   **Importar captura**: "Aplicar a la partida" muestra la partida destino, avisa si tiene fichas y ofrece "aplicar aquí" o "nueva partida", con Deshacer. Cerrar con correcciones sin aplicar pide confirmación y "Reajustar" conserva las correcciones. En móvil se quitan las pistas de "arrastra / Ctrl+V" y se añaden botones en pantalla para vaciar y comodín. "Leer captura" pasa a "Leer tablero desde captura" e "Importar" a "Restaurar copia".
*   **Textos**: el pie de `App.tsx` y los READMEs dejan de decir que no hay red ("Solo en este aparato" o "Sincronizado con tu cuenta" según el estado). Un único vocabulario: partida (no "juego"), detectadas (no "candidatas") y alta/baja solo dentro de Mantenimiento, plegado como opción avanzada.

### Seguridad, rendimiento y despliegue

*   **Seguridad y privacidad**: las partidas no son datos sensibles, pero el Blob es privado y el token vive solo en variables de entorno del servidor y en el `localStorage` de cada aparato. El token nunca va en URL.
*   **Rendimiento**: el documento pesa unos pocos KB; el coste de nube es despreciable. La carga del diccionario no cambia en este diseño.
*   **Despliegue por fases con interruptor**: la sincronización viene apagada por defecto. Orden: solo subir, luego bidireccional, luego ocultar (no quitar) Exportar/Importar. Marcha atrás: apagar el interruptor; lo local sigue siendo la fuente de verdad y ningún mensaje del servidor borra datos locales.

## Alternatives Considered

### Alternative A: Servicio gestionado (Supabase, Firebase, Appwrite)

*   **Pros**: Menos código propio; autenticación con enlace mágico o passkey y reglas de seguridad por usuario ya resueltas.
*   **Cons**: Añade un SDK y una dependencia externa a una app que hoy no tiene ninguna. Más superficie de configuración para un solo usuario.
*   **Reason for Rejection**: Rejected by author: se prefiere un token personal y una función serverless propia, sin registro y sin dependencias nuevas en el cliente.

### Alternative B: Cifrado de extremo a extremo con emparejamiento por QR

*   **Pros**: El servidor no puede leer las partidas; no hace falta cuenta.
*   **Cons**: Perder la clave implica perder los datos y exige una frase de recuperación. Más piezas de interfaz (QR, emparejado).
*   **Reason for Rejection**: Rejected by author: el riesgo de perder datos y la complejidad no compensan para partidas que no son sensibles.

### Alternative C: CRDT (Yjs, Automerge) o fusión del tablero por celdas

*   **Pros**: Permite editar la misma partida en dos aparatos a la vez sin perder cambios.
*   **Cons**: Cambia el modelo de datos de todas las partidas, añade una dependencia y una interfaz propia para resolver choques. Sobredimensionado para un usuario con dos aparatos.
*   **Reason for Rejection**: Rejected by author: se trabaja con un aparato activo a la vez. Ganador por partida con copia "(conflicto)" cubre ese uso con una función de fusión pequeña. Cuatro de siete revisores recomendaron esta opción.

### Alternative D: Carpeta de nube (Drive, iCloud) con el JSON de copia

*   **Pros**: Sin servidor propio.
*   **Cons**: Frágil en iOS y sin sincronización automática; sigue siendo un paso manual en el aparato.
*   **Reason for Rejection**: Rejected by author: no resuelve la queja principal, que es el paso manual.

### Alternative E: Servidor con un registro por partida

*   **Pros**: Encaja con "gana la última versión por partida" y envía solo lo que cambió.
*   **Cons**: Exige almacén con listado de claves y escritura condicional por registro, y más lógica en el servidor.
*   **Reason for Rejection**: Rejected by author: para un usuario y unas decenas de partidas de menos de 1 KB, un único documento con `If-Match` es más simple y reutiliza el formato de copia de seguridad.

### Alternative F: Servidor con registro de cambios y cursor

*   **Pros**: Sincronización incremental sencilla e historial gratis.
*   **Cons**: El registro crece y necesita compactarse; es una pieza más que mantener.
*   **Reason for Rejection**: Rejected by author: el historial de eventos no se pide y añade mantenimiento.

### Alternative G: Redis de Marketplace (Upstash) o Cloudflare Workers con KV como almacén

*   **Pros**: Redis ofrece operaciones atómicas exactas; Cloudflare tiene cuota gratuita amplia.
*   **Cons**: Redis añade una integración y una cuota externas. Cloudflare KV es de consistencia eventual: un aparato puede leer una versión vieja hasta 60 s después de que otro escriba, y obliga a configurar CORS y mantener dos plataformas.
*   **Reason for Rejection**: Rejected by author: Vercel Blob privado con `ifMatch` cubre la escritura condicional dentro de la plataforma donde ya se aloja la app.

### Alternative H: Teclado propio en pantalla para el tablero móvil (con o sin interruptor)

*   **Pros**: No tapa el tablero y limita las letras a las del atril; botones del tamaño que se quiera.
*   **Cons**: Pieza de interfaz nueva que mantener, ocupa pantalla y quita teclas conocidas. Con interruptor, son dos caminos de entrada que probar.
*   **Reason for Rejection**: Rejected by author: se arregla el teclado del sistema con `beforeinput`/`input` y `visualViewport`, un cambio más pequeño que sirve también en ordenador.

### Alternative I: Sincronizar todo desde el principio (vetadas, candidatas y plantillas)

*   **Pros**: Evita el aviso "Primera vez" de las plantillas en el segundo aparato y que las vetadas difieran entre aparatos.
*   **Cons**: Exige modelo por elemento con fecha y lápida por palabra, y que el mantenimiento del diccionario emita lápidas; si no, las palabras eliminadas reaparecen.
*   **Reason for Rejection**: Rejected by author: se aplaza a una segunda fase para acotar el riesgo de la primera. Hasta entonces siguen por copia JSON.

### Alternative J: No cambiar nada (seguir con exportar e importar)

*   **Pros**: Cero trabajo y cero riesgo.
*   **Cons**: Es el estado actual y el origen de la queja principal.
*   **Reason for Rejection**: Rejected by author: el paso manual es el problema que se quiere eliminar.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

El trabajo se hace en siete fases, en este orden. Cada fase deja `npm test`, `npm run typecheck` y `npm run build` en verde y se puede fusionar por separado. Las fases 3 a 5 dependen de la 2; las fases 6 y 7 son independientes entre sí y de la sincronización.

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Consolidar cambios sin confirmar y fijar el comportamiento actual con pruebas | — |
| 1 | Refactor de `App.tsx` en hooks, sin cambio de comportamiento | 0 |
| 2 | Almacenamiento local preparado para sincronizar (`rev`, orígenes de guardado, lápidas) y fusión pura | 1 |
| 3 | Función serverless y motor de sincronización, apagado por defecto | 2 |
| 4 | Interfaz de sincronización: estado, token, papelera, diagnóstico | 3 |
| 5 | Despliegue por fases y textos | 4 |
| 6 | Sin conexión: quitar CDNs, PWA | 0 |
| 7 | Uso en móvil y ordenador: táctil, accesibilidad, atajos, deshacer, captura | 1 |

### Target Files to Create/Modify

#### Fase 0 y documentación base

##### 1. `services/gamesStore.ts`, `components/GameSwitcher.tsx`, `App.tsx`, `tests/persistence.mjs` (Modify, ya hechos)

*   **Type / Scope**: Cambios sin confirmar de la sesión anterior: diálogo de nombre al crear partida, `uses`, `usageScore`, `sortByUsage`.
*   **Proposed Changes**: Confirmarlos en un commit antes de empezar. Añadir en `tests/persistence.mjs` las pruebas que fijan el comportamiento que cambiará en la fase 2: `saveGame` pone `updatedAt` en cada guardado, `deleteGame` borra de verdad, `restoreBackup` crea copias "(importada)".

##### 2. `README.md`, `services/README.md`, `components/README.md`, `tests/README.md` (Modify)

*   **Type / Scope**: Documentación.
*   **Proposed Changes**: Al final de cada fase, actualizar lo que cambió. Quitar la afirmación de que no hay red (`README.md` y `services/README.md`, línea 3) cuando llegue la fase 3 y explicar qué se sincroniza y qué es local (tabla del modelo de datos de este documento).

#### Fase 1: refactor de `App.tsx`

##### 3. `hooks/useGames.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Reúne lo que hoy hace `App.tsx:320-467`: carga inicial (`initGames`), lista de partidas, `activeGameId`, selección, creación, renombrado, borrado y deshacer. La partida activa es un valor derivado (`games.find(g => g.id === activeGameId)`); se eliminan `board`, `boardRack`, `boardBlanks` como estados copiados y `skipSaveRef`. Expone `activeGame`, `updateActive(patch)` (origen `edit`) y `select(id)` (origen `usage`). Pseudocódigo de `updateActive`: `next = {...active, ...patch}; setGames(replace(next)); persist(next, 'edit')`.

##### 4. `hooks/useSolverWorker.ts`, `hooks/useDictionaryMaintenance.ts`, `hooks/useToast.ts` (Create)

*   **Type / Scope**: Hooks de React.
*   **Proposed Changes**: Mover sin cambiar comportamiento el ciclo de vida del worker y el envío de mensajes (`App.tsx:21-27`, `121-246`), el mantenimiento del diccionario (`App.tsx:297-318`) y los avisos (`showToast`, `closeToast`). `useToast` admite avisos persistentes con acción (para errores) además de los de 3 s.

##### 5. `App.tsx` (Modify)

*   **Type / Scope**: Componente raíz.
*   **Proposed Changes**: Pasa a componer los hooks anteriores y a renderizar. Los tres props `board`, `rack`, `blanks` de `BoardPanel` salen de `activeGame`. Sin cambio visible. Las pruebas de la fase 0 y `npm test` deben seguir pasando.

#### Fase 2: almacenamiento local y fusión

##### 6. `services/gamesStore.ts` (Modify)

*   **Type / Scope**: Modelo de datos y persistencia.
*   **Proposed Changes**:
    *   `Game` gana `rev?`, `syncedRev?`, `editedBy?` y `deletedAt?`, todos opcionales. `isValidGame` los valida solo si existen (enteros no negativos; `deletedAt` número finito).
    *   `saveGame(game, origin)` con `origin ∈ {'edit','usage','remote'}`. `edit`: `rev = (rev ?? 0) + 1`, `updatedAt = ahora`, `editedBy = deviceId`. `usage`: solo `uses`. `remote`: guarda tal cual, sin tocar `rev` ni `updatedAt`.
    *   `deleteGame(id)` pasa a escribir `deletedAt` y subir `rev` (origen `edit`). Nueva `purgeDeleted(now)` que borra de verdad las lápidas de más de 30 días. `listGames()` oculta las lápidas; `listDeletedGames()` las devuelve.
    *   `writeFallback` pasa a ir dentro de `try/catch` y los `catch {}` registran el error en el registro de diagnóstico (fase 4) en lugar de callarlo.
    *   `runInit` recibe `{ createDefault: boolean }` y no crea "Partida 1" cuando la primera sincronización está pendiente.
    *   `deviceId`: identificador aleatorio persistido en `localStorage` (`anagrama.deviceId.v1`).

##### 7. `services/sync/syncMerge.ts` (Create)

*   **Type / Scope**: Función pura, sin acceso a red ni a almacenamiento.
*   **Proposed Changes**: `merge(local: Game[], remote: SyncDoc, now): { toLocal: Game[], toRemote: SyncDoc, conflicts: Game[], purged: string[] }` aplicando las reglas del Technical Plan (solo un lado, cambios en un lado, choque con copia "(conflicto)", lápidas, purga a 30 días). Las copias de conflicto reciben `id` nuevo y `rev = 1`. Verifica cada partida remota con `isValidGame` y descarta las inválidas con un aviso en el resultado.

##### 8. `services/backup.ts` (Modify)

*   **Type / Scope**: Copia de seguridad.
*   **Proposed Changes**: `restoreBackup` deja de decidir por su cuenta qué hacer con los `id` repetidos y delega en `syncMerge` (con el origen `edit` para lo que entra, y sin reescribir `updatedAt` ni `rev` si el id ya existe). Conserva el resumen para el aviso, incluyendo `gamesRenamed`. Excluye de la copia los campos solo locales (`syncedRev`).

##### 9. `tests/sync.mjs` (Create) y `package.json` (Modify)

*   **Type / Scope**: Pruebas en Node (sin navegador, con almacenes en memoria).
*   **Proposed Changes**: Casos: solo un lado; cambio en un solo lado; choque con `rev` distinta y con `rev` igual (desempate por `editedBy`); borrado en un lado y edición posterior en el otro; restaurar tras borrar; purga a 30 días; remoto inválido descartado; registros antiguos sin campos nuevos; primera sincronización con datos en ambos lados; dos réplicas con reloj desfasado producen el mismo resultado; idempotencia (fusionar dos veces no cambia nada). `package.json`: añadir `node tests/sync.mjs` al script `test`.

##### 10. `tests/persistence.mjs` (Modify)

*   **Type / Scope**: Pruebas existentes.
*   **Proposed Changes**: Actualizar las expectativas de la fase 0 al nuevo comportamiento (`edit` sube `rev`, `usage` no; borrar deja lápida; `runInit` sin partida por defecto cuando se pide) y mantener el resto.

#### Fase 3: servidor y motor

##### 11. `api/sync.ts` (Create)

*   **Type / Scope**: Función serverless de Vercel (TypeScript).
*   **Proposed Changes**:
    *   Autenticación: `Authorization: Bearer <token>` comparado con `process.env.SYNC_TOKEN` en tiempo constante; sin coincidencia, `401` sin cuerpo.
    *   `GET`: `get('anagrama-sync.json', { access: 'private', useCache: false })`. Si no existe, `404`. Si existe, `200` con el JSON y la cabecera `ETag`. Admite `If-None-Match` y responde `304`.
    *   `PUT`: lee el cuerpo, rechaza más de 1 MB (`413`), exige `schemaVersion` conocido y un objeto `games` válido en forma (`400`). `If-Match` presente: `put(..., { access:'private', allowOverwrite:true, ifMatch })`. Ausente: `put` sin `allowOverwrite` (crea). `BlobPreconditionFailedError` o error de existencia → `412`. Devuelve el `ETag` nuevo.
    *   Cabeceras `Cache-Control: no-store`. No registra el contenido de las partidas.

##### 12. `services/sync/syncTransport.ts` (Create)

*   **Type / Scope**: Interfaz y cliente HTTP.
*   **Proposed Changes**: `interface SyncTransport { pull(etag?): Promise<{status:'ok'|'notModified'|'empty', doc?, etag?}>; push(doc, etag?): Promise<{status:'ok'|'conflict', etag?}> }`. Implementación `HttpSyncTransport(token)` con `fetch('/api/sync')`, `keepalive` opcional en `push` y errores tipados (`Unauthorized`, `Offline`, `ServerError`, `TooLarge`).

##### 13. `services/sync/syncEngine.ts` (Create)

*   **Type / Scope**: Motor de sincronización.
*   **Proposed Changes**: Máquina de estados `desactivado | sinSesión | sincronizando | alDía | sinRed | error`. Ciclo: `pull → merge → aplicar con origen 'remote' → push si hay pendientes → actualizar syncedRev`; un `conflict` repite desde `pull` (máximo 3 veces seguidas). Disparadores: arranque, `visibilitychange` a visible, `online`, 2 s tras una edición, `pagehide` con `keepalive`. Reintentos con espera creciente (2, 8, 30, 120 s). Líder único por Web Locks (`anagrama-sync`) y notificación a las demás pestañas por `BroadcastChannel`. Antes de la primera sincronización guarda `buildBackup()` en `anagrama.preSyncBackup.v1` (las 3 últimas). Persiste en `localStorage` (`anagrama.sync.v1`): token, interruptor, último ETag, `lastSyncedAt`, último error.

##### 14. `services/sync/diagnostics.ts` (Create)

*   **Type / Scope**: Registro local acotado.
*   **Proposed Changes**: Anillo de 200 eventos (hora, tipo, id de partida, `rev` local y remota, decisión, error) en memoria con volcado a `localStorage`. API: `log(event)`, `read()`, `clear()`, `asText()`.

##### 15. `hooks/useSync.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Expone el estado del motor, `enable(token)`, `disable()` (borra token y metadatos, no las partidas), `syncNow()` y la lista de pendientes. Al aplicar cambios remotos refresca `useGames`. Si el cambio remoto afecta a la partida activa sin pendientes locales, la sustituye y lanza un aviso; si tiene pendientes, se aplica la regla de choque.

##### 16. `.gitignore`, `.env.example`, `package.json` (Modify/Create)

*   **Type / Scope**: Configuración.
*   **Proposed Changes**: `.gitignore`: añadir `.env*` (excepto `.env.example`) y `.vercel`. `.env.example` documenta `SYNC_TOKEN` y las variables del almacén Blob. `package.json`: dependencias `@vercel/blob` y `@vercel/node` (tipos).

#### Fase 4: interfaz de sincronización

##### 17. `components/SyncStatusChip.tsx` y `components/SyncPanel.tsx` (Create)

*   **Type / Scope**: Componentes.
*   **Proposed Changes**: El chip muestra "Guardado en este aparato" y el estado de sync (texto, no solo color). `SyncPanel` (en un diálogo con `Overlay`): campo del token, interruptor, "Sincronizar ahora", última sincronización, pendientes, último error y botón "Copiar diagnóstico". Los errores persistentes aparecen como franja con "Reintentar".

##### 18. `components/GameSwitcher.tsx` (Modify)

*   **Type / Scope**: Lista de partidas.
*   **Proposed Changes**: Aloja el chip. Añade "Eliminadas recientemente" (lista de `listDeletedGames()` con "Restaurar" y días restantes). El diálogo de borrar dice que se borrará también en los demás aparatos si la sincronización está activa. Mueve Exportar e Importar a un menú "Copia de seguridad" y muestra el resumen completo de restaurar ("1 ya estaba igual, 1 añadida como «X (importada)»").

##### 19. `App.tsx` (Modify)

*   **Type / Scope**: Componente raíz.
*   **Proposed Changes**: Sustituye el "Guardado" de `App.tsx:503-505` por el chip. Monta `useSync`. Cambia el pie (`App.tsx:612-617`) según el estado ("Solo en este aparato" o "Sincronizado con tu cuenta").

##### 20. `components/Toast.tsx` (Modify)

*   **Type / Scope**: Avisos.
*   **Proposed Changes**: `role="status"`/`aria-live="polite"` para avisos normales y `role="alert"` para errores. Soporta avisos persistentes con acción.

##### 21. `services/wordBlocklist.ts`, `services/wordCandidates.ts` (Modify)

*   **Type / Scope**: Almacenamiento de listas.
*   **Proposed Changes**: Reemplazar los `catch {}` por registro en `diagnostics.ts`. No cambia el formato ni se sincronizan en esta fase.

#### Fase 5: despliegue y textos

##### 22. `README.md`, `data/README.md` (Modify)

*   **Type / Scope**: Documentación.
*   **Proposed Changes**: Explicar el modo local y el modo sincronizado, cómo crear el almacén Blob privado y definir `SYNC_TOKEN`, que la sincronización viene apagada por defecto y el orden de despliegue (solo subir, bidireccional, ocultar Exportar/Importar). Fijar la URL definitiva de producción (IndexedDB es por origen).

#### Fase 6: sin conexión

##### 23. `index.html` (Modify)

*   **Type / Scope**: Documento base.
*   **Proposed Changes**: Quitar el `<script src="https://cdn.tailwindcss.com">`, el bloque `tailwind.config`, los enlaces a cdnjs (Font Awesome) y a Google Fonts, y el `importmap` a `aistudiocdn.com`. Añadir `<link rel="manifest">` e iconos.

##### 24. `tailwind.config.js`, `postcss.config.js` (Create), `index.css` (Modify), `index.tsx` (Modify), `package.json` (Modify)

*   **Type / Scope**: Estilos y dependencias.
*   **Proposed Changes**: Trasladar sin cambios los colores `ink`, `accent`, `brand` y las fuentes de la configuración inline de `index.html` a `tailwind.config.js` (Tailwind 3.4 con PostCSS y autoprefixer). `index.css` añade las directivas `@tailwind base/components/utilities`. `index.tsx` importa `@fontsource/inter` (400-800), `@fontsource/jetbrains-mono` (500, 700) y `@fortawesome/fontawesome-free/css/all.min.css`. Comprobar visualmente que no cambia el aspecto (capturas antes y después).

##### 25. `vite.config.ts` (Modify), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (Create), `index.tsx` (Modify)

*   **Type / Scope**: PWA.
*   **Proposed Changes**: `vite-plugin-pwa` con `registerType: 'prompt'`, manifest (`name`, `short_name`, `display: standalone`, `theme_color #080b14`, iconos), precaché del shell, del worker y de `public/services/dictionary.txt` (subir `maximumFileSizeToCacheInBytes` a unos 12 MB; el plugin versiona por hash) y `NetworkOnly` para `/api/`. `index.tsx` registra el service worker y `components/UpdateBanner.tsx` (Create) muestra "Hay una versión nueva · Recargar".

##### 26. `App.tsx` o `hooks/useSolverWorker.ts` (Modify)

*   **Type / Scope**: Medición.
*   **Proposed Changes**: `performance.mark/measure` para la descarga del diccionario, la construcción del DAWG y `solveBoard`. Distinguir en el estado de carga "sin red y sin caché" de error del worker, con botón "Reintentar". No se cambia la carga del diccionario.

#### Fase 7: uso en móvil y ordenador

##### 27. `components/GameSwitcher.tsx` (Modify)

*   **Type / Scope**: Lista de partidas.
*   **Proposed Changes**: La zona principal de cada fila pasa a `<button>` y las acciones a botones hermanos de 44 px. La visibilidad de las acciones depende de `@media (hover: hover)`/`(pointer: coarse)`, no del ancho. Botón visible de renombrar; F2 y Supr con confirmación. Mostrar la hora en móvil. Avisar de nombres duplicados al renombrar y al truncar a 40 caracteres. Ayuda sin "doble clic" en táctil.

##### 28. `components/Tabs.tsx` (Create), `App.tsx` (Modify)

*   **Type / Scope**: Componente accesible.
*   **Proposed Changes**: Pestañas con `role="tablist"`, `tab`, `tabpanel`, `aria-selected`, `aria-controls` y navegación por flechas. Sustituye los botones sueltos de `App.tsx:516-529`.

##### 29. `components/ScrabbleBoard.tsx` (Modify)

*   **Type / Scope**: Tablero.
*   **Proposed Changes**: Entrada por `beforeinput`/`input` en lugar de `onKeyDown` en el input oculto (`ScrabbleBoard.tsx:154-171`); aceptar varias letras de un evento compuesto. `visualViewport` para desplazar la casilla activa sobre el teclado. Tab sale del tablero y la dirección cambia con otra tecla (`ScrabbleBoard.tsx:129-131`); `Escape` suelta el foco. Región `aria-live` con fila, columna y dirección. Componente `Cell` memoizado. `touch-action: manipulation`.

##### 30. `hooks/useBoardHistory.ts` (Create), `components/BoardPanel.tsx` (Modify)

*   **Type / Scope**: Deshacer y diseño.
*   **Proposed Changes**: Pila en memoria de 50 pasos por partida activa, vaciada al cambiar de partida y no sincronizada. "Vaciar tablero" (`BoardPanel.tsx:159`) entra en la pila. Botones de deshacer y rehacer. En móvil "Mejor jugada" fija abajo y la lista de jugadas sin scroll anidado.

##### 31. `hooks/useHotkeys.ts` (Create), `components/HotkeysHelp.tsx` (Create), `App.tsx` (Modify)

*   **Type / Scope**: Atajos.
*   **Proposed Changes**: Hook único que ignora campos de texto y se puede desactivar. Ctrl/Cmd+Enter buscar o "Mejor jugada", `/` buscar partida, Alt+N nueva partida, Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, `?` ayuda. Diálogo de ayuda con la lista.

##### 32. `components/ScreenshotImport.tsx` (Modify)

*   **Type / Scope**: Importar captura.
*   **Proposed Changes**: "Aplicar a la partida" muestra la partida destino, avisa si ya tiene fichas, ofrece "aplicar aquí" o "nueva partida", y permite Deshacer. Cerrar con correcciones sin aplicar pide confirmación; "Reajustar" conserva las correcciones. Pistas por aparato (sin "arrastra / Ctrl+V" en móvil; ⌘V en Mac). Botones en pantalla para vaciar y comodín. Estados dudoso/ok/error con forma o texto además del color. Mensajes de error que indican formatos admitidos.

##### 33. `components/Overlay.tsx` (Modify)

*   **Type / Scope**: Diálogos.
*   **Proposed Changes**: `role="dialog"`, `aria-modal`, foco inicial, trampa de foco y retorno de foco al cerrar. Lo usan el diálogo de nombre, el de borrar, `SyncPanel` y `HotkeysHelp`.

##### 34. `components/BoardPanel.tsx`, `components/ScreenshotImport.tsx` (Modify)

*   **Type / Scope**: Textos.
*   **Proposed Changes**: "Leer captura" pasa a "Leer tablero desde captura" y "Importar" (partidas) a "Restaurar copia". Vocabulario único (partida, detectadas) y el mantenimiento del diccionario plegado como opción avanzada.

##### 35. `components/README.md`, `services/README.md`, `tests/README.md`, `README.md` (Modify)

*   **Type / Scope**: Documentación final.
*   **Proposed Changes**: Reflejar los componentes y hooks nuevos, el modelo de datos de sincronización, el servidor, las pruebas nuevas y que ya no se afirma que la app no usa red.

### Verification Plan

*   **Compilación/Build**: `npm run build` en cada fase. En la fase 6, comprobar que `dist/` no referencia `cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, `fonts.googleapis.com` ni `aistudiocdn.com`.
*   **Pruebas unitarias**: `npm test` (incluye `tests/sync.mjs` y la `tests/persistence.mjs` actualizada). Las cifras de `tests/regresion.mjs` no deben cambiar.
*   **Análisis estático**: `npm run typecheck`.
*   **Cobertura requerida**: todas las ramas de `syncMerge` (solo un lado, cambios en un lado, choque, lápidas, purga, remoto inválido).
*   **Integración con el servidor**: `vercel dev` con un almacén Blob de pruebas y `SYNC_TOKEN` de prueba. Comprobar: `401` sin token; `404` sin documento; creación; `412` al subir con ETag viejo; `413` con más de 1 MB; `304` con `If-None-Match`. Antes de dar por buena la escritura condicional, hacer una prueba real con dos subidas simultáneas y confirmar que una recibe `412`.
*   **Prueba con dos aparatos reales (móvil y ordenador)**: los ocho CUJ de este documento, incluida la primera sincronización con datos en ambos lados y el choque con copia "(conflicto)".
*   **Sin conexión**: instalar la app, cortar la red y abrir; editar tres partidas y recuperar la red. Verificar "Sin conexión · 3 pendientes" y la puesta al día.
*   **Móvil real**: probar la entrada de letras con el teclado de Android y de iOS, y comprobar que la casilla activa queda visible. Medir el arranque del diccionario en el móvil del autor.
*   **Accesibilidad**: recorrer lista, pestañas y tablero solo con teclado; comprobar que Tab sale del tablero. Medir el contraste de los textos de 11 px con una herramienta y corregir los que no lleguen a 4,5:1.
*   **Verificación en navegador** (pestaña de la app en local): lista de partidas, diálogo de nombre, chip de estado, papelera y atajos, sin errores en la consola.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
