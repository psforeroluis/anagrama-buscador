# Anagrama: sincronización de partidas, uso sin conexión y mejoras de uso en móvil y ordenador

*   **Author:** psforeroluis
*   **Status:** Proposed
*   **Date:** 2026-11-22

--------------------------------------------------------------------------------

## Overview

Anagrama es una app web personal, de un solo usuario, para buscar anagramas y calcular jugadas sobre un tablero de 15 × 15. Hoy guarda todo en el navegador de cada aparato (IndexedDB, con `localStorage` como respaldo) y no guarda datos en ningún servidor ni usa claves de API (carga recursos estáticos de dominios externos).

Este documento cubre un solo conjunto de cambios con tres bloques:

1. **Sincronización de partidas** entre móvil y ordenador, con el almacenamiento local como fuente de verdad y la nube como copia en segundo plano.
2. **Uso sin conexión real**: quitar las dependencias de red en tiempo de ejecución y añadir una app instalable con caché.
3. **Uso en móvil y ordenador**: botones táctiles, entrada de letras en el tablero, accesibilidad, atajos de teclado, deshacer y flujo de importar captura.

El motor de búsqueda de anagramas y jugadas (Web Worker) no cambia.

**Nota de alcance.**

*   Los tres bloques van en un solo documento por decisión del autor. El bloque 1 corresponde a las fases 2 a 5 del plan (con la prueba previa 2b), el bloque 2 a la fase 6 y el bloque 3 a la fase 7. Las fases 6 y 7 no dependen de la sincronización y se pueden extraer a documentos propios.
*   Las fases (0 a 7) y el Verification Plan se definen en la sección Detailed Implementation Plan, al final del documento.
*   Orden de entrega: las fases 0 y 1 (preparación, necesarias para el bloque 1) primero; el bloque 2 (fase 6) antes de activar la sincronización; después el bloque 1 (fases 2 a 5); el bloque 3 (fase 7) en cualquier momento tras la fase 1. Cada bloque se da por bueno por separado con su criterio, pero el criterio del bloque 1 se comprueba con la sincronización activada, para lo que el bloque 2 debe estar entregado.
*   Criterio de salida por bloque:
    *   Bloque 1 (sincronización): los CUJ 1, 2 (parte de puesta al día), 3, 4, 5 y 9 pasan con un móvil y un ordenador reales, la prueba de dos subidas simultáneas devuelve `412` a una de ellas y `npm test` sigue en verde.
    *   Bloque 2 (sin conexión): el CUJ 2 (parte sin red) pasa con la app instalada y la red cortada, y `dist/` no referencia dominios externos. Es requisito previo de activar la sincronización.
    *   Bloque 3 (uso en móvil y ordenador): los CUJ 6, 7 y 8 pasan en un móvil real y en un ordenador. Su detalle es una intención provisional: antes de implementarlo hay que leer `BoardPanel`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast` y `boardImage`, que no se han leído a fondo (tampoco `wordCandidates.ts`, `glyphs.ts` ni partes de `index.css`).
*   Vocabulario: "aparato" es siempre el móvil o el ordenador del usuario. Una **lápida** es la marca de borrado que conserva la partida con su contenido durante 30 días (plazo provisional); la papelera y "Eliminadas recientemente" muestran esas partidas. Un **eco** es que un cambio recibido del servidor se reenvíe como si fuera una edición local. El **chip** es el indicador de estado junto a la lista de partidas, la **franja** es la barra persistente de error con "Reintentar" y el **aviso** es un mensaje temporal. Los nombres de código `Game`, `GameSwitcher` y `gamesStore` no se renombran.

## The Problem

Para seguir una partida en otro aparato hay que exportar un JSON en uno e importarlo en el otro. Es lento y se olvida. Como cada aparato conserva su propia copia, el usuario nunca sabe cuál es la más reciente.

Además, `index.html` carga Tailwind, iconos, fuentes y React desde dominios externos al ejecutarse, y no hay manifest ni service worker. No se ha probado qué ocurre al abrir la app sin red. En el móvil, donde el autor dice jugar más (dato del autor), hay botones de 28 px, renombrar solo con doble clic, un teclado virtual que puede tapar el tablero y filas de partida que no se pueden usar con teclado.

La solución propuesta es una sincronización "local primero": cada edición se guarda al instante en el aparato y una cola en segundo plano la envía a una función serverless personal. Sin red o sin token, la app funciona como hoy. Además se abordan las dependencias de red y los problemas de uso listados en los Goals.

## Goals

*   Seguir la misma partida en móvil y ordenador sin exportar ni importar archivos a mano. Una partida editada en un aparato aparece en el otro al abrir la app o al volver a enfocarla, con red, en menos de 10 s desde que se abre o se enfoca. Un aparato abierto en primer plano no se actualiza solo (no hay sondeo).
*   Nunca perder una edición en silencio al fusionar dos versiones. Si dos versiones chocan, se conserva la perdedora como "Nombre (conflicto)". Si un borrado choca con una edición, gana la edición.
*   Borrar una partida en un aparato la borra en el otro, con una papelera (30 días, plazo provisional) y Deshacer.
*   Mostrar el estado de la sincronización por separado de "Guardado", con esta lista única de estados y textos: "Desactivado" (interruptor apagado o token sin pegar), "Sincronizando", "Sincronizado hace X", "Sin red · N pendientes", "Token rechazado" y "Error".
*   Abrir y usar la app sin red después de la primera visita, con el diccionario en caché.
*   Que todos los botones de acción en pantalla táctil midan al menos 44 px y no dependan de pasar el ratón por encima.
*   Poder renombrar una partida sin doble clic y escribir en el tablero del móvil sin que el teclado tape la celda activa.
*   Poder usar la lista de partidas, las pestañas y el tablero solo con teclado, y salir del tablero con Tab.
*   Deshacer y rehacer en el tablero (Ctrl/Cmd+Z, y botón en móvil).
*   Avisar antes de que "Aplicar a la partida" o cerrar la importación de captura descarten trabajo.
*   En móvil, que la importación de captura muestre pistas propias del aparato y botones en pantalla para vaciar una casilla y poner un comodín.
*   Mantener Exportar/Importar JSON como copia de seguridad que no necesita cuenta.
*   Que el núcleo (anagramas y jugadas de tablero) siga funcionando igual, con las pruebas actuales en verde.
*   A partir de 1280 px de ancho (el punto de corte `xl`), el contenido pasa de `max-w-6xl` a `max-w-7xl` y la lista de partidas puede plegarse como barra lateral.
*   En móvil, "Mejor jugada" queda fija en la parte inferior de la pantalla.
*   Los botones y textos se renombran como indica la sección "Mejoras de uso" ("Leer tablero desde captura", "Restaurar copia") y se usa el vocabulario único definido en la nota de alcance.
*   Ningún `catch {}` vacío queda en `gamesStore.ts`, `wordBlocklist.ts` ni `wordCandidates.ts`: los errores van al registro de Diagnóstico.

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

*   **Plazo de las lápidas**: ¿cuántos días se conserva una partida borrada antes de purgarla? Se usa 30 días en todo el documento como valor provisional. Pendiente de confirmar.
*   **Origen fijo en Vercel**: IndexedDB es por origen. Hay que confirmar la URL definitiva (`data/README.md` cita `anagrama-buscador.vercel.app`) y revisar `vite.config.ts` antes de activar la sincronización o mover datos. Las fases 0 a 2 no dependen de esta respuesta; la 2b en adelante sí, porque necesita el almacén Blob.
*   **Alta del almacén en Vercel**: hay que crear un almacén Vercel Blob privado en el panel del proyecto y definir las variables `SYNC_TOKEN` y las de Blob. Lo hace el autor; el repo no contiene `vercel.json` ni carpeta `api/`.
*   **Arranque del diccionario en móvil**: `dictionary.txt` tiene 688.255 líneas y pesa 7,7 MB sin comprimir. Falta medir el tiempo de arranque (descarga y construcción del DAWG) en un móvil de gama media antes de decidir si se cambia la carga. El Goal de usar sin red depende de esta medición: hasta tenerla, la descarga aparte del diccionario es una decisión provisional que se reabre si el arranque en frío en un móvil de gama media supera 5 s.
*   **Teclados Android**: falta comprobar si el input oculto del tablero recibe `e.key` válidos o "Unidentified". La entrada con `beforeinput`/`input` ya está decidida; si la prueba en un móvil real falla, la decisión se reabre.
*   **Aparatos del autor**: ¿se usa Safari en iPhone y/o Android Chrome? Condiciona la instalación como app (manifest), el almacenamiento disponible y la entrada de letras.

## Critical User Journeys (CUJs)

### CUJ 1: Seguir una partida en otro aparato

*   **Given**: La sincronización está activada en el móvil y en el ordenador con el mismo token. El ordenador tiene la partida "Liga del viernes" con 40 fichas.
*   **When**: El usuario añade una jugada en el ordenador, cierra la pestaña y abre la app en el móvil.
*   **Then**: Con red, en menos de 10 s desde que se abre o se enfoca la app, el móvil muestra "Liga del viernes" con la jugada nueva, sin exportar ni importar. El chip dice "Sincronizado hace X".

### CUJ 2: Jugar sin red y ponerse al día

*   **Given**: La app instalada en el móvil, con la caché del diccionario cargada. No hay conexión.
*   **When**: El usuario edita tres partidas y vuelve a tener red.
*   **Then**: La app funcionó sin red todo el rato y el chip mostró "Sin red · 3 pendientes". Al volver la red envía los cambios y pasa a "Sincronizado hace X".

### CUJ 3: Dos versiones chocan

*   **Given**: El usuario editó la partida A en el móvil sin red (5 guardados locales) y, después, editó la misma partida en el ordenador con red (2 guardados). `rev` cuenta guardados locales.
*   **When**: El móvil recupera la red y sincroniza.
*   **Then**: Gana la versión con más ediciones (`rev` más alta; en empate, la del `editedBy` menor), es decir, la del móvil aunque el ordenador editó después. Es un criterio aceptado porque un choque es raro pero posible si se olvida sincronizar. La otra se guarda como "A (conflicto)" y un aviso lo dice. No se pierde ninguna edición.

### CUJ 4: Borrar y deshacer entre aparatos

*   **Given**: La partida B existe en ambos aparatos.
*   **When**: El usuario la elimina en el ordenador y, días después, la busca en "Eliminadas recientemente" del móvil.
*   **Then**: B desapareció de la lista del móvil la próxima vez que el móvil sincronizó (al abrir la app o recuperar la red). Está en la papelera y se puede restaurar hasta cumplirse el plazo. Después se purga.

### CUJ 5: Primera sincronización con datos en ambos lados

*   **Given**: El ordenador tiene 5 partidas y el móvil 3, y el servidor está vacío.
*   **When**: El usuario activa la sincronización en el ordenador y después en el móvil.
*   **Then**: Se hace una copia automática antes de empezar. El servidor acaba con la unión de las 8 partidas por id y ningún aparato pierde datos. No se crea una "Partida 1" vacía durante el proceso.

### CUJ 6: Jugar con una mano en el móvil

*   **Given**: El usuario tiene el tablero abierto en un móvil de 360 px.
*   **When**: Toca una casilla y escribe una palabra, renombra una partida y pulsa "Mejor jugada".
*   **Then**: La casilla activa queda completamente visible con el teclado del sistema abierto, renombrar tiene un botón visible, todos los botones miden al menos 44 px y "Mejor jugada" queda dentro del tercio inferior de la pantalla.

### CUJ 7: Usar el ordenador solo con teclado

*   **Given**: El usuario abre la app en el ordenador.
*   **When**: Cambia de pestaña con las flechas, elige una partida de la lista con flechas y Enter, la renombra con F2, entra al tablero, escribe, sale con Tab y borra una partida con Supr.
*   **Then**: Cada paso se hace con la tecla indicada (Supr abre el diálogo de confirmación), y Tab mueve el foco fuera del tablero en una sola pulsación. Ctrl/Cmd+Z deshace la última edición del tablero.

### CUJ 8: Importar una captura sin perder trabajo

*   **Given**: El usuario corrigió 30 letras tras leer una captura. La partida activa ya tiene fichas.
*   **When**: Pulsa "Aplicar a la partida" o cierra el diálogo.
*   **Then**: La app muestra el nombre de la partida destino y avisa de que ya tiene contenido. Ofrece "aplicar aquí" o "nueva partida", y Deshacer después. Cerrar pide confirmación si hay correcciones sin aplicar. En móvil, las pistas son las del aparato (sin "arrastra / Ctrl+V") y hay botones en pantalla para vaciar una casilla y poner un comodín.

### CUJ 9: Edición sin conexión frente a un borrado

*   **Given**: La partida B existe en ambos aparatos. El usuario la borra en el ordenador. El móvil, sin enterarse, la edita sin conexión.
*   **When**: El móvil recupera la red y sincroniza.
*   **Then**: Como la edición del móvil tiene un `rev` mayor que el `rev` que B tenía al borrarla (`deletedBaseRev`), gana la edición: B se restaura en ambos aparatos y un aviso lo dice. No se pierde la edición.

## Technical Plan (Architecture)

### Decisiones de arquitectura tomadas por el autor

*   **Servidor: un único documento.** El servidor guarda toda la colección de partidas en un solo JSON.
*   **Almacén: Vercel Blob privado.** Según la documentación de Vercel (`https://vercel.com/docs/vercel-blob`, consultada el 2026-11-22), soporta escritura condicional con `put(..., { ifMatch: etag })`, que falla con `BlobPreconditionFailedError` si el fichero cambió, y lectura sin caché con `get(..., { useCache: false })`. Es lectura de documentación, no una prueba en ejecución: la fase 2b del plan lo prueba con dos subidas simultáneas antes de construir el resto. Si esa prueba no devuelve `412` a una de las dos, el diseño se detiene y se vuelve a elegir almacén. El fichero tiene ruta fija, `anagrama-sync.json`, con `addRandomSuffix: false`. Tampoco están verificados que el `put` sin `allowOverwrite` falle cuando el Blob ya existe ni su traducción a `412`; entran en la misma prueba previa (fase 2b).
*   **Conflictos: un aparato activo a la vez.** Gana la versión con más ediciones (`rev` más alta); la otra se conserva como copia.
*   **Entrada de letras en móvil: teclado del sistema, arreglado** con `beforeinput`/`input` y `visualViewport`.

### Vista general

```text
 Móvil / Ordenador                                       Vercel
┌──────────────────────────────────────┐     ┌──────────────────────────────┐
│ App (React)                          │     │ api/sync.ts (función)        │
│  useGames ──► gamesStore (IndexedDB) │     │  GET  -> Blob + ETag         │
│     │  edición local: rev+1, pending │     │  PUT  -> put(ifMatch=ETag)   │
│     ▼                                │     │  token: SYNC_TOKEN (env)     │
│  syncEngine (fetch + fusión)         │     └──────────────┬───────────────┘
│   pull ─► syncMerge(local, remoto)   │  HTTPS             │
│   push ─► PUT con If-Match           │◄──────────────────►│  Vercel Blob
│  Estado: ver lista en los Goals      │                    │  (privado) 1 JSON
│                                      │                    └──────────────────┘
└──────────────────────────────────────┘
 Sin token o sin red: todo funciona como hoy (local primero).
 Estados del chip: ver la lista única de los Goals.
```

### Modelo de datos

Las partidas ganan campos opcionales (las anteriores siguen siendo válidas en `isValidGame`):

| Campo | Dónde | Significado |
|---|---|---|
| `rev` | local y remoto | Contador entero que cuenta guardados locales. Sube 1 en cada edición local (tablero, atril, comodines, nombre, borrado, restauración). No sube al abrir la partida ni al aplicar datos remotos. Una partida sin `rev` se toma como `rev = 1` al activar la sincronización. |
| `syncedRev` | solo local | Última `rev` que se sabe que está en el servidor. La partida tiene cambios pendientes si `rev > syncedRev`. Una partida sin `syncedRev` nunca se ha sincronizado y cuenta como pendiente. |
| `editedBy` | local y remoto | Identificador aleatorio del aparato que hizo la última edición. Solo desempata. |
| `deletedAt` | local y remoto | Marca de borrado (lápida). La partida se conserva con su contenido hasta purgarla. Lleva la hora del reloj del aparato que borra. |
| `deletedBaseRev` | local y remoto | El `rev` que tenía la partida cuando se borró. Borrar sube `rev` en 1 y guarda el valor anterior aquí. |
| `uses` | solo local | Ya existe: veces que se ha jugado la partida en este aparato. No se sube; el orden por uso es propio de cada aparato. |

Documento remoto:

```text
{ schemaVersion: 1,
  games: { "<id>": { id, name, board, rack, blanks, createdAt, updatedAt,
                     rev, editedBy, deletedAt?, deletedBaseRev? } } }
```

`updatedAt` viaja solo como información (por ejemplo, para mostrar "hace X"). La elección del ganador de una fusión no usa relojes; solo la purga de lápidas compara `deletedAt` (reloj del aparato que borró) con la hora del servidor. Un reloj muy desviado solo adelanta o retrasa esa purga, y se acepta como riesgo. Tamaño medido con `JSON.stringify` de una partida sintética con las 225 casillas llenas, atril de 7 letras, un nombre de 15 caracteres, lápida y dos UUID: 809 bytes. Con 1 MB = 1.048.576 bytes caben unas 1.296 partidas; con unas decenas de partidas el documento ocupa decenas de KB. El servidor rechaza documentos de más de 1 MB.

### Fusión (función pura `syncMerge`)

Se usa solo en la sincronización. `restoreBackup` no cambia (ver Non-Goals): las partidas que añade se guardan con origen `edit` y se sincronizan como cualquier otra. Para cada `id`:

1.  Solo existe en un lado: se toma esa versión, salvo este caso: si existe en local con `syncedRev > 0` y no existe en remoto ni tiene lápida, no se elimina: se conserva y se vuelve a subir (`syncedRev = 0`), y se avisa. Esto puede resucitar una partida borrada y ya purgada en un aparato que estuvo más de 30 días sin conexión; se declara comportamiento aceptado. Un `404` equivale a un remoto vacío: se aplica esta misma regla (se sube lo local y no se borra nada).
2.  Existe en ambos:
    *   Local sin cambios (`rev == syncedRev`) y remoto con `rev` mayor: se adopta el remoto.
    *   Local con cambios y remoto sin cambios (`remote.rev == syncedRev`): se conserva el local y se sube.
    *   Local sin `syncedRev` (nunca sincronizada) y contenido distinto del remoto: se aplica la regla de choque. Si el contenido es igual, no se hace nada.
    *   Cambiaron los dos lados: gana la `rev` más alta (empate: gana el `editedBy` menor en orden de texto). La perdedora se guarda como partida nueva con nombre "Nombre (conflicto)" (si el nombre ya termina así, no se repite el sufijo) y se avisa. Su id y su `editedBy` son deterministas (se derivan del `id` original, la `rev` y el `editedBy` de la perdedora), así que dos aparatos que fusionan el mismo choque obtienen la misma copia, y dos copias con el mismo id son la misma partida. La copia empieza con `rev = 1` y `syncedRev = 0`. Si después se edita y choca otra vez, se aplica la regla normal sobre su propio id.
3.  Borrado frente a edición: una edición con `rev` mayor que `deletedBaseRev` de la lápida gana y restaura la partida, con aviso; en cualquier otro caso gana la lápida. Restaurar una partida borrada es una edición.
4.  El servidor purga del documento remoto las lápidas con `deletedAt` de hace más de 30 días (plazo provisional), comparando con su propia hora. Cada aparato elimina de su almacenamiento las que ya no están en el documento remoto.

Todo dato remoto pasa por `isValidGame` antes de entrar en local. El resultado de la fusión nunca borra una partida local que no tenga lápida.

### Cambios en el guardado local

`saveGame` hoy fija `updatedAt = Date.now()` en cada guardado. Pasa a recibir un origen:

*   `edit`: sube `rev`, fija `updatedAt` y marca la partida como pendiente. `saveGame` lee y escribe `rev` dentro de una única transacción `readwrite` de IndexedDB, para que dos pestañas del mismo aparato no escriban el mismo número.
*   `usage`: al abrir una partida solo cambia `uses` y la hora local de último uso (`lastUsedAt`, ver fase 0). No toca `rev`, `updatedAt` ni pendientes.
*   `remote`: aplica datos remotos conservando `rev` y `updatedAt`, y fija `syncedRev = rev` en la misma transacción. No marca pendiente, para evitar ecos. Si el `rev` remoto es menor que el `syncedRev` local (por ejemplo, un Blob restaurado), el aparato lo trata como un servidor reiniciado: muestra un aviso y vuelve a subir lo local.

`deleteGame` marca `deletedAt`, guarda `deletedBaseRev` y sube `rev` en lugar de borrar. El Deshacer de 9 s y "Eliminadas recientemente" quitan la lápida con una edición. `listGames` oculta las partidas con lápida; un listado aparte alimenta la papelera.

Con la sincronización desactivada, cada arranque purga en local las lápidas de más de 30 días con el reloj local, para que no crezcan el almacenamiento ni las exportaciones. Desactivar la sincronización conserva `syncedRev`; al reactivarla, una partida ausente en remoto sigue la regla 1 de la fusión (se conserva y se vuelve a subir).

### Motor de sincronización

Módulo nuevo `services/sync/` con tres piezas:

*   **Cliente de transporte** detrás de una interfaz `SyncTransport` (`pull()` y `push(doc, etag)`). La implementación usa `fetch` a `/api/sync` con `Authorization: Bearer <token>`. Cambiar de proveedor solo toca esta pieza.
*   **Fusión pura** (`syncMerge`), probada en Node.
*   **Motor** con estados `disabled | syncing | upToDate | offline | tokenRejected | error`. `disabled` es el interruptor apagado o no haber pegado el token. Guarda en `localStorage`: token, `deviceId`, último ETag, `lastSyncedAt` y último error.

Disparadores: al arrancar, al volver la pestaña a primer plano (`visibilitychange`), al recuperar red (`online`) y 2 s después de una edición local. No hay sondeo ni envío al cerrar la página: los pendientes se deducen de `rev > syncedRev`, sobreviven a recargas y se envían en el siguiente disparador. Si una sincronización falla por red o por el servidor, el chip pasa a "Sin red · N pendientes" o a "Error" y se reintenta en el siguiente disparador, sin espera escalonada.

Ciclo de una sincronización: `GET` (con `If-None-Match`) → fusión → aplicar a local con origen `remote` → si hay cambios locales, `PUT` con `If-Match` = ETag leído (el ETag de la última respuesta `200`; con un `304` se conserva el ETag guardado). Tras un `PUT` correcto se fija `syncedRev` al `rev` que se envió en esa petición (no al actual) y se guarda el ETag devuelto; las ediciones hechas durante el envío siguen pendientes. Un `412` repite el ciclo desde el `GET` (máximo 3 intentos seguidos; después, estado "Error" con franja "Reintentar").

**Varias pestañas.** Cada pestaña sincroniza por su cuenta y la seguridad la da `If-Match`: si dos suben a la vez, una recibe `412` y repite el ciclo. Al volver a primer plano, una pestaña relee el almacenamiento local y ve lo que otra haya guardado. La lectura-modificación-escritura de `rev` en una única transacción de IndexedDB evita números repetidos.

**Primera sincronización.** Antes de empezar se guarda una copia automática (`buildBackup()`) en `localStorage` bajo una clave nueva, conservando solo la última. Si no cabe por cuota (`QuotaExceeded`), la primera sincronización no empieza y se pide al usuario que exporte una copia manual. Todas las partidas locales que no tienen `syncedRev` cuentan como pendientes. Si el servidor no tiene documento, se crea con las partidas locales (`put` sin `allowOverwrite`; si otro aparato lo creó antes, el `put` falla y se repite el ciclo; no verificado, ver la prueba previa). Si lo tiene, se hace la unión por `id`. Mientras la primera sincronización está pendiente y no hay partidas locales, no se crea "Partida 1" (cambio en `runInit`).

### Función serverless `api/sync.ts`

*   `GET`: lee el Blob con `get(path, { access: 'private', useCache: false })` y devuelve el JSON con su `ETag`. Sin Blob: `404`. Un `404` se trata como un remoto vacío (regla 1 de la fusión): el aparato sube lo local y no borra nada.
*   `PUT`: exige `If-Match` (o ausencia del Blob para crear). Valida que el cuerpo sea un objeto con partidas y que `schemaVersion` sea 1 (si no, `400`). Un cuerpo de más de 1 MB responde `413`. Antes de escribir copia el documento actual a `anagrama-sync.prev.json` (una versión previa). Escribe con `put(path, body, { access: 'private', allowOverwrite: true, addRandomSuffix: false, ifMatch })`. Si salta `BlobPreconditionFailedError`, o (no verificado) el `put` de creación falla porque el Blob ya existe, responde `412`. Al escribir purga las lápidas con `deletedAt` de hace más de 30 días (plazo provisional), comparando con su propia hora.
*   Autenticación: comparación en tiempo constante del bearer con `SYNC_TOKEN`, un valor aleatorio de al menos 32 caracteres (adivinarlo no es viable). Respuestas `401` sin detalles. No hay límite de intentos propio, porque una función sin estado no tiene dónde guardar el contador; si hiciera falta, se puede añadir una regla de límite de tasa de la plataforma (no verificado). Sin token válido no se lee ni escribe nada. Para rotarlo se cambia `SYNC_TOKEN` en Vercel y se vuelve a pegar el nuevo en cada aparato.
*   Mismo origen que la app, así que no hace falta CORS. El token nunca se compila en el cliente: el usuario lo pega una vez en cada aparato (pantalla "Sincronización" y `localStorage`).
*   Desactivar la sincronización en un aparato borra el token y los metadatos de sincronización de ese aparato, sin tocar las partidas.
*   Un cliente que recibe `400` por `schemaVersion` muestra "Actualiza la app para sincronizar".

### Refactor de `App.tsx` (previo a la sincronización, sin cambio de comportamiento)

`App.tsx` mezcla worker, búsqueda, partidas, mantenimiento, avisos y maquetación, y duplica el estado de la partida activa (`board`, `boardRack`, `boardBlanks`) reponiéndolo a mano al cargar, seleccionar, crear, borrar y deshacer, con `skipSaveRef`. Se extraen solo los hooks que la sincronización necesita:

*   `useGames`: lista de partidas y `activeGameId`. La partida activa es un valor derivado, no tres `useState` copiados. Recibe cambios con origen `edit`, `usage` o `remote`. Elimina `skipSaveRef`.
*   `useToast`: avisos temporales y persistentes con acción (para la franja de error).
*   `useSync` (nuevo, en la fase 4) conecta el motor con `useGames` y el chip.

El resto de la separación de `App.tsx` (worker, mantenimiento del diccionario) queda fuera de este diseño; los atajos de teclado (`useHotkeys`) pertenecen al bloque 3.

Si llega un cambio remoto a la partida abierta y esa partida no tiene cambios pendientes, se adopta y se muestra un aviso, y se vacía la pila de deshacer del tablero. Si los tiene, se aplica la regla de choque de la fusión. Si llega un cambio remoto durante la espera de 2 s, la edición local pendiente cuenta como cambio local.

### Estado visible

Un chip junto a la lista de partidas sustituye al "Guardado" suelto que hoy se muestra sobre la cabecera. Muestra por separado "Guardado en este aparato" y el estado de sincronización, con los textos de la lista única de los Goals (el estado "Error" añade la causa). Los errores persistentes usan una franja con botón "Reintentar", no un aviso de 3 s. Una pantalla "Diagnóstico" lista los últimos 50 errores con su causa, la hora de la última sincronización y el número de pendientes, y se puede copiar. Los `catch {}` de `gamesStore.ts`, `wordBlocklist.ts` y `wordCandidates.ts` pasan a registrar el error en ese listado.

### Uso sin conexión

*   **Quitar la red de `index.html`**: Tailwind por PostCSS con `tailwind.config.js` (la configuración inline se traslada tal cual, sin cambiar de versión mayor), fuentes con `@fontsource` (Inter y JetBrains Mono), Font Awesome desde el paquete local y fuera el `importmap` a `aistudiocdn.com`.
*   **App instalable**: `manifest` (iconos 192 y 512, `maskable`, `display: standalone`) y service worker con `vite-plugin-pwa` (Workbox). Precaché del shell y del worker. El diccionario (`dictionary.txt`, 7,7 MB) se descarga aparte con `CacheFirst` y un estado visible "disponible sin conexión", para que la instalación no espere esa descarga; si se abre sin red antes de que termine, la app dice que necesita red la primera vez. `/api/*` va siempre a red (`NetworkOnly`) y queda fuera del fallback SPA. Registro con aviso "Hay una versión nueva · Recargar", nunca una recarga automática a mitad de partida.
*   **Medición**: `performance.mark` alrededor de la descarga del diccionario, la construcción del DAWG y `solveBoard`. No se cambia la carga del diccionario hasta ver los números.

### Mejoras de uso en móvil y ordenador

*   **Botones táctiles**: mínimo 44 px. La visibilidad de las acciones de fila se decide con `@media (hover: hover)` y `(pointer: coarse)`, no con el ancho de pantalla. Renombrar tiene botón visible; en teclado, F2 renombra y Supr abre el diálogo de confirmación; tras confirmar, el aviso ofrece Deshacer durante 9 s y la partida queda en "Eliminadas recientemente".
*   **Filas de partida**: la zona principal pasa a ser un `<button>` (selección por Tab/Enter) con las acciones como botones hermanos. Se muestra la hora de la última edición también en móvil y se avisa de nombres duplicados al renombrar.
*   **Pestañas accesibles**: componente `Tabs` con `role="tablist"`, `tab`, `aria-selected` y flechas.
*   **Tablero**: entrada con `beforeinput`/`input` y `visualViewport` para mantener visible la casilla activa. Tab sale del tablero (la dirección se cambia con otra tecla), `Escape` suelta el foco, y se anuncian fila y columna en una región `aria-live`. Los detalles de implementación (memoización de casillas, `touch-action`) van en el plan detallado.
*   **Deshacer/rehacer del tablero**: pila en memoria de 50 pasos por partida activa, que se vacía al cambiar de partida y al adoptar un cambio remoto, y no se sincroniza. Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, y botones en móvil. "Vaciar tablero" entra en la pila.
*   **Atajos** (`useHotkeys`, inactivos dentro de campos de texto): Ctrl/Cmd+Enter buscar o "Mejor jugada", `/` buscar partida, Alt+N nueva partida, `?` ayuda.
*   **Escritorio y móvil**: a partir de 1280 px de ancho se amplía el ancho máximo (`max-w-7xl`) y la lista de partidas puede plegarse como barra lateral. En móvil "Mejor jugada" queda fija abajo.
*   **Importar captura**: "Aplicar a la partida" muestra la partida destino, avisa si tiene fichas y ofrece "aplicar aquí" o "nueva partida", con Deshacer. Cerrar con correcciones sin aplicar pide confirmación y "Reajustar" conserva las correcciones. En móvil se quitan las pistas de "arrastra / Ctrl+V" y se añaden botones en pantalla para vaciar y comodín. "Leer captura" pasa a "Leer tablero desde captura" e "Importar" a "Restaurar copia".
*   **Textos**: el pie de `App.tsx` y los READMEs dejan de decir que no hay red ("Solo en este aparato" o "Sincronizado" según el estado; no hay cuentas). Un único vocabulario: partida (no "juego"), detectadas (no "candidatas") y alta/baja solo dentro de Mantenimiento, plegado como opción avanzada.

### Seguridad, rendimiento y despliegue

*   **Seguridad y privacidad**: las partidas no son datos sensibles, pero el Blob es privado y el token vive solo en variables de entorno del servidor y en el `localStorage` de cada aparato. El token nunca va en URL. Mientras `index.html` cargue scripts de dominios externos (Tailwind, `aistudiocdn.com`), esos dominios podrían leer `localStorage`: quitar esas dependencias (la fase 6) es requisito previo de activar la sincronización.
*   **Rendimiento**: el volumen es de decenas de KB (809 bytes por partida en el peor caso medido); el coste en Vercel no se calculó (no verificado). La carga del diccionario en memoria no cambia en este diseño.
*   **Despliegue por fases con interruptor**: la sincronización viene apagada por defecto. Orden: solo subir, luego bidireccional, luego ocultar (no quitar) Exportar/Importar. Marcha atrás: apagar el interruptor; lo local sigue siendo la fuente de verdad y el servidor no borra datos locales sin lápida. Las lápidas conservan el contenido 30 días y la copia automática previa a la primera sincronización permite volver atrás.

## Risks & Mitigations

| Riesgo | Efecto | Mitigación |
|---|---|---|
| El navegador expulsa IndexedDB o `localStorage` (por ejemplo, iOS Safari tras semanas sin abrir la app) | Se pierden partidas locales, el token y el `deviceId` | La copia JSON sigue disponible; la copia del servidor repone las partidas al volver a pegar el token; al activar la sincronización se pide almacenamiento persistente (`navigator.storage.persist()`), si el navegador lo admite, y si no se concede el panel Sincronización muestra el aviso |
| El diccionario descargado aparte (7,7 MB) no cabe en la cuota o no terminó de descargarse | La app no arranca sin red | Descarga aparte con estado visible "disponible sin conexión"; sin esa descarga completa, la app avisa de que necesita red la primera vez |
| Tres `412` seguidos al sincronizar | La sincronización no termina | Chip "Error" con franja "Reintentar"; los cambios siguen pendientes |
| `401` por token incorrecto o rotado | No se sincroniza | Chip "Token rechazado" con texto "Vuelve a pegar el token" |
| `413` por superar 1 MB | No se puede subir | Aviso con acción de exportar una copia; con 809 bytes por partida el límite equivale a unas 1.296 partidas (1 MB = 1.048.576 bytes) |
| Un bug de fusión o un cliente truncado sobrescribe el documento remoto | Pérdida de partidas en todos los aparatos | Versión previa en `anagrama-sync.prev.json` y copia automática previa a la primera sincronización |
| Un cliente antiguo en caché habla con un servidor de esquema distinto | La sincronización falla | El servidor rechaza con `400` un `schemaVersion` distinto de 1 y el cliente pide actualizar |
| Scripts externos leen el token de `localStorage` | Acceso al documento de sincronización | Quitar los CDN antes de activar la sincronización; token aleatorio de 32 caracteres y rotación por `SYNC_TOKEN` |
| Un aparato sin conexión más de 30 días vuelve con partidas ya purgadas | Una partida borrada reaparece | Comportamiento aceptado (regla 1 de la fusión: se conserva y se vuelve a subir; el usuario puede borrarla otra vez) |
| El servidor pierde el documento (`404`) | Un aparato podría borrar todo | La fusión nunca borra por ausencia: sube lo local |

## Alternatives Considered

### Alternative A: Servicio gestionado (Supabase, Firebase, Appwrite)

*   **Pros**: Menos código propio; ofrece autenticación con enlace mágico o passkey y reglas de seguridad por usuario (según su documentación, no verificado aquí).
*   **Cons**: Añade un SDK y una dependencia externa a una app que hoy no tiene ninguna, y reglas de acceso que configurar.
*   **Reason for Rejection**: Rejected by author: añade un SDK y reglas de acceso por usuario que un único usuario con dos aparatos no necesita; un token personal y una función serverless propia cubren el caso sin dependencias nuevas en el cliente.

### Alternative B: Cifrado de extremo a extremo con emparejamiento por QR

*   **Pros**: El servidor no puede leer las partidas; no hace falta cuenta.
*   **Cons**: Perder la clave implica perder los datos y exige una frase de recuperación. Más piezas de interfaz (QR, emparejado).
*   **Reason for Rejection**: Rejected by author: perder la clave deja los datos sin recuperación, y las partidas no contienen datos sensibles que justifiquen ese riesgo ni las piezas de interfaz de emparejado.

### Alternative C: CRDT (Yjs, Automerge) o fusión del tablero por celdas

*   **Pros**: Permite editar la misma partida en dos aparatos a la vez sin perder cambios.
*   **Cons**: Cambia el modelo de datos de todas las partidas, añade una dependencia y una interfaz propia para resolver choques.
*   **Reason for Rejection**: Rejected by author: el uso es de un aparato activo a la vez, así que las ediciones simultáneas de la misma partida son raras; un ganador por partida con copia "(conflicto)" cubre ese caso con una función de fusión pura, sin dependencia nueva ni cambio del modelo de datos.

### Alternative D: Carpeta de nube (Drive, iCloud) con el JSON de copia

*   **Pros**: Sin servidor propio.
*   **Cons**: Una página web no puede sincronizar una carpeta de nube de forma automática (no verificado en iOS); sigue siendo un paso manual en el aparato.
*   **Reason for Rejection**: Rejected by author: no resuelve la queja principal, que es el paso manual.

### Alternative E: Servidor con un registro por partida

*   **Pros**: Encaja con "gana la última versión por partida" y envía solo lo que cambió.
*   **Cons**: Exige almacén con listado de claves y escritura condicional por registro, y más lógica en el servidor.
*   **Reason for Rejection**: Rejected by author: con una partida de 809 bytes en el peor caso medido y unas decenas de partidas, el documento entero ocupa decenas de KB; un único documento con `If-Match` es más simple y reutiliza el formato de copia de seguridad.

### Alternative F: Servidor con registro de cambios y cursor

*   **Pros**: Sincronización incremental sencilla e historial gratis.
*   **Cons**: El registro crece y necesita compactarse; es una pieza más que mantener.
*   **Reason for Rejection**: Rejected by author: el historial de eventos no se pide y añade mantenimiento.

### Alternative G: Redis de Marketplace (Upstash) o Cloudflare Workers con KV como almacén

*   **Pros**: Redis ofrece operaciones atómicas exactas; Cloudflare permite desplegar la función fuera de Vercel.
*   **Cons**: Redis añade una integración y una cuota externas. Cloudflare KV es de consistencia eventual: un aparato puede leer una versión vieja durante un tiempo de propagación que este diseño no acota (no verificado), y obliga a configurar CORS y mantener dos plataformas.
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
*   **Reason for Rejection**: Rejected by author: no elimina el paso manual de exportar e importar, que es el problema que origina este diseño.

### Alternative K: Último escritor gana con marcas de tiempo

*   **Pros**: Regla más simple que un contador `rev`; no necesita `syncedRev`.
*   **Cons**: Depende de que los relojes de los aparatos coincidan; un reloj adelantado hace ganar siempre a ese aparato y puede pisar ediciones recientes.
*   **Reason for Rejection**: Rejected by author: los relojes de aparato no son fiables para decidir qué edición se conserva, y el diseño evita usarlos para elegir ganador.

### Alternative L: Protección de despliegue de Vercel en lugar de un token propio

*   **Pros**: No hay token que pegar en el móvil.
*   **Cons**: Exige iniciar sesión en Vercel desde cada aparato y protege el despliegue entero, no solo `/api/sync`; y no se ha verificado que esté pensada para llamadas desde la propia app.
*   **Reason for Rejection**: Rejected by author: no cubre el acceso de la app a `/api/sync` desde aparatos sin sesión de Vercel; un token propio sí.

### Alternative M: Conservar versiones previas del documento en servidor

*   **Pros**: Permite volver atrás tras un fallo de fusión.
*   **Cons**: Cada versión extra ocupa espacio y exige una interfaz para elegirla.
*   **Reason for Rejection**: Parcialmente adoptada: se conserva una única versión previa (`anagrama-sync.prev.json`) como red de seguridad; un historial completo queda fuera del alcance.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Este plan se regeneró desde la especificación recortada (sin líder de Web Locks, sin espera escalonada, sin envío al cerrar la página, sin `409`, sin sellado de `deletedAt` por el servidor, sin bloqueo por `schemaVersion` y con `restoreBackup` intacto). Cada fase deja `npm test`, `npm run typecheck` y `npm run build` en verde y se puede fusionar por separado.

### Fases y dependencias

| Fase | Contenido | Bloque | Depende de |
|---|---|---|---|
| 0 | Puerta previa: confirmar los cambios sin commit, `lastUsedAt` para el orden por uso y pruebas que fijan el comportamiento actual | preparación | — |
| 1 | Refactor mínimo de `App.tsx`: `useGames` y `useToast` | preparación | 0 |
| 2 | Almacenamiento local (`rev`, orígenes de guardado, lápidas), registro de errores y fusión pura | 1 | 1 |
| 2b | Prueba previa de `ifMatch` contra un almacén Blob real (puerta: si falla, se detiene el diseño) | 1 | 2 y el alta del almacén Blob |
| 3 | Función serverless y motor de sincronización, apagado por defecto | 1 | 2b |
| 4 | Interfaz de sincronización: chip, token, papelera, copia de seguridad y Diagnóstico | 1 | 3 |
| 5 | Documentación y activación por modos | 1 | 4 y 6 |
| 6 | Sin conexión: quitar dominios externos, PWA, descarga aparte del diccionario | 2 | 0 |
| 7 | Uso en móvil y ordenador (intención provisional hasta leer los componentes no leídos) | 3 | 1 |

Orden de entrega: 0, 1, 6, 2, 2b, 3, 4, 5; la fase 7 en cualquier momento tras la 1. La fase 6 debe estar entregada antes de activar la sincronización (fase 5), porque mientras `index.html` cargue scripts externos esos dominios podrían leer el token de `localStorage`.

### Target Files to Create/Modify

#### Fase 0: puerta previa

##### 1. `services/gamesStore.ts`, `components/GameSwitcher.tsx`, `App.tsx`, `tests/persistence.mjs` (Modify, cambios ya hechos)

*   **Type / Scope**: Cambios sin confirmar de la sesión anterior: diálogo de nombre al crear partida, `uses`, `usageScore` y `sortByUsage`.
*   **Proposed Changes**: Confirmarlos en un commit antes de empezar. Es una puerta previa, no parte del diseño.

##### 2. `services/gamesStore.ts`, `App.tsx`, `tests/persistence.mjs` (Modify)

*   **Type / Scope**: Hora local de último uso (`lastUsedAt`), independiente de la sincronización.
*   **Proposed Changes**: `Game` gana el campo opcional `lastUsedAt`. `usageScore` pasa a usar `lastUsedAt ?? updatedAt` como recencia. Abrir una partida y editarla fijan `lastUsedAt`. Esto permite que la fase 2 deje de tocar `updatedAt` al abrir una partida sin romper el orden por uso. Pruebas: abrir una partida la sube en el orden; una partida sin `lastUsedAt` se ordena por `updatedAt`.

##### 3. `tests/persistence.mjs` (Modify)

*   **Type / Scope**: Pruebas de caracterización.
*   **Proposed Changes**: Fijar con pruebas el comportamiento que cambiará en la fase 2, para saber qué cambia: `saveGame` pone `updatedAt` en cada guardado; `deleteGame` borra de verdad; `restoreBackup` crea copias "(importada)" cuando el id existe con contenido distinto. La fase 2 las actualiza de forma explícita.

#### Fase 1: refactor mínimo de `App.tsx`

##### 4. `hooks/useGames.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Reúne la carga inicial (`initGames`), la lista de partidas, `activeGameId`, selección, creación, renombrado, borrado y Deshacer. La partida activa es un valor derivado de la lista y el id activo; desaparecen `board`, `boardRack` y `boardBlanks` como estados copiados y `skipSaveRef`. Expone `activeGame`, `updateActive(patch)` (origen de guardado `edit` desde la fase 2), `select(id)` (origen `usage`) y una señal `onRemoteAdopted` (la usa la fase 4 y la 7). Sin cambio de comportamiento.

##### 5. `hooks/useToast.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Avisos temporales de 3 s y avisos persistentes con acción (base de la franja de error de la fase 4).

##### 6. `App.tsx` (Modify)

*   **Type / Scope**: Componente raíz.
*   **Proposed Changes**: Usa `useGames` y `useToast`. `BoardPanel` recibe tablero, atril y comodines de `activeGame`. El resto de `App.tsx` (worker, mantenimiento del diccionario) no se toca. Las pruebas de la fase 0 y `npm test` deben seguir pasando; comprobación manual en el navegador: crear, abrir, renombrar, borrar y deshacer una partida.

#### Fase 2: almacenamiento local y fusión

##### 7. `services/sync/diagnostics.ts` (Create)

*   **Type / Scope**: Registro local acotado.
*   **Proposed Changes**: Guarda los últimos 50 errores (hora, origen, causa). API: registrar un error, leer, vaciar y volcar a texto. Se crea aquí porque `gamesStore.ts` ya lo usa.

##### 8. `services/gamesStore.ts` (Modify)

*   **Type / Scope**: Modelo de datos y persistencia.
*   **Proposed Changes**:
    *   `Game` gana `rev`, `syncedRev`, `editedBy`, `deletedAt` y `deletedBaseRev`, todos opcionales. `isValidGame` los valida solo si existen (enteros no negativos; `deletedAt` número finito).
    *   `saveGame(game, origin)` con `origin ∈ {edit, usage, remote}`. `edit`: dentro de una única transacción `readwrite` de IndexedDB lee la `rev` guardada, escribe `rev + 1`, `updatedAt`, `editedBy` y `lastUsedAt`, y deja la partida pendiente. `usage`: solo `uses` y `lastUsedAt`. `remote`: guarda tal cual y fija `syncedRev = rev` en la misma transacción; si el `rev` remoto es menor que el `syncedRev` local, conserva lo local, pone `syncedRev = 0` y avisa.
    *   `deleteGame(id)` guarda `deletedBaseRev`, sube `rev` y escribe `deletedAt` en lugar de borrar. `listGames()` oculta las lápidas; `listDeletedGames()` las devuelve para la papelera. Restaurar quita la lápida con un guardado `edit`.
    *   `purgeDeleted(now)`: en cada arranque, con la sincronización desactivada, elimina las lápidas de más de 30 días con el reloj local.
    *   `deviceId`: identificador aleatorio persistido en `localStorage` (`anagrama.deviceId.v1`).
    *   `runInit({ createDefault })`: no crea "Partida 1" mientras la primera sincronización está pendiente y no hay partidas.
    *   `writeFallback` pasa a ir dentro de `try/catch` y los `catch {}` registran el error en `diagnostics.ts`.

##### 9. `services/sync/syncMerge.ts` (Create)

*   **Type / Scope**: Función pura, sin red ni almacenamiento.
*   **Proposed Changes**: `merge(local, remote)` devuelve las partidas a guardar en local, las que hay que subir, las copias de conflicto y los avisos. Reglas de la especificación: solo en un lado (con el caso `syncedRev > 0` ausente en remoto: se conserva y se vuelve a subir, sin borrar); cambios en un solo lado; partida nunca sincronizada con contenido distinto; choque por `rev` más alta (empate por `editedBy` menor) con copia "(conflicto)" de id y `editedBy` deterministas y sin repetir el sufijo; borrado frente a edición por `deletedBaseRev`; remoto con `rev` menor que `syncedRev`; `404` como remoto vacío. No usa relojes ni purga lápidas: la purga la hace el servidor. Todo dato remoto pasa por `isValidGame` y los inválidos se descartan con un aviso.

##### 10. `services/backup.ts` (Modify)

*   **Type / Scope**: Copia de seguridad.
*   **Proposed Changes**: `buildBackup` omite las partidas con lápida y los campos solo locales (`syncedRev`, `lastUsedAt`). `restoreBackup` conserva su lógica actual ("(importada)" para ids repetidos con contenido distinto); las partidas que añade se guardan con origen `edit`, así que se sincronizan después como cualquier otra.

##### 11. `tests/sync.mjs` (Create), `tests/persistence.mjs` (Modify), `package.json` (Modify)

*   **Type / Scope**: Pruebas en Node con almacenes en memoria.
*   **Proposed Changes**: `tests/sync.mjs` cubre cada regla de `syncMerge`: un solo lado; ausente en remoto con `syncedRev > 0` (se conserva); cambio en un lado; nunca sincronizada con contenido igual y distinto; choque con `rev` distinta y con `rev` igual; id y `editedBy` deterministas de la copia y no repetir el sufijo; borrado frente a edición con y sin `rev` mayor que `deletedBaseRev` (CUJ 9); remoto con `rev` menor que `syncedRev`; `404` como remoto vacío; remoto inválido descartado; registros antiguos sin campos nuevos; idempotencia (fusionar dos veces no cambia nada); dos réplicas con reloj desfasado dan el mismo ganador. `tests/persistence.mjs` actualiza las expectativas de la fase 0 (`edit` sube `rev`, `usage` no; borrar deja lápida; `buildBackup` omite lápidas). `package.json`: añadir `node tests/sync.mjs` al script `test`.

#### Fase 2b: prueba previa de `ifMatch`

##### 12. `scripts/blob-race.mjs` (Create)

*   **Type / Scope**: Herramienta de desarrollo, fuera del bundle.
*   **Proposed Changes**: Contra un almacén Blob privado de pruebas (lo crea el autor y define las variables; ver Open Questions): crea el documento sin `allowOverwrite` y comprueba que un segundo `put` de creación falla; lanza dos `put` simultáneos con el mismo `ETag` y comprueba que exactamente uno recibe `BlobPreconditionFailedError`; comprueba `get` con `useCache: false` justo después de escribir. Imprime el resultado.
*   **Puerta**: si una de las dos subidas simultáneas no recibe el error, o si la creación sin `allowOverwrite` no falla, se detiene el diseño y se vuelve a elegir almacén. El resultado se anota en Open Questions antes de pasar a la fase 3.

#### Fase 3: servidor y motor

##### 13. `api/sync.ts` (Create)

*   **Type / Scope**: Función serverless de Vercel (TypeScript).
*   **Proposed Changes**: Autenticación: bearer comparado en tiempo constante con `SYNC_TOKEN`; sin coincidencia, `401` sin cuerpo. `GET`: `get('anagrama-sync.json', { access: 'private', useCache: false })`; `404` si no existe; `200` con el JSON y `ETag`; admite `If-None-Match` y responde `304`. `PUT`: exige `If-Match` o ausencia del Blob para crear; valida objeto con partidas y `schemaVersion` igual a 1 (si no, `400`); más de 1 MB responde `413`; copia el documento actual a `anagrama-sync.prev.json`; purga las lápidas con `deletedAt` de hace más de 30 días comparando con la hora del servidor; escribe con `allowOverwrite: true`, `addRandomSuffix: false` e `ifMatch`; `BlobPreconditionFailedError` (o el fallo de creación por existencia) responde `412`. Cabeceras `Cache-Control: no-store`. No registra el contenido de las partidas.

##### 14. `services/sync/syncTransport.ts` (Create)

*   **Type / Scope**: Interfaz y cliente HTTP.
*   **Proposed Changes**: Interfaz `SyncTransport` con `pull(etag?)` y `push(doc, etag?)`. `HttpSyncTransport(token)` usa `fetch('/api/sync')` y devuelve errores tipados: no autorizado (`401`), sin red, error del servidor, demasiado grande (`413`) y esquema no válido (`400`).

##### 15. `services/sync/syncEngine.ts` (Create)

*   **Type / Scope**: Motor de sincronización.
*   **Proposed Changes**: Estados `disabled | syncing | upToDate | offline | tokenRejected | error`. Disparadores: arranque, `visibilitychange` a visible, `online` y 2 s tras una edición local; sin sondeo ni envío al cerrar la página. Ciclo: `pull` → `merge` → aplicar a local con origen `remote` → `push` si hay pendientes con `If-Match` (el ETag de la última respuesta `200`; con `304` se conserva el guardado). Tras un `push` correcto fija `syncedRev` al `rev` que se envió (no al actual) y guarda el ETag nuevo. Un `412` repite el ciclo (máximo 3 seguidos; luego `error`). Un fallo de red o del servidor deja `offline` o `error` y se reintenta en el siguiente disparador. Primera sincronización: guarda una copia previa con `buildBackup()` en `localStorage` (una sola; si falla por `QuotaExceeded` no empieza y pide exportar una copia manual). Persiste en `localStorage` (`anagrama.sync.v1`): token, interruptor, modo de despliegue (`pushOnly` o `full`), último ETag, `lastSyncedAt` y último error. Un `400` por esquema muestra "Actualiza la app para sincronizar".

##### 16. `tests/sync.mjs` (Modify)

*   **Type / Scope**: Pruebas del motor con transporte falso.
*   **Proposed Changes**: Ciclo completo con dos réplicas y un servidor simulado con ETag; edición hecha durante un `push` en vuelo (queda pendiente); tres `412` seguidos pasan a `error`; primera sincronización con datos en ambos lados (CUJ 5); `404` tras haber sincronizado; `401` pasa a `tokenRejected`; `413` y `400` producen el aviso correcto; modo `pushOnly` no aplica datos remotos.

##### 17. `.gitignore`, `.env.example` (Create), `package.json` (Modify)

*   **Type / Scope**: Configuración.
*   **Proposed Changes**: `.gitignore`: añadir `.env*` (excepto `.env.example`) y `.vercel`. `.env.example` documenta `SYNC_TOKEN` y las variables del almacén Blob. `package.json`: dependencias `@vercel/blob` y `@vercel/node` (tipos).

#### Fase 4: interfaz de sincronización

##### 18. `hooks/useSync.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Expone el estado del motor, `enable(token)`, `disable()` (borra token y metadatos, no las partidas), `syncNow()` y los pendientes. Al aplicar cambios remotos refresca `useGames` y dispara `onRemoteAdopted` cuando afecta a la partida activa sin pendientes.

##### 19. `components/SyncStatusChip.tsx`, `components/SyncPanel.tsx` (Create)

*   **Type / Scope**: Componentes.
*   **Proposed Changes**: El chip muestra "Guardado en este aparato" y el estado con los textos de la lista única de los Goals. `SyncPanel` (en un diálogo con `Overlay`): campo del token, interruptor, "Sincronizar ahora", última sincronización, pendientes, último error, "Copiar diagnóstico" y la petición de almacenamiento persistente (`navigator.storage.persist()`, si el navegador lo admite; si no se concede, muestra el aviso). Los errores persistentes aparecen como franja con "Reintentar".

##### 20. `components/GameSwitcher.tsx` (Modify)

*   **Type / Scope**: Lista de partidas.
*   **Proposed Changes**: Aloja el chip. Añade "Eliminadas recientemente" (lista de `listDeletedGames()` con "Restaurar" y días restantes). El diálogo de borrar dice que también se borrará en los demás aparatos si la sincronización está activa. Mueve Exportar e Importar a un menú "Copia de seguridad" y muestra el resumen completo de restaurar (el que ya calcula `restoreBackup`, incluidas las partidas renombradas).

##### 21. `components/Toast.tsx` (Modify)

*   **Type / Scope**: Avisos.
*   **Proposed Changes**: `role="status"` y `aria-live="polite"` para avisos normales y `role="alert"` para errores. Soporta los avisos persistentes con acción que crea `useToast`.

##### 22. `App.tsx` (Modify)

*   **Type / Scope**: Componente raíz.
*   **Proposed Changes**: Sustituye el "Guardado" suelto por el chip y monta `useSync`. El pie pasa a "Solo en este aparato" o "Sincronizado" según el estado (no hay cuentas).

##### 23. `services/wordBlocklist.ts`, `services/wordCandidates.ts` (Modify)

*   **Type / Scope**: Almacenamiento de listas.
*   **Proposed Changes**: Reemplazar los `catch {}` por registro en `diagnostics.ts`. No cambia el formato y estas listas no se sincronizan en esta fase.

#### Fase 5: documentación y activación

##### 24. `README.md`, `services/README.md`, `components/README.md`, `tests/README.md`, `data/README.md` (Modify)

*   **Type / Scope**: Documentación.
*   **Proposed Changes**: Quitar la afirmación de que no hay red. Explicar el modo local y el sincronizado, qué se sincroniza y qué es local (tabla del modelo de datos), cómo crear el almacén Blob privado y definir `SYNC_TOKEN`, que la sincronización viene apagada por defecto, las pruebas nuevas y la URL definitiva de producción (IndexedDB es por origen).

##### 25. Activación por modos (sin archivo nuevo)

*   **Type / Scope**: Procedimiento con el modo `pushOnly`/`full` del motor.
*   **Proposed Changes**: Con la fase 6 entregada: primero `pushOnly` en el ordenador (solo sube); comprobar el documento remoto; después `full` en los dos aparatos; por último ocultar (no quitar) Exportar e Importar. Marcha atrás: apagar el interruptor.

#### Fase 6: sin conexión

##### 26. `index.html` (Modify)

*   **Type / Scope**: Documento base.
*   **Proposed Changes**: Quitar el `<script src="https://cdn.tailwindcss.com">`, el bloque `tailwind.config`, los enlaces a cdnjs (Font Awesome) y a Google Fonts, y el `importmap` a `aistudiocdn.com`. Añadir `<link rel="manifest">` e iconos.

##### 27. `tailwind.config.js`, `postcss.config.js` (Create), `index.css`, `index.tsx`, `package.json` (Modify)

*   **Type / Scope**: Estilos y dependencias.
*   **Proposed Changes**: Trasladar sin cambios los colores `ink`, `accent`, `brand` y las fuentes de la configuración inline a `tailwind.config.js` (Tailwind 3.4 con PostCSS y autoprefixer). `index.css` añade las directivas `@tailwind`. `index.tsx` importa `@fontsource/inter` (400-800), `@fontsource/jetbrains-mono` (500, 700) y `@fortawesome/fontawesome-free/css/all.min.css`. Capturas antes y después para comprobar que no cambia el aspecto.

##### 28. `vite.config.ts` (Modify), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (Create), `components/UpdateBanner.tsx` (Create)

*   **Type / Scope**: PWA.
*   **Proposed Changes**: `vite-plugin-pwa` con `registerType: 'prompt'`, manifest (`name`, `short_name`, `display: standalone`, `theme_color #080b14`, iconos) y precaché del shell y del worker. Regla de caché en tiempo de ejecución `CacheFirst` para `public/services/dictionary.txt`, de modo que la instalación no espera 7,7 MB. `/api/*` va siempre a red (`NetworkOnly`) y queda fuera del fallback SPA. `UpdateBanner` muestra "Hay una versión nueva · Recargar"; nunca recarga a mitad de partida.

##### 29. `App.tsx` (Modify)

*   **Type / Scope**: Estado del diccionario y medición.
*   **Proposed Changes**: Estado visible "disponible sin conexión" cuando `caches.match` confirma el diccionario; si se abre sin red antes de terminar la descarga, mensaje "necesita red la primera vez" con botón "Reintentar". `performance.mark/measure` alrededor de la descarga, la construcción del DAWG y `solveBoard`. No se cambia la carga del diccionario en memoria.

#### Fase 7: uso en móvil y ordenador (intención provisional)

Antes de implementar esta fase hay que leer `BoardPanel.tsx`, `Results`, `WordInput`, `BoardBuilder`, `Overlay.tsx`, `Toast.tsx` y `boardImage.ts`; el detalle de abajo puede cambiar tras esa lectura.

##### 30. `components/GameSwitcher.tsx` (Modify)

*   **Type / Scope**: Lista de partidas.
*   **Proposed Changes**: La zona principal de cada fila pasa a `<button>` y las acciones a botones hermanos de 44 px. Su visibilidad depende de `(hover: hover)`/`(pointer: coarse)`. Botón visible de renombrar; F2 renombra y Supr abre la confirmación. Hora de la última edición visible en móvil. Aviso de nombres duplicados al renombrar y al truncar a 40 caracteres.

##### 31. `components/Tabs.tsx` (Create), `App.tsx` (Modify)

*   **Type / Scope**: Componente accesible.
*   **Proposed Changes**: Pestañas con `role="tablist"`, `tab`, `tabpanel`, `aria-selected` y navegación por flechas, en lugar de los botones sueltos.

##### 32. `components/ScrabbleBoard.tsx` (Modify)

*   **Type / Scope**: Tablero.
*   **Proposed Changes**: Entrada por `beforeinput`/`input` (acepta varias letras de un evento compuesto) en lugar de `onKeyDown` en el input oculto, y `visualViewport` para mantener visible la casilla activa. Tab sale del tablero y la dirección cambia con otra tecla; `Escape` suelta el foco; región `aria-live` con fila, columna y dirección. Casillas memoizadas (`Cell`) y `touch-action: manipulation`.

##### 33. `hooks/useBoardHistory.ts` (Create), `components/BoardPanel.tsx` (Modify)

*   **Type / Scope**: Deshacer y diseño.
*   **Proposed Changes**: Pila en memoria de 50 pasos por partida activa, vaciada al cambiar de partida y al recibir `onRemoteAdopted`. "Vaciar tablero" entra en la pila. Botones de deshacer y rehacer. En móvil "Mejor jugada" fija abajo y la lista de jugadas sin scroll anidado. A partir de 1280 px, `max-w-7xl` y lista de partidas como barra lateral plegable.

##### 34. `hooks/useHotkeys.ts`, `components/HotkeysHelp.tsx` (Create), `App.tsx` (Modify)

*   **Type / Scope**: Atajos.
*   **Proposed Changes**: Hook único que ignora campos de texto. Ctrl/Cmd+Enter buscar o "Mejor jugada", `/` buscar partida, Alt+N nueva partida, Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, `?` ayuda con la lista.

##### 35. `components/ScreenshotImport.tsx`, `components/Overlay.tsx` (Modify)

*   **Type / Scope**: Importar captura y diálogos.
*   **Proposed Changes**: "Aplicar a la partida" muestra la partida destino, avisa si tiene fichas, ofrece "aplicar aquí" o "nueva partida" y permite Deshacer. Cerrar con correcciones sin aplicar pide confirmación; "Reajustar" conserva las correcciones. En móvil, pistas propias del aparato (sin "arrastra / Ctrl+V"; ⌘V en Mac) y botones en pantalla para vaciar una casilla y poner un comodín. Estados dudoso/ok/error con forma o texto además del color. `Overlay`: `role="dialog"`, `aria-modal`, foco inicial, trampa de foco y retorno de foco.

##### 36. `components/BoardPanel.tsx`, `components/ScreenshotImport.tsx` (Modify)

*   **Type / Scope**: Textos.
*   **Proposed Changes**: "Leer captura" pasa a "Leer tablero desde captura" e "Importar" (partidas) a "Restaurar copia". Vocabulario único (partida, detectadas) y mantenimiento del diccionario plegado como opción avanzada.

##### 37. `components/README.md`, `services/README.md`, `tests/README.md`, `README.md` (Modify)

*   **Type / Scope**: Documentación final.
*   **Proposed Changes**: Reflejar los componentes y hooks nuevos, el modelo de datos de sincronización, el servidor y las pruebas nuevas.

### Verification Plan

*   **Compilación/Build**: `npm run build` en cada fase. En la fase 6, comprobar que `dist/` no referencia `cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, `fonts.googleapis.com` ni `aistudiocdn.com`.
*   **Pruebas unitarias**: `npm test` (incluye `tests/sync.mjs` y la `tests/persistence.mjs` actualizada). Las cifras de `tests/regresion.mjs` no deben cambiar.
*   **Análisis estático**: `npm run typecheck`.
*   **Cobertura requerida**: todas las ramas de `syncMerge` (un solo lado, ausente en remoto con `syncedRev > 0`, cambio en un lado, nunca sincronizada, choque con copia determinista, borrado frente a edición, remoto con `rev` menor que `syncedRev`, `404`, remoto inválido) y todos los estados del motor.
*   **Prueba previa (fase 2b)**: `scripts/blob-race.mjs` contra un almacén Blob de pruebas: dos subidas simultáneas con el mismo `ETag` (una recibe `412`), creación sin `allowOverwrite` (la segunda falla) y `get` sin caché tras escribir. Es una puerta: sin este resultado no se construye la fase 3.
*   **Integración con el servidor**: `vercel dev` con el almacén de pruebas y un `SYNC_TOKEN` de prueba. Comprobar `401` sin token, `404` sin documento, creación, `412` con `ETag` viejo, `413` con más de 1 MB, `400` con otro `schemaVersion`, `304` con `If-None-Match`, `anagrama-sync.prev.json` tras un `PUT` y la purga de lápidas de más de 30 días.
*   **Atomicidad de `rev` entre pestañas**: con la app abierta en dos pestañas del mismo navegador, editar la misma partida en ambas y comprobar que los `rev` guardados no se repiten. IndexedDB no se simula en Node, así que esta comprobación es manual.
*   **Dos aparatos reales (móvil y ordenador)**: los nueve recorridos de este documento (CUJ 1 a 9), incluida la primera sincronización con datos en ambos lados (CUJ 5), el choque con copia "(conflicto)" (CUJ 3) y la edición sin conexión frente a un borrado (CUJ 9).
*   **Sin conexión**: instalar la app, cortar la red y abrir; editar tres partidas y recuperar la red. Verificar "Sin red · 3 pendientes" y la puesta al día.
*   **Móvil real** (fase 7): probar la entrada de letras con el teclado de Android y de iOS y comprobar que la casilla activa queda completamente visible en un móvil de 360 px de ancho. Medir el arranque en frío del diccionario en el móvil del autor; si supera 5 s se reabre la decisión de carga.
*   **Accesibilidad** (fase 7): recorrer lista, pestañas y tablero solo con teclado; comprobar que Tab sale del tablero en una pulsación. Medir el contraste de los textos de 11 px con una herramienta y corregir los que no lleguen a 4,5:1.
*   **Verificación en navegador** (pestaña de la app en local, sin errores en la consola de Chrome): lista de partidas, diálogo de nombre, chip de estado, papelera, Diagnóstico y atajos.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
