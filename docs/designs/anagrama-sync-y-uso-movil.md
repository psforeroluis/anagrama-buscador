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

*   Los tres bloques van en un solo documento por decisión del autor. El bloque 1 corresponde a las fases 2 a 5 del plan (con la prueba previa 2b), el bloque 2 a la fase 6 y el bloque 3 a la fase 7, que queda diferida (ver Detailed Implementation Plan). La fase 6 no depende de la sincronización y la 7 solo de la fase 4; ambas se pueden extraer a documentos propios.
*   Las fases (0 a 7) y el Verification Plan se definen en la sección Detailed Implementation Plan, al final del documento.
*   Orden de entrega: las fases 0 y 1 (preparación, necesarias para el bloque 1) primero; el bloque 2 (fase 6) antes de activar la sincronización; después el bloque 1 (fases 2 a 5); el bloque 3 (fase 7) después de la fase 4 y solo cuando se complete su lista de decisiones pendientes. Cada bloque se da por bueno por separado con su criterio, pero el criterio del bloque 1 se comprueba con la sincronización activada, para lo que el bloque 2 debe estar entregado.
*   Criterio de salida por bloque:
    *   Bloque 1 (sincronización): los CUJ 1, 2 (parte de puesta al día), 3, 4, 5 y 9 pasan con un móvil y un ordenador reales, la prueba de dos subidas simultáneas devuelve `412` a una de ellas y `npm test` sigue en verde.
    *   Bloque 2 (sin conexión): el CUJ 2 (parte sin red) pasa con la app instalada y la red cortada, y `dist/` no referencia dominios externos. Es requisito previo de activar la sincronización.
    *   Bloque 3 (uso en móvil y ordenador): los CUJ 6, 7 y 8 pasan en un móvil real y en un ordenador. Está diferido: su detalle es una intención provisional y no entra en la puerta de implementación de este plan. Antes de implementarlo hay que leer `BoardPanel`, `ScrabbleBoard`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast`, `boardImage`, `glyphs.ts` e `index.css` y cerrar la lista de decisiones pendientes de la fase 7.
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
*   Diálogos con `role="dialog"`, foco atrapado y devuelto, estados de captura que no dependen solo del color y textos de 11 px con contraste de al menos 4,5:1.
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
*   **Origen fijo en Vercel**: IndexedDB es por origen. Hay que confirmar la URL definitiva (`data/README.md` cita `anagrama-buscador.vercel.app`) y revisar `vite.config.ts` antes de activar la sincronización o mover datos. Las fases 0 y 1 no dependen de esta respuesta; la 2b en adelante sí, porque necesita el almacén Blob.
*   **Alta del almacén en Vercel**: hay que crear un almacén Vercel Blob privado en el panel del proyecto y definir las variables `SYNC_TOKEN` y las de Blob. Lo hace el autor; el repo no contiene `vercel.json` ni carpeta `api/`.
*   **Arranque del diccionario en móvil**: `dictionary.txt` tiene 688.255 líneas y pesa 7,7 MB sin comprimir. Falta medir el tiempo de arranque (descarga y construcción del DAWG) en un móvil de gama media antes de decidir si se cambia la carga. El Goal de usar sin red depende de esta medición: hasta tenerla, la descarga aparte del diccionario es una decisión provisional que se reabre si el arranque en frío en un móvil de gama media supera 5 s.
*   **Teclado de iOS**: falta comprobar en el iPhone del autor que el input oculto del tablero recibe `beforeinput`/`input` correctos y que `visualViewport` mantiene visible la casilla activa. La entrada con `beforeinput`/`input` ya está decidida; si la prueba en el iPhone falla, la decisión se reabre. Android queda fuera de alcance.
*   **Aparatos del autor** (resuelto): un iPhone (Safari) y un ordenador. La app se instala desde Safari con "Añadir a pantalla de inicio"; iOS puede expulsar IndexedDB y `localStorage` tras semanas sin abrir la app (ver Risks & Mitigations), por lo que importa la petición de almacenamiento persistente y la copia del servidor.

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
*   **Then**: Como el móvil tiene cambios pendientes (`rev > syncedRev`) y el otro lado una lápida, gana la edición: B se restaura en ambos aparatos con `rev = max(rev de ambos) + 1` y un aviso lo dice. Los dos aparatos acaban con la misma versión y no se pierde la edición.

## Technical Plan (Architecture)

### Decisiones de arquitectura tomadas por el autor

*   **Servidor: un único documento.** El servidor guarda toda la colección de partidas en un solo JSON.
*   **Almacén: Vercel Blob privado.** Según la documentación de Vercel (`https://vercel.com/docs/vercel-blob`, consultada el 2026-11-22), soporta escritura condicional con `put(..., { ifMatch: etag })`, que falla con `BlobPreconditionFailedError` si el fichero cambió, y lectura sin caché con `get(..., { useCache: false })`. Es lectura de documentación, no una prueba en ejecución: la fase 2b del plan lo prueba con dos subidas simultáneas antes de construir el resto. Si ninguna de las dos subidas simultáneas recibe el error, o si las dos lo reciben, el diseño se detiene y se vuelve a elegir almacén. El fichero tiene ruta fija, `anagrama-sync.json`, con `addRandomSuffix: false`. Tampoco están verificados que el `put` sin `allowOverwrite` falle cuando el Blob ya existe ni su traducción a `412`; entran en la misma prueba previa (fase 2b). Si la creación sin `allowOverwrite` no falla, no se detiene el diseño: se anota el resultado y la primera sincronización se apoya en el reintento del ciclo.
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
| `lastUsedAt` | solo local | Hora local de la última vez que se abrió o editó la partida. Alimenta el orden por uso sin tocar `updatedAt`. |
| `uses` | solo local | Ya existe: veces que se ha jugado la partida en este aparato. No se sube; el orden por uso es propio de cada aparato. |

Documento remoto:

```text
{ schemaVersion: 1,
  games: { "<id>": { id, name, board, rack, blanks, createdAt, updatedAt,
                     rev, editedBy, deletedAt? } } }
```

`updatedAt` viaja solo como información (por ejemplo, para mostrar "hace X"). La elección del ganador de una fusión no usa relojes; solo la purga de lápidas compara `deletedAt` (reloj del aparato que borró) con la hora del servidor. Un reloj muy desviado solo adelanta o retrasa esa purga, y se acepta como riesgo. Tamaño medido con `JSON.stringify` de una partida sintética con las 225 casillas llenas, atril de 7 letras, un nombre de 15 caracteres, lápida y dos UUID: 809 bytes. Con 1 MB = 1.048.576 bytes caben unas 1.296 partidas; con unas decenas de partidas el documento ocupa decenas de KB. El servidor rechaza documentos de más de 1 MB.

### Fusión (función pura `syncMerge`)

Se usa solo en la sincronización. `restoreBackup` no cambia (ver Non-Goals): las partidas que añade se guardan con origen `edit` y se sincronizan como cualquier otra. Para cada `id`:

1.  Solo existe en un lado: se toma esa versión, salvo este caso: si existe en local con `syncedRev > 0` y no existe en remoto ni tiene lápida, no se elimina: se conserva y se vuelve a subir (`syncedRev = 0`), y se avisa. Esto puede resucitar una partida borrada y ya purgada en un aparato que estuvo más de 30 días sin conexión; se declara comportamiento aceptado. Un `404` equivale a un remoto vacío: se aplica esta misma regla (se sube lo local y no se borra nada).
2.  Existe en ambos:
    *   Local sin cambios (`rev == syncedRev`) y remoto con `rev` mayor: se adopta el remoto.
    *   Local con cambios y remoto sin cambios (`remote.rev == syncedRev`): se conserva el local y se sube.
    *   Local sin `syncedRev` (nunca sincronizada) y contenido distinto del remoto: se aplica la regla de choque. Si el contenido es igual, no se hace nada.
    *   Cambiaron los dos lados (con `rev` igual y contenido distinto, incluida lápida frente a no lápida, también cuenta como choque): gana la `rev` más alta (empate: gana el `editedBy` menor en orden de texto). La perdedora se guarda como partida nueva con nombre "Nombre (conflicto)" (si el nombre ya termina así, no se repite el sufijo) y se avisa. Su id es `<id original>-conflicto-<rev perdedora>-<editedBy perdedora>` y su `editedBy` es el de la perdedora (cadenas, sin hash ni `crypto.subtle`, para que la función siga siendo síncrona y pura), así que dos aparatos que fusionan el mismo choque obtienen la misma copia, y dos copias con el mismo id son la misma partida. La copia empieza con `rev = 1` y `syncedRev = 0`. "Contenido distinto" significa `name`, `board`, `rack` o `blanks` distintos; los metadatos no cuentan. Un `rev` ausente se lee como 1 dentro de la fusión. La función devuelve `{ toLocal, toRemote, conflicts, notices }`. Si después se edita y choca otra vez, se aplica la regla normal sobre su propio id.
3.  Borrado frente a edición: si un lado tiene cambios pendientes (`rev > syncedRev`) y el otro una lápida, gana la edición: la partida se restaura con `rev = max(rev de ambos) + 1` y se avisa; en otro caso gana la lápida. Restaurar una partida borrada es una edición.
4.  El servidor purga del documento remoto las lápidas con `deletedAt` de hace más de 30 días (plazo provisional), comparando con su propia hora. Después de leer el documento remoto y antes de fusionar, cada aparato elimina de su almacenamiento las lápidas que ya subió (`syncedRev > 0`) y que ya no están en él; si no, la fusión las volvería a subir y el servidor a purgarlas sin fin. Con un `404` no se elimina nada.

Todo dato remoto pasa por `isValidGame` antes de entrar en local. El resultado de la fusión nunca borra una partida local que no tenga lápida.

### Cambios en el guardado local

`saveGame` hoy fija `updatedAt = Date.now()` en cada guardado. Pasa a recibir un origen obligatorio (`edit`, `usage`, `remote` o `copy`) y devuelve `{ notice?: string }` para el aviso de `remote`:

*   `edit`: sube `rev` (`rev = (guardada.rev ?? 1) + 1`), fija `updatedAt` y marca la partida como pendiente. `saveGame` lee y escribe `rev` dentro de una única transacción `readwrite` de IndexedDB, para que dos pestañas del mismo aparato no escriban el mismo número.
*   `copy`: guarda una copia de conflicto con `rev = 1` y `syncedRev = 0`, sin sumar.
*   `usage`: lee el registro guardado y mezcla solo `uses` y `lastUsedAt`; al abrir una partida solo cambia `uses` y la hora local de último uso (`lastUsedAt`, ver fase 0). No toca `rev`, `updatedAt` ni pendientes.
*   `remote`: aplica datos remotos conservando `rev` y `updatedAt`, y fija `syncedRev = rev` en la misma transacción. No marca pendiente, para evitar ecos. Si el `rev` remoto es menor que el `syncedRev` local (por ejemplo, un Blob restaurado), el aparato lo trata como un servidor reiniciado: muestra un aviso y vuelve a subir lo local.

`deleteGame` marca `deletedAt` y sube `rev` en lugar de borrar. El Deshacer de 9 s y "Eliminadas recientemente" quitan la lápida con una edición. `listGames` oculta las partidas con lápida; un listado aparte alimenta la papelera.

Con la sincronización desactivada, cada arranque purga en local las lápidas de más de 30 días con el reloj local, para que no crezcan el almacenamiento ni las exportaciones. Desactivar la sincronización conserva `syncedRev`; al reactivarla, una partida ausente en remoto sigue la regla 1 de la fusión (se conserva y se vuelve a subir).

### Motor de sincronización

Módulo nuevo `services/sync/` con tres piezas:

*   **Cliente de transporte** detrás de una interfaz `SyncTransport` (`pull(etag?)` y `push(doc, etag?)`; `pull` devuelve `{ status: 'notModified' }` ante un `304`). La implementación usa `fetch` a `/api/sync` con `Authorization: Bearer <token>`. Cambiar de proveedor solo toca esta pieza.
*   **Fusión pura** (`syncMerge`), probada en Node.
*   **Motor** con estados `disabled | syncing | upToDate | offline | tokenRejected | error`. `disabled` es el interruptor apagado o no haber pegado el token. Guarda en `localStorage` (`anagrama.sync.v1`): token, interruptor, `firstSyncPending`, `deviceId` (se conserva al desactivar), último ETag, `lastSyncedAt` y último error. Solo corre un ciclo a la vez: un disparador durante un ciclo marca "repetir" y cada edición reinicia el temporizador de 2 s. Un `413` o un `400` pasan a `error` con su código.

Disparadores: al arrancar, al volver la pestaña a primer plano (`visibilitychange`), al recuperar red (`online`) y 2 s después de una edición local. No hay sondeo ni envío al cerrar la página: los pendientes se deducen de `rev > syncedRev`, sobreviven a recargas y se envían en el siguiente disparador. Si una sincronización falla por red o por el servidor, el chip pasa a "Sin red · N pendientes" o a "Error" y se reintenta en el siguiente disparador, sin espera escalonada.

Ciclo de una sincronización: `GET` (con `If-None-Match`) → fusión → aplicar a local con origen `remote` → si hay cambios locales, `PUT` con `If-Match` = ETag leído (el ETag de la última respuesta `200`; con un `304` se conserva el ETag guardado). Tras un `PUT` correcto se fija `syncedRev` al `rev` que se envió en esa petición (no al actual) y se guarda el ETag devuelto; las ediciones hechas durante el envío siguen pendientes. Un `412` repite el ciclo desde el `GET` (máximo 3 intentos seguidos; después, estado "Error" con franja "Reintentar").

**Varias pestañas.** Cada pestaña sincroniza por su cuenta y la seguridad la da `If-Match`: si dos suben a la vez, una recibe `412` y repite el ciclo. Al volver a primer plano, una pestaña relee el almacenamiento local y ve lo que otra haya guardado. La lectura-modificación-escritura de `rev` en una única transacción de IndexedDB evita números repetidos.

**Primera sincronización.** Antes de empezar se guarda una copia automática (`buildBackup()`) en `localStorage` bajo una clave nueva, conservando solo la última. Si no cabe por cuota (`QuotaExceeded`), la primera sincronización no empieza y se pide al usuario que exporte una copia manual. Todas las partidas locales que no tienen `syncedRev` cuentan como pendientes. Si el servidor no tiene documento, se crea con las partidas locales (`put` sin `allowOverwrite`; si otro aparato lo creó antes, el `put` falla y se repite el ciclo; no verificado, ver la prueba previa). Si lo tiene, se hace la unión por `id`. Mientras la primera sincronización está pendiente y no hay partidas locales, no se crea "Partida 1" (cambio en `runInit`).

### Función serverless `api/sync.ts`

*   `GET`: lee el Blob con `get(path, { access: 'private', useCache: false })` y devuelve el JSON con su `ETag`. Sin Blob: `404`. Un `404` se trata como un remoto vacío (regla 1 de la fusión): el aparato sube lo local y no borra nada.
*   `PUT`: exige `If-Match` (o ausencia del Blob para crear). Valida que el cuerpo sea un objeto con partidas y que `schemaVersion` sea 1 (si no, `400`). Un cuerpo de más de 1 MB responde `413`. Antes de escribir copia el documento actual a `anagrama-sync.prev.json` (una versión previa). Escribe con `put(path, body, { access: 'private', allowOverwrite: true, addRandomSuffix: false, ifMatch })`. Si salta `BlobPreconditionFailedError`, o (no verificado) el `put` de creación falla porque el Blob ya existe, responde `412`. Al escribir purga las lápidas con `deletedAt` de hace más de 30 días (plazo provisional), comparando con su propia hora.
*   Contrato HTTP: `PUT` correcto responde `200` con cabecera `ETag` y cuerpo `{ "etag": ... }`; el `If-Match` lleva el ETag tal como lo devolvió el servidor (con comillas). `PUT` sin `If-Match` con Blob existente, y `PUT` con `If-Match` sin Blob, responden `412`; otros métodos, `405`. El límite de 1 MB se comprueba con `content-length` y con la longitud real del cuerpo. La validación del servidor es superficial (cada partida con `id` texto y `rev` número); el cliente aplica `isValidGame`. Un fallo al escribir `prev.json` no impide el `PUT`. El `400` lleva `{ error: 'schema' | 'body' }`. La constante de 30 días vive en `services/sync/constants.ts` (provisional), importada por cliente y servidor.
*   Autenticación: comparación en tiempo constante del bearer con `SYNC_TOKEN`, un valor aleatorio de al menos 32 caracteres (adivinarlo no es viable). Respuestas `401` sin detalles. No hay límite de intentos propio, porque una función sin estado no tiene dónde guardar el contador; si hiciera falta, se puede añadir una regla de límite de tasa de la plataforma (no verificado). Sin token válido no se lee ni escribe nada. Para rotarlo se cambia `SYNC_TOKEN` en Vercel y se vuelve a pegar el nuevo en cada aparato.
*   Mismo origen que la app, así que no hace falta CORS. El token nunca se compila en el cliente: el usuario lo pega una vez en cada aparato (pantalla "Sincronización" y `localStorage`).
*   Desactivar la sincronización en un aparato borra el token y los metadatos de sincronización de ese aparato, sin tocar las partidas.
*   Un cliente que recibe `400` con `{ error: 'schema' }` muestra "Actualiza la app para sincronizar".

### Refactor de `App.tsx` (previo a la sincronización, sin cambio de comportamiento)

`App.tsx` mezcla worker, búsqueda, partidas, mantenimiento, avisos y maquetación, y duplica el estado de la partida activa (`board`, `boardRack`, `boardBlanks`) reponiéndolo a mano al cargar, seleccionar, crear, borrar y deshacer, con `skipSaveRef`. Se extraen solo los hooks que la sincronización necesita:

*   `useGames`: lista de partidas y `activeGameId`. La partida activa es un valor derivado, no tres `useState` copiados. Devuelve `{ games, activeGame, updateActive, select, create, rename, remove, undoRemove, refresh }`; `refresh()` relee el almacenamiento (lo usa `useSync`). Recibe cambios con origen `edit` (`updateActive`) o `usage` (`select`). Elimina `skipSaveRef`.
*   `useToast`: expone `show(message, { action?, durationMs?, persistent? })`; conserva los 3 s de los avisos normales y los 9 s del aviso con acción.
*   `useSync` (nuevo, en la fase 4) conecta el motor con `useGames` y el chip; tras `refresh()` dispara `onRemoteAdopted` cuando cambia la partida activa.

El resto de la separación de `App.tsx` (worker, mantenimiento del diccionario) queda fuera de este diseño; los atajos de teclado (`useHotkeys`) pertenecen al bloque 3.

Si llega un cambio remoto a la partida abierta y esa partida no tiene cambios pendientes, se adopta y se muestra un aviso, y se vacía la pila de deshacer del tablero. Si los tiene, se aplica la regla de choque de la fusión. Si llega un cambio remoto durante la espera de 2 s, la edición local pendiente cuenta como cambio local.

### Estado visible

Un chip junto a la lista de partidas sustituye al "Guardado" suelto que hoy se muestra sobre la cabecera. Muestra por separado "Guardado en este aparato" y el estado de sincronización, con los textos de la lista única de los Goals (el estado "Error" añade la causa). Los errores persistentes usan una franja con botón "Reintentar", no un aviso de 3 s. El diálogo "Sincronización" incluye una sección "Diagnóstico" que lista los últimos 50 errores con su causa, la hora de la última sincronización y el número de pendientes, y se puede copiar. Los `catch {}` de `gamesStore.ts`, `wordBlocklist.ts` y `wordCandidates.ts` pasan a registrar el error en ese listado.

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
*   **Atajos** (`useHotkeys`, inactivos dentro de campos de texto; el input oculto del tablero cuenta como campo de texto salvo para Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z): Ctrl/Cmd+Enter buscar o "Mejor jugada", `/` buscar partida, Alt+N nueva partida, `?` ayuda.
*   **Escritorio y móvil**: a partir de 1280 px de ancho se amplía el ancho máximo (`max-w-7xl`) y la lista de partidas puede plegarse como barra lateral. En móvil "Mejor jugada" queda fija abajo.
*   **Importar captura**: "Aplicar a la partida" muestra la partida destino, avisa si tiene fichas y ofrece "aplicar aquí" o "nueva partida", con Deshacer (usa la pila del tablero: se guarda una instantánea antes de aplicar). Cerrar con correcciones sin aplicar pide confirmación y "Reajustar" conserva las correcciones. En móvil se quitan las pistas de "arrastra / Ctrl+V" y se añaden botones en pantalla para vaciar y comodín. "Leer captura" pasa a "Leer tablero desde captura" e "Importar" a "Restaurar copia".
*   **Textos**: el pie de `App.tsx` y los READMEs dejan de decir que no hay red ("Solo en este aparato" cuando el estado es `disabled` y "Sincronizado" en los demás; no hay cuentas). Un único vocabulario: partida (no "juego"), detectadas (no "candidatas") y alta/baja solo dentro de Mantenimiento, plegado como opción avanzada.

### Seguridad, rendimiento y despliegue

*   **Seguridad y privacidad**: las partidas no son datos sensibles, pero el Blob es privado y el token vive solo en variables de entorno del servidor y en el `localStorage` de cada aparato. El token nunca va en URL. Mientras `index.html` cargue scripts de dominios externos (Tailwind, `aistudiocdn.com`), esos dominios podrían leer `localStorage`: quitar esas dependencias (la fase 6) es requisito previo de activar la sincronización.
*   **Rendimiento**: el volumen es de decenas de KB (809 bytes por partida en el peor caso medido); el coste en Vercel no se calculó (no verificado). La carga del diccionario en memoria no cambia en este diseño.
*   **Despliegue por fases con interruptor**: la sincronización viene apagada por defecto. Activación manual: en el ordenador, revisar el documento remoto y después en el móvil; la copia JSON queda siempre en el menú "Copia de seguridad". Marcha atrás: apagar el interruptor; lo local sigue siendo la fuente de verdad y el servidor no borra datos locales sin lápida. Las lápidas conservan el contenido 30 días y la copia automática previa a la primera sincronización permite volver atrás.

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

Cada fase deja `npm test`, `npm run typecheck` y `npm run build` en verde y se puede fusionar por separado. Las etiquetas Type / Scope y Proposed Changes son las de la plantilla de EGM.

**Estado del código a 2026-11-22.** El commit `bef3b54` ya contiene una primera implementación de la sincronización (`api/sync.ts`, `services/sync/*`, `components/SyncPanel.tsx`, `tests/sync.mjs`) que no pasó por esta revisión, y los informes de la revisión están confirmados en la raíz (`23c57d2`). Este plan describe el estado objetivo: cada fase empieza comparando el código existente con lo que pide y corrige solo las diferencias (por ejemplo, no existe `hooks/`). Contraste hecho el 2026-11-22 (con `npm test`, `typecheck` y `build` en verde). Ya cumple: fusión con "gana la edición" sin `deletedBaseRev`, ciclo con `If-Match`, un `412` repite hasta 3 veces, `syncedRev` al `rev` enviado, disparadores de arranque, `visibilitychange`, `online` y 2 s, copia previa única y `restoreBackup` intacto. Diferencias que corrigen las fases indicadas:

*   Fase 2 (corregida el 2026-11-22 en el código): origen obligatorio con `copy`, `(rev ?? 1) + 1`, id de copia sin hash, `purgeDeleted(now, ids)` con el motor, `diagnostics.ts` y el registro en `gamesStore.ts`. Quedan para la fase 2: `txReadWrite` explícito, `listAllGames` ya existe, y repartir `useGames` con `purgeDeleted`/`initGames({ createDefault })` (fase 1).
*   Fase 3 (corregida el 2026-11-22 en el código): `firstSyncPending` y `lastError` persistidos; `pull(etag?)` con `notModified` y `If-None-Match`/`304` en el servidor; `{ etag }` en el `PUT`; error `body`; `content-length`; `rev` numérico; `constants.ts`; precondiciones explícitas de creación y sobrescritura; temporizador y eventos inyectables en el motor (`start`, `notifyEdit`). Pendiente de la fase 3: el import relativo `../services/sync/constants.js` de `api/sync.ts` no se ha probado en `vercel dev` (el repo es `type: module`), y el comportamiento real del almacén Blob sigue sin verificar (fase 2b). `tests/api.mjs` comprueba el contrato HTTP con un Blob simulado.
*   Fase 4: el chip y el panel viven dentro de `App.tsx` y `SyncPanel.tsx`; faltan `SyncErrorBanner`, la sección Diagnóstico y `hooks/useSync.ts`.

**Lectura previa.** Cada archivo se lee antes de la fase en la que se modifica: `Results.tsx`, `WordInput.tsx`, `BoardBuilder.tsx`, `ScrabbleBoard.tsx`, `wordCandidates.ts`, `glyphs.ts` e `index.css`. `wordCandidates.ts` antes de la fase 4 y `ScrabbleBoard.tsx` antes de la 7.

### Fases y dependencias

| Fase | Contenido | Bloque | Depende de |
|---|---|---|---|
| 0 | Requisito previo: mover los informes a `docs/reviews/`, `lastUsedAt` completo y pruebas de caracterización | preparación | — |
| 1 | Refactor mínimo de `App.tsx`: `useGames` y `useToast`, con el nuevo contrato de props de `BoardPanel`, `GameSwitcher` y `Toast` | preparación | 0 |
| 2b | Puerta: prueba de `ifMatch` contra un almacén Blob real; si falla, se detiene el diseño. Se ejecuta antes de la fase 2 | 1 | 0, 1 y el alta del almacén Blob |
| 2 | Almacenamiento local (`rev`, orígenes de guardado, lápidas), registro de errores y fusión pura | 1 | 1 |
| 3 | Función serverless y motor de sincronización, apagado por defecto | 1 | 2 y 2b |
| 4 | Interfaz de sincronización: chip, token, papelera, copia de seguridad y Diagnóstico | 1 | 3 |
| 5 | Documentación y procedimiento de activación | 1 | 4 y 6 |
| 6 | Sin conexión: quitar dominios externos, PWA, descarga aparte del diccionario | 2 | 0 y 1 (ambas tocan `App.tsx`) |
| 7 | Uso en móvil y ordenador: **diferida** (intención provisional) | 3 | 4 |

Orden de entrega: 0, 1, 6, 2b, 2, 3, 4, 5; la fase 7 después de la 4 y solo cuando se complete su lista de decisiones. La fase 6 debe estar entregada antes de activar la sincronización (fase 5), porque mientras `index.html` cargue scripts externos esos dominios podrían leer el token de `localStorage`.

### Target Files to Create/Modify

#### Fase 0: requisito previo

##### 1. Informes de la revisión (Move)

*   **Type / Scope**: Archivos de proceso en la raíz: `concepts_brief.md`, `design_draft.md`, `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `goldfish_review_report.md`, `intermediate_zoom_out_report.md` e `implementation_readiness_report.md`.
*   **Proposed Changes**: Moverlos a `docs/reviews/` con `git mv` y confirmarlos en un commit propio con rutas explícitas, nunca con `git add -A`. Los cambios de `App.tsx`, `components/GameSwitcher.tsx`, `services/gamesStore.ts` y `tests/persistence.mjs` (diálogo de nombre y orden por uso) y los README ya están confirmados en `bef3b54`.

##### 2. `services/gamesStore.ts`, `App.tsx`, `tests/persistence.mjs`, `services/README.md` (Modify)

*   **Type / Scope**: Hora local de último uso (`lastUsedAt`), independiente de la sincronización.
*   **Proposed Changes**: `Game.lastUsedAt` es opcional, entra en la validación de `isValidGame` (número finito) y en la tabla del README como campo solo local. `usageScore`, `byRecent` y el desempate de `sortByUsage` usan `lastUsedAt ?? updatedAt`. Abrir una partida (`App.tsx:366`) y renombrarla (`App.tsx:429`) dejan de fijar `updatedAt`; editar fija `lastUsedAt`. Pruebas: abrir una partida la sube en el orden; una partida sin `lastUsedAt` se ordena por `updatedAt`.

##### 3. `tests/persistence.mjs` (Modify)

*   **Type / Scope**: Pruebas de caracterización.
*   **Proposed Changes**: Fijar con pruebas el comportamiento que cambia en la fase 2: `saveGame` pone `updatedAt` en cada guardado; `deleteGame` borra de verdad; `restoreBackup` añade "(importada)" cuando el nombre entrante ya existe (no cuando choca el id). La fase 2 las actualiza de forma explícita.

#### Fase 1: refactor mínimo de `App.tsx`

##### 4. `hooks/useGames.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Reúne la carga inicial (`initGames`), la lista, `activeGameId`, selección, creación, renombrado, borrado y Deshacer, y asume `persistGame`, `saveStatus`, `pendingWrites`, `failedGames`, el reintento de exportación, `handleImportGames`, el respaldo `createGame('Partida 1')` y el incremento de `uses`. Devuelve `{ games, activeGame, updateActive, select, create, rename, remove, undoRemove, refresh }`. La partida activa es un valor derivado; desaparecen `board`, `boardRack`, `boardBlanks` y `skipSaveRef`. Sin cambio de comportamiento.

##### 5. `hooks/useToast.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: `show(message, { action?, durationMs?, persistent? })`. Conserva los 3 s de los avisos normales y los 9 s del aviso con acción.

##### 6. `components/BoardPanel.tsx`, `components/GameSwitcher.tsx`, `components/Toast.tsx`, `App.tsx` (Modify)

*   **Type / Scope**: Contrato de props nuevo.
*   **Proposed Changes**: `BoardPanel` recibe `activeGame` y `onChange(patch)` en lugar de los tres setters y `onClear`. `GameSwitcher` y `Toast` se adaptan a `useGames` y `useToast`. `App.tsx` usa ambos hooks; el resto (worker, mantenimiento) no se toca. Las pruebas de la fase 0 y `npm test` siguen pasando. Comprobación manual en el navegador: crear, abrir, renombrar, borrar y deshacer una partida.

#### Fase 2b: puerta de `ifMatch`

##### 7. `scripts/blob-race.mjs` (Create), `.gitignore` (Modify), `package.json` y `package-lock.json` (Modify)

*   **Type / Scope**: Herramienta de desarrollo, fuera del bundle.
*   **Proposed Changes**: Contra un almacén Blob privado de pruebas (lo crea el autor; ver Open Questions) con `BLOB_READ_WRITE_TOKEN` en `.env.local` (ya ignorado por `*.local`). Obtiene el ETag con `head()`. Comprueba que: la creación sin `allowOverwrite` falla si el Blob ya existe; de dos `put` simultáneos con el mismo ETag exactamente uno recibe `BlobPreconditionFailedError`; tras escribir, `get` con `useCache: false` devuelve el ETag nuevo. `.gitignore`: `.env*`, `!.env.example` y `.vercel`. `@vercel/blob` se instala como `devDependency` con `npm install --save-exact`.
*   **Puerta**: se detiene el diseño si ninguna de las dos subidas simultáneas recibe el error, o si las dos lo reciben. Si la creación sin `allowOverwrite` no falla, no se detiene: se anota el resultado y la primera sincronización se apoya en el reintento del ciclo. El resultado se anota en Open Questions antes de pasar a la fase 3.

#### Fase 2: almacenamiento local y fusión

##### 8. `services/sync/diagnostics.ts` (Create)

*   **Type / Scope**: Registro local acotado.
*   **Proposed Changes**: Memoria más copia en `localStorage` bajo `anagrama.diagnostics.v1`. Entrada `{ at, source, message }`, últimos 50. API: registrar, leer, vaciar y volcar a texto. Si escribir falla (por ejemplo, cuota llena) se ignora sin lanzar.

##### 9. `services/gamesStore.ts` (Modify)

*   **Type / Scope**: Modelo de datos y persistencia.
*   **Proposed Changes**:
    *   `Game` gana `rev`, `syncedRev`, `editedBy` y `deletedAt`, opcionales; `isValidGame` los valida solo si existen (enteros no negativos; `deletedAt` número finito).
    *   `saveGame(game, origin)` con `origin ∈ {edit, usage, remote, copy}` **obligatorio**. `edit`: en una transacción `readwrite` lee la `rev` guardada y escribe `rev = (guardada.rev ?? 1) + 1`, `updatedAt`, `editedBy` y `lastUsedAt`. `usage`: lee el registro guardado y mezcla solo `uses` y `lastUsedAt`. `remote`: guarda tal cual y fija `syncedRev = rev`; si el `rev` remoto es menor que el `syncedRev` local, conserva lo local, pone `syncedRev = 0`. `copy`: `rev = 1`, `syncedRev = 0`, sin sumar. Devuelve `{ notice?: string }`.
    *   Helper `txReadWrite` (lectura, cálculo y escritura en una transacción). En la ruta `localStorage` la lectura-modificación-escritura no tiene `await` entre medias.
    *   `deleteGame(id)` sube `rev` y escribe `deletedAt` en lugar de borrar. Función interna `listAllGames()` (con lápidas) que usan `snapshot`, `saveGame` y `deleteGame` en la ruta de respaldo; `listGames()` filtra y `listDeletedGames()` devuelve las lápidas. Restaurar quita la lápida con un guardado `edit`.
    *   `purgeDeleted(now)`: con la sincronización desactivada, `useGames` lo llama al arrancar (lápidas de más de 30 días, reloj local). Con la sincronización activa, el motor lo llama en cada ciclo, tras leer el remoto y antes de fusionar, con los ids de las lápidas ya subidas (`syncedRev > 0`) que el servidor ya no tiene (`purgeDeleted(now, ids)`); con un `404` no purga.
    *   `deviceId` en `localStorage` (`anagrama.deviceId.v1`).
    *   `initGames({ createDefault })` lee `firstSyncPending` de `anagrama.sync.v1` y no crea "Partida 1" mientras esté pendiente y no haya partidas; tras la primera sincronización `refresh()` y, si sigue sin haber partidas, se crea "Partida 1". `createGame` fija `rev = 1`.
    *   Regla de errores: en rutas de escritura (`saveGame`, `deleteGame`, `writeFallback`) se registra en `diagnostics.ts` y se relanza (se mantienen la prueba de `tests/persistence.mjs:49-52` y el aviso de error de `App.tsx`); en rutas de lectura (`JSON.parse`, `getItem`) se registra y se devuelve el valor por defecto.

##### 10. `hooks/useGames.ts`, `App.tsx` (Modify)

*   **Type / Scope**: Adaptar la fase 1 al modelo nuevo.
*   **Proposed Changes**: `updateActive` pasa el origen `edit`, `select` pasa `usage`, y `useGames` llama a `purgeDeleted` y a `initGames({ createDefault })`. Ningún llamador usa `saveGame` sin origen: `persistGame` y `restoreBackup` usan `edit`; `runInit` usa `edit` solo para la partida que crea.

##### 11. `services/sync/syncMerge.ts` (Create)

*   **Type / Scope**: Función pura y síncrona, sin red, sin almacenamiento y sin `crypto.subtle`.
*   **Proposed Changes**: `merge(local, remote)` devuelve `{ toLocal, toRemote, conflicts, notices }`. Reglas de la especificación: solo en un lado (con la excepción `syncedRev > 0` ausente en remoto sin lápida: se conserva y se vuelve a subir); cambios en un solo lado; partida nunca sincronizada con contenido distinto; choque por `rev` más alta (empate por `editedBy` menor; con `rev` igual y contenido distinto, incluida lápida frente a no lápida, se aplica el mismo desempate) con copia "(conflicto)" de id `<id>-conflicto-<rev perdedora>-<editedBy perdedora>` y `editedBy` de la perdedora, sin repetir el sufijo; borrado frente a edición: gana el lado con `rev > syncedRev` y se restaura con `rev = max(rev de ambos) + 1`, en otro caso gana la lápida; remoto con `rev` menor que `syncedRev`; `404` como remoto vacío. "Contenido distinto" = `name`, `board`, `rack` o `blanks` distintos. Un `rev` ausente se lee como 1. No usa relojes ni purga lápidas. Todo dato remoto pasa por `isValidGame` y los inválidos se descartan con un aviso.

##### 12. `services/backup.ts` (Modify)

*   **Type / Scope**: Copia de seguridad.
*   **Proposed Changes**: `buildBackup` omite las partidas con lápida y los campos locales de sincronización (`syncedRev`, `lastUsedAt`, `rev`, `editedBy`) y conserva `uses`. `restoreBackup` conserva su lógica ("(importada)" cuando el nombre entrante ya existe); las partidas que añade se guardan con origen `edit`.

##### 13. `tests/sync.mjs` (Create o Modify), `tests/persistence.mjs` (Modify), `package.json` (Modify)

*   **Type / Scope**: Pruebas en Node con almacenes en memoria, con el patrón de bundle con esbuild de `tests/persistence.mjs`.
*   **Proposed Changes**: `tests/sync.mjs` cubre cada caso de `syncMerge`: un solo lado; ausente en remoto con `syncedRev > 0`; cambio en un lado; nunca sincronizada con contenido igual y distinto; choque con `rev` distinta e igual; id de la copia y no repetir el sufijo; borrado frente a edición (CUJ 9) con ediciones asimétricas (el ordenador edita 3 veces y borra, el móvil edita una vez) y convergencia de ambos aparatos tras restaurar; `rev` igual con contenido distinto; remoto con `rev` menor que `syncedRev`; `404` como remoto vacío; remoto inválido; registros antiguos sin campos nuevos; idempotencia; dos réplicas con reloj desfasado dan el mismo ganador. `tests/persistence.mjs` actualiza las expectativas de la fase 0 y comprueba la purga de lápidas con la lista del remoto. `package.json`: `node tests/sync.mjs` en el script `test`.

#### Fase 3: servidor y motor

##### 14. `api/sync.ts`, `services/sync/constants.ts` (Create)

*   **Type / Scope**: Función serverless de Vercel (TypeScript) y constantes compartidas.
*   **Proposed Changes**: Autenticación: bearer comparado en tiempo constante con `SYNC_TOKEN`; sin coincidencia, `401` sin cuerpo. `GET`: `get('anagrama-sync.json', { access: 'private', useCache: false })`; `404` si no existe; `200` con el JSON y `ETag`; admite `If-None-Match` y responde `304`. `PUT`: `200` con cabecera `ETag` y cuerpo `{ "etag": ... }`; `If-Match` con el ETag tal como lo devolvió el servidor; sin `If-Match` con Blob existente, o con `If-Match` sin Blob, responde `412`; otros métodos, `405`. Valida de forma superficial (objeto con partidas que tienen `id` texto y `rev` número) y `schemaVersion` igual a 1: si no, `400` con `{ error: 'schema' | 'body' }`. El límite de 1 MB se comprueba con `content-length` y con la longitud real del cuerpo (`413`). Copia el documento actual a `anagrama-sync.prev.json` (si esa copia falla, el `PUT` sigue). Purga las lápidas de más de 30 días con la hora del servidor, escribe con `allowOverwrite: true`, `addRandomSuffix: false` e `ifMatch`; `BlobPreconditionFailedError` (o el fallo de creación por existencia) responde `412`. `Cache-Control: no-store`; no registra el contenido. `constants.ts`: los 30 días de lápida, etiquetados "provisional", importados por cliente y servidor. `tsconfig.json` no tiene `include`, así que `api/` ya entra en `typecheck`; solo hay que mantener `types: ["node"]`.

##### 15. `services/sync/syncTransport.ts` (Create)

*   **Type / Scope**: Interfaz y cliente HTTP.
*   **Proposed Changes**: `SyncTransport` con `pull(etag?)` y `push(doc, etag?)`. `pull` devuelve `{ status: 'notModified' }` ante `304`. `HttpSyncTransport(token)` usa `fetch('/api/sync')` y devuelve errores tipados: no autorizado (`401`), sin red, error del servidor, demasiado grande (`413`) y esquema no válido (`400` con `error: 'schema'`; solo ese muestra "Actualiza la app").

##### 16. `services/sync/syncEngine.ts` (Create)

*   **Type / Scope**: Motor de sincronización con dependencias inyectables `{ storage, now, setTimeout, events, transport, games }`.
*   **Proposed Changes**: Estados `disabled | syncing | upToDate | offline | tokenRejected | error`. Ciclo de un solo vuelo: un disparador durante un ciclo marca "repetir"; el temporizador de 2 s se reinicia con cada edición. Disparadores: arranque, `visibilitychange` a visible, `online` y 2 s tras una edición local; sin sondeo ni envío al cerrar la página. Ciclo: `pull` → `merge` → aplicar a local con origen `remote` → `push` si hay pendientes con `If-Match`; tras un `push` correcto fija `syncedRev` al `rev` enviado y guarda el ETag; tras leer el remoto y antes de fusionar purga las lápidas ya subidas que el servidor ya no tiene. Un `412` repite el ciclo (máximo 3 seguidos; luego `error`); `413` y `400` pasan a `error` con código; fallo de red o servidor deja `offline` o `error` hasta el siguiente disparador. Primera sincronización: una sola copia previa en `anagrama.preSyncBackup.v1` con `buildBackup()`; si falla por `QuotaExceeded` no empieza y pide exportar una copia manual. Persiste en `anagrama.sync.v1`: token, interruptor, `firstSyncPending`, ETag, `lastSyncedAt` y último error; `deviceId` se conserva al desactivar. Sin modo `pushOnly`.

##### 17. `tests/sync.mjs` (Modify)

*   **Type / Scope**: Pruebas del motor con transporte falso y fuente de eventos inyectable.
*   **Proposed Changes**: Ciclo completo con dos réplicas y un servidor simulado con ETag; edición durante un `push` en vuelo (queda pendiente); disparador durante un ciclo (se repite una vez); tres `412` seguidos a `error`; primera sincronización con datos en ambos lados (CUJ 5); `404` tras haber sincronizado; `401` a `tokenRejected`; `413` y `400` con el aviso correcto; `visibilitychange` y `online` disparan un ciclo; purga de lápidas locales que el servidor ya no tiene, sin volver a subirlas; los seis estados se nombran en las aserciones. El contrato HTTP de `api/sync.ts` se comprueba en `tests/api.mjs` con un Blob simulado en memoria y, con el almacén real, en la integración con `vercel dev`.

##### 18. `.env.example` (Create), `package.json` y `package-lock.json` (Modify)

*   **Type / Scope**: Configuración.
*   **Proposed Changes**: `.env.example` documenta `SYNC_TOKEN` y `BLOB_READ_WRITE_TOKEN`. Instalar con `npm install --save-exact`: `@vercel/blob` (dependencia de `api/sync.ts`) y `@vercel/node` (tipos, `devDependency`); versiones en `package.json` y `package-lock.json`.

#### Fase 4: interfaz de sincronización

##### 19. `hooks/useSync.ts` (Create)

*   **Type / Scope**: Hook de React.
*   **Proposed Changes**: Expone el estado del motor, `enable(token)`, `disable()` (borra token y metadatos, no las partidas), `syncNow()` y los pendientes. Tras aplicar cambios remotos llama a `useGames.refresh()` y dispara `onRemoteAdopted` cuando cambia la partida activa sin pendientes. `onRemoteAdopted` se crea aquí.

##### 20. `components/SyncStatusChip.tsx`, `components/SyncPanel.tsx`, `components/SyncErrorBanner.tsx` (Create)

*   **Type / Scope**: Componentes.
*   **Proposed Changes**: El chip muestra "Guardado en este aparato" y el estado con los textos de la lista única de los Goals. `SyncPanel` es siempre un diálogo (`Overlay`): campo del token, interruptor, "Sincronizar ahora", última sincronización, pendientes, último error, petición de almacenamiento persistente (`navigator.storage.persist()`, con aviso si no se concede) y una sección "Diagnóstico" (últimos 50 errores, última sincronización, pendientes y "Copiar diagnóstico"). `SyncErrorBanner` es la franja persistente con "Reintentar". Subsección "Procedimiento de activación" en la fase 5.

##### 21. `components/GameSwitcher.tsx` (Modify)

*   **Type / Scope**: Lista de partidas.
*   **Proposed Changes**: Aloja el chip. Añade "Eliminadas recientemente" (`listDeletedGames()` con "Restaurar" y días restantes). El diálogo de borrar avisa de que también se borrará en los demás aparatos si la sincronización está activa. Crea el menú "Copia de seguridad" con "Exportar copia" y "Restaurar copia" (renombra el "Importar" actual; la copia JSON queda siempre disponible) y muestra el resumen completo de restaurar, incluidas las partidas renombradas.

##### 22. `components/Toast.tsx` (Modify)

*   **Type / Scope**: Avisos.
*   **Proposed Changes**: Ya tiene `role="status"` y `action`; se añade `role="alert"` para errores y un modo persistente.

##### 23. `App.tsx` (Modify)

*   **Type / Scope**: Componente raíz.
*   **Proposed Changes**: Sustituye el "Guardado" suelto por el chip, monta `useSync`, `SyncErrorBanner` y el diálogo. El pie dice "Solo en este aparato" cuando el estado es `disabled` y "Sincronizado" en los demás.

##### 24. `services/wordBlocklist.ts`, `services/wordCandidates.ts` (Modify)

*   **Type / Scope**: Almacenamiento de listas.
*   **Proposed Changes**: Reemplazar los `catch {}` por registro en `diagnostics.ts` (lectura: registrar y devolver el valor por defecto). No cambia el formato y estas listas no se sincronizan.

#### Fase 5: documentación y activación

##### 25. `README.md`, `services/README.md`, `components/README.md`, `public/services/README.md`, `tests/README.md`, `data/README.md` (Modify)

*   **Type / Scope**: Documentación única de las fases 1 a 6.
*   **Proposed Changes**: Quitar la afirmación de que no hay red. Explicar el modo local y el sincronizado, qué se sincroniza y qué es local (tabla del modelo de datos, con `lastUsedAt` como campo solo local), cómo crear el almacén Blob privado y definir `SYNC_TOKEN`, que la sincronización viene apagada por defecto, los componentes y hooks nuevos, las pruebas nuevas y la URL definitiva de producción.

**Procedimiento de activación** (subsección, no es un archivo). Con la fase 6 entregada: activar en el ordenador, revisar el documento remoto y activar después en el móvil. La marcha atrás es apagar el interruptor.

#### Fase 6: sin conexión

##### 26. `index.html` (Modify)

*   **Type / Scope**: Documento base.
*   **Proposed Changes**: Quitar `<script src="https://cdn.tailwindcss.com">`, el bloque `tailwind.config`, los enlaces a cdnjs y a Google Fonts (con sus `preconnect`) y el `importmap` a `aistudiocdn.com`. No añadir `<link rel="manifest">`: lo inyecta el plugin.

##### 27. `tailwind.config.js`, `postcss.config.js` (Create), `index.css`, `index.tsx`, `package.json` y `package-lock.json` (Modify)

*   **Type / Scope**: Estilos y dependencias.
*   **Proposed Changes**: Trasladar la configuración inline completa de `index.html:15-66` a `tailwind.config.js` (Tailwind 3.4.x con PostCSS y autoprefixer): colores `ink`, `accent`, `aqua`, `brand-text` y `brand-subtle`, `fontFamily`, `borderRadius.4xl`, `animation` (`fade-in`, `rise`, `pop`, `float`) y `keyframes`. `content`: `./index.html`, `./*.{ts,tsx}` y `./components|hooks|services/**/*.{ts,tsx}`. `index.css` añade las directivas `@tailwind`. `index.tsx` importa `@fontsource/inter` (400-800), `@fontsource/jetbrains-mono` (500, 700) y `@fortawesome/fontawesome-free/css/all.min.css`. Instalar con `--save-exact`: `tailwindcss`, `postcss` y `autoprefixer` en `devDependencies`; `@fontsource/*` y `@fortawesome/fontawesome-free` en `dependencies`. Criterio de las capturas: el autor valida sin diferencias visibles las pantallas de los CUJ 6 y 7.

##### 28. `vite.config.ts`, `index.tsx`, `App.tsx`, `tsconfig.json` (Modify), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `components/UpdateBanner.tsx` (Create)

*   **Type / Scope**: PWA.
*   **Proposed Changes**: `vite-plugin-pwa` (`devDependency`, `--save-exact`) con `registerType: 'prompt'` y manifest (`name`, `short_name`, `start_url`, `scope`, `display: standalone`, `background_color`, `theme_color #080b14`, `lang`, iconos). `globPatterns`: `**/*.{js,css,html,woff2,svg,png}`; `additionalManifestEntries` añade `/services/anagramSolver.ts`. Regla `CacheFirst` para la URL `/services/dictionary.txt`, de modo que la instalación no espera 7,7 MB; esta descarga aparte es provisional (ver Open Questions). `/api/*` va a `NetworkOnly` y queda fuera del fallback SPA. `index.tsx` registra el service worker con `registerSW` de `virtual:pwa-register`; `App.tsx` monta `UpdateBanner` ("Hay una versión nueva · Recargar"; nunca recarga a mitad de partida). `tsconfig.json` añade `vite-plugin-pwa/client` a `types`. Los tres iconos usan la inicial "A" sobre `#080b14`: el autor aporta el arte o se genera con una herramienta externa, sin dependencia nueva. "Worker" significa siempre `anagramSolver.ts` (Web Worker); el service worker se nombra así.

##### 29. `App.tsx` (Modify)

*   **Type / Scope**: Estado del diccionario y medición.
*   **Proposed Changes**: Estado visible "disponible sin conexión" cuando `caches.match` confirma el diccionario; si se abre sin red antes de terminar la descarga, mensaje "necesita red la primera vez" con "Reintentar". `performance.mark/measure` alrededor de la descarga, la construcción del DAWG y `solveBoard`. No cambia la carga del diccionario en memoria.

#### Fase 7: diferida (intención provisional)

No se implementa hasta completar la lista siguiente, tras leer `BoardPanel`, `ScrabbleBoard`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast` y `boardImage`, y tener pruebas para `useBoardHistory`. Decisiones pendientes: tecla de cambio de dirección; estado de un paso de deshacer; detección de Mac (`navigator.platform` solo para elegir entre Ctrl y ⌘ en el aviso del ⌘V); barra lateral; `/` y Alt+N; aviso de nombre duplicado; qué estados de captura llevan forma o texto. El contenedor `max-w-6xl` está en `App.tsx:512`, no en `BoardPanel.tsx`. Se entrega después de la fase 4.

##### 30. `components/GameSwitcher.tsx` (Modify)

*   **Type / Scope**: Lista de partidas.
*   **Proposed Changes**: La zona principal de cada fila pasa a `<button>` y las acciones a botones hermanos de al menos 44 px, visibles según `(hover: hover)`/`(pointer: coarse)`. Botón visible de renombrar; F2 renombra y Supr abre la confirmación. Hora de la última edición visible en móvil. Aviso de nombre duplicado al renombrar y al recortar a 40 caracteres (`GameSwitcher.tsx:81`).

##### 31. `components/Tabs.tsx` (Create), `App.tsx` (Modify)

*   **Type / Scope**: Componente accesible.
*   **Proposed Changes**: `role="tablist"`, `tab`, `tabpanel`, `aria-selected` y flechas, en lugar de los botones sueltos.

##### 32. `components/ScrabbleBoard.tsx` (Modify)

*   **Type / Scope**: Tablero.
*   **Proposed Changes**: Entrada por `beforeinput`/`input` en lugar de `onKeyDown` en el input oculto, y `visualViewport` para mantener visible la casilla activa. Tab sale del tablero; `Escape` suelta el foco; región `aria-live` con fila, columna y dirección. Casillas memoizadas (`Cell`) y `touch-action: manipulation`.

##### 33. `hooks/useBoardHistory.ts` (Create), `components/BoardPanel.tsx` (Modify)

*   **Type / Scope**: Deshacer y diseño.
*   **Proposed Changes**: Pila en memoria de 50 pasos por partida activa, vaciada al cambiar de partida y al recibir `onRemoteAdopted` (creado en la fase 4). "Vaciar tablero" entra en la pila. Botones de deshacer y rehacer. En móvil "Mejor jugada" fija abajo. A partir de 1280 px, el contenedor de `App.tsx:512` pasa a `max-w-7xl` y la lista de partidas se pliega como barra lateral. Pruebas de `useBoardHistory` en Node.

##### 34. `hooks/useHotkeys.ts`, `components/HotkeysHelp.tsx` (Create), `App.tsx` (Modify)

*   **Type / Scope**: Atajos.
*   **Proposed Changes**: Hook único que ignora campos de texto; el input oculto del tablero cuenta como campo de texto salvo para Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z. Ctrl/Cmd+Enter, `/`, Alt+N, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z y `?` (ayuda).

##### 35. `components/ScreenshotImport.tsx`, `components/Overlay.tsx` (Modify)

*   **Type / Scope**: Importar captura y diálogos.
*   **Proposed Changes**: "Aplicar a la partida" muestra la partida destino, avisa si tiene fichas, ofrece "aplicar aquí" o "nueva partida"; el Deshacer usa `useBoardHistory` (instantánea antes de aplicar) y el aviso de `useToast` solo ofrece la acción. Cerrar con correcciones sin aplicar pide confirmación; "Reajustar" conserva las correcciones. En móvil, pistas propias del aparato y botones en pantalla para vaciar una casilla y poner un comodín. Estados dudoso/ok/error con forma o texto además del color y textos de 11 px con contraste de al menos 4,5:1. `Overlay`: `role="dialog"`, `aria-modal`, foco inicial, trampa de foco y retorno de foco.

##### 36. `components/BoardPanel.tsx` (Modify)

*   **Type / Scope**: Textos y mantenimiento.
*   **Proposed Changes**: "Leer captura" (`BoardPanel.tsx:155`) pasa a "Leer tablero desde captura". Vocabulario único (partida, detectadas). La interfaz de Mantenimiento del diccionario, que vive en `BoardPanel.tsx`, se pliega como opción avanzada.

### Verification Plan

*   **Compilación/Build**: `npm run build` en cada fase. En la fase 6, `dist/` no referencia `cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com` ni `aistudiocdn.com`, y no quedan `preconnect` a ellos.
*   **Pruebas unitarias**: `npm test` (incluye `tests/sync.mjs` y la `tests/persistence.mjs` actualizada). Las cifras de `tests/regresion.mjs` son las del `npm test` actual y no deben cambiar. Pruebas de `useBoardHistory` en la fase 7.
*   **Análisis estático**: `npm run typecheck`.
*   **Casos requeridos** (sin herramienta de cobertura): los de `syncMerge` listados en el archivo 13 y los del motor del archivo 17.
*   **Prueba previa (fase 2b)**: `scripts/blob-race.mjs` contra un almacén Blob de pruebas. Esperado: exactamente una de las dos subidas simultáneas recibe `BlobPreconditionFailedError`, y tras escribir, `get` con `useCache: false` devuelve el ETag nuevo; además se anota el resultado de la creación sin `allowOverwrite`. Es una puerta: sin este resultado no se construye la fase 3.
*   **Integración con el servidor**: `vercel dev` con el almacén de pruebas y un `SYNC_TOKEN` de prueba. Comprobar `401` sin token, `404` sin documento, creación, `412` con ETag viejo y sin `If-Match`, `405`, `413` con más de 1 MB, `400` con otro `schemaVersion`, `304` con `If-None-Match`, `anagrama-sync.prev.json` tras un `PUT` y la purga de lápidas de más de 30 días.
*   **Atomicidad de `rev` entre pestañas**: con la app abierta en dos pestañas del mismo navegador, editar la misma partida en ambas e inspeccionar `rev` en la pestaña Application de las herramientas del navegador; no deben repetirse. La transacción de IndexedDB no se simula en Node; las pruebas de Node cubren la ruta `localStorage`.
*   **Dos aparatos reales (móvil y ordenador)**: los CUJ 1 a 5 y 9, incluida la primera sincronización con datos en ambos lados (CUJ 5), el choque con copia "(conflicto)" (CUJ 3) y la edición sin conexión frente a un borrado (CUJ 9).
*   **Sin conexión** (fase 6): instalar la app, cortar la red y abrir; editar tres partidas y recuperar la red. Verificar "Sin red · 3 pendientes" y la puesta al día. Medir el arranque en frío del diccionario en el móvil del autor (umbral 5 s); si lo supera, se reabre la decisión de carga como tarea aparte.
*   **Fase 7** (diferida), en un solo aparato: CUJ 6 a 8; entrada de letras con el teclado de iOS en el iPhone del autor, con la casilla activa visible; recorrido solo con teclado (Tab sale del tablero en una pulsación); contraste de los textos de 11 px con una herramienta.
*   **Verificación en navegador** (pestaña de la app en local, sin errores en la consola del navegador, incluida Safari de iOS): lista de partidas, diálogo de nombre, chip de estado, papelera, Diagnóstico y atajos.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
