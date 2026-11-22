# Mejoras de Anagrama: sincronización entre dispositivos, diseño y uso en móvil y ordenador

* **Autor:** psforeroluis
* **Fecha:** 2026-11-22

## Overview

Anagrama es una app personal, de un solo usuario, que se usa en móvil y en ordenador. Hoy todo se guarda en el navegador de cada aparato (IndexedDB, con localStorage de respaldo). Para pasar una partida de un aparato a otro hay que exportar un JSON e importarlo a mano.

Esa es la queja principal. Se permite añadir una cuenta o sesión personal y un servicio en la nube. La única condición es que el núcleo (anagramas y jugadas de tablero) siga funcionando como hoy. Además se quieren mejoras de diseño y de uso, tanto para pantalla táctil como para teclado y pantalla grande.

Éxito: seguir la misma partida en los dos aparatos sin pasos manuales, y usar la app con una mano en el móvil sin pelearse con el teclado ni con los botones pequeños.

## Analysis

Siete revisores independientes leyeron el código. Ninguno leyó todos los ficheros. Quedaron sin leer a fondo `BoardPanel.tsx`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast`, `wordCandidates.ts`, `boardImage.ts`, `glyphs.ts` y partes de `index.css` y `anagramSolver.ts`. Lo que depende de ellos figura como "no verificado".

### Sincronización: hechos del código que la condicionan

* `saveGame` pone `updatedAt = Date.now()` en cada guardado (`gamesStore.ts:132`). Si se usa para aplicar datos remotos, cada aparato "gana" siempre y se crean bucles.
* Cada edición y cada apertura de partida suman `uses` y cambian `updatedAt`, sin espera (`App.tsx:340-366`).
* `deleteGame` borra de verdad, sin marca de borrado. El Deshacer de 9 s reinserta el objeto viejo.
* `restoreBackup` crea una copia "(importada)" si el id existe con contenido distinto (`backup.ts:98-109`). Con sincronización automática duplicaría partidas.
* Las palabras vetadas y las candidatas son listas de texto sin fecha ni id. Las plantillas de letras viven en otra base de datos. La partida activa y el recorte de captura son locales a cada aparato.
* Una partida pesa menos de 1 KB. El coste de nube es despreciable. El riesgo es la corrección: conflictos, borrados y relojes desajustados.

### Modelo recomendado (consenso de los siete revisores)

* **Local primero.** La escritura local inmediata se queda. La nube es una cola de salida en segundo plano (espera de 1-2 s, envío al ocultar la pestaña, lectura al arrancar y al recuperar red). Sin sesión o sin red todo funciona como hoy.
* **Dos rutas de escritura.** La edición local sube un número de revisión y se marca pendiente. Aplicar datos remotos no toca `updatedAt` ni marca pendiente. Todo dato remoto pasa por `isValidGame`.
* **Conflictos por revisión, no por reloj.** Gana una versión por partida y la perdedora se conserva como "Nombre (conflicto)". Nunca se sobrescribe en silencio.
* **Lápidas de borrado** (`deletedAt`), purgadas a unos 30 días. Deshacer pasa a quitar la lápida.
* **`uses` y el orden por uso son datos locales por aparato.** Abrir una partida no genera escritura remota.
* **Primer sync:** si el servidor está vacío, se sube todo. Si hay datos en ambos lados, se unen por id sin borrar nada local. No se crea "Partida 1" hasta terminar el primer sync. Antes se hace una copia automática con `buildBackup()`.
* **Exportar/Importar JSON se conserva** como copia de seguridad y salida de emergencia. Restaurar una copia pasa por la misma función de fusión que el sync.
* Una sola función pura de fusión (por ejemplo `services/syncMerge.ts`), probada en Node en `tests/persistence.mjs`.

### Backend y cuenta (decisión pendiente; los revisores difieren)

* **Más simple:** una función serverless `GET/PUT /sync` con almacén clave-valor (Cloudflare KV o Vercel KV/Blob) y un token personal pegado una vez en cada aparato. Sin registro. El contenido sería el JSON de `buildBackup()`.
* **Gestionado:** Supabase, Firebase o Appwrite, con enlace mágico o passkey y seguridad por usuario. Menos código propio, más dependencia.
* **Con cifrado de extremo a extremo y emparejamiento por QR:** más privado, pero perder la clave pierde los datos.
* **Descartadas:** CRDT (Yjs/Automerge), por sobredimensionado, y carpeta de nube (Drive/iCloud), por frágil en iOS y sin sync automático.
* Cualquiera que se elija va detrás de una interfaz (`SyncTransport` con `pull(since)` y `push(changes)`) en `services/sync/`, para poder cambiar de proveedor. Sin claves de escritura de servicio en el cliente. El proyecto ya está en Vercel, así que conviene fijar el origen (IndexedDB es por origen).

### Alcance del sync (decisión pendiente)

* **Fase 1:** solo partidas.
* **Fase 2:** palabras vetadas, candidatas y plantillas. Las vetadas cambian los resultados de `solveBoard` y las plantillas evitan el "Primera vez" en el segundo aparato. Exigen modelo por elemento con fecha y lápida, o las palabras eliminadas reaparecen.

### Prerrequisitos de código

* **`App.tsx`** (626 líneas, unos 25 `useState`) mezcla worker, búsqueda, partidas, mantenimiento del diccionario y avisos. `board`, `boardRack` y `boardBlanks` duplican el estado de la partida activa y se reponen a mano en cinco sitios con `skipSaveRef`, que es frágil. Un cambio remoto sobre la partida abierta causaría ecos o ediciones perdidas. Antes de sincronizar hay que separar hooks (`useSolverWorker`, `useGames`, `useDictionaryMaintenance`, `useToast`).
* **Almacenamiento disperso** en cinco módulos con backends distintos. Hace falta un único puerto asíncrono (`Repository`).
* **Versionado:** tres versiones independientes (DB, claves `.v1`, copia) y ninguna para el esquema remoto. Campos nuevos siempre opcionales, como `uses`. Evitar subir `DB_VERSION` si se puede.
* **Varias pestañas** del mismo aparato: `BroadcastChannel` y Web Locks para una sola pestaña que sincroniza.
* **Estado de sync separado de "Guardado".** Hoy "Guardado" significa "en este aparato". Con sync el usuario creería que ya está en el otro.
* **Errores tragados** con `catch {}` en varios sitios: un fallo de sync sería invisible.

### Sin conexión, PWA y rendimiento

* `index.html` depende de la red al ejecutarse: Tailwind desde CDN (compila en el navegador), Font Awesome, Google Fonts y un `importmap` a `aistudiocdn.com`. Para funcionar sin conexión hay que pasar a Tailwind en el build y servir fuentes e iconos en local. El README ("no requiere servicios externos") deja de ser cierto.
* No hay manifest ni service worker. Añadir ambos, con precaché del diccionario, y avisar cuando haya versión nueva en vez de recargar a mitad de partida.
* `dictionary.txt` (688.255 líneas) se descarga en cada arranque y el worker reconstruye el DAWG cada vez. Medir en un móvil de gama media antes de optimizar.
* Fondos con desenfoque grande y animados: posible gasto de batería (sospecha, sin medir). El tablero tiene 225 botones sin `React.memo`.

### Diseño: móvil y escritorio

* **Botones táctiles pequeños:** renombrar y eliminar miden 28×28 px; Exportar/Importar, 12 px. Desde 640 px los botones de fila solo aparecen al pasar el ratón, invisibles en tabletas. Usar `(hover: hover)` y `(pointer: coarse)`, mínimo 44 px.
* **Renombrar solo con doble clic** no existe en táctil, y el texto de ayuda lo anuncia también en móvil. Falta botón visible o pulsación larga, y F2/Supr en teclado.
* **Entrada en el tablero móvil:** un input oculto de 1 px con `onKeyDown`. El teclado virtual tapa el tablero y los teclados Android pueden enviar "Unidentified" (no verificado). Opciones: `beforeinput`, `visualViewport`, o teclado propio. Las celdas miden unos 19-22 px en pantallas de 360 px.
* **Sin deshacer en el tablero.** "Vaciar tablero" no se recupera.
* **Escritorio:** `max-w-6xl`, lista de partidas con scroll anidado de 240 px. Cabe una barra lateral colapsable y jugadas fijas. En móvil, "Mejor jugada" fijo abajo, en la zona del pulgar.
* **El orden por uso mueve las filas mientras se juega.** En móvil se oculta la hora, justo el dato que ayuda a saber qué partida es la más reciente entre aparatos.

### Accesibilidad y teclado

* Las filas de partida son `div` con `onClick`, sin rol ni foco por teclado.
* Trampa de teclado en el tablero: Tab y Enter cambian la dirección en lugar de salir.
* Las pestañas no tienen `tablist`/`tab`/`aria-selected`.
* Contraste probablemente bajo en textos de 11 px (estimado, no medido). Estados de captura solo por color.
* Atajos de teclado inexistentes fuera del tablero. Propuesta: Ctrl/Cmd+Enter buscar, `/` buscar partida, Alt+N nueva partida, Ctrl+Z deshacer, `?` ayuda.

### Importar captura

* "Aplicar a la partida" sustituye el tablero activo sin decir cuál es ni avisar si tiene contenido, y sin Deshacer.
* Cerrar con X o Escape descarta decenas de correcciones sin confirmar; "Reajustar" las pierde.
* En móvil el paso 1 habla de "arrastra / Ctrl+V" (inexistente en móvil; en Mac es ⌘V). Faltan botones en pantalla para vaciar o poner comodín.
* Las plantillas aprendidas son locales: en el segundo aparato vuelve "Primera vez".

### Textos y coherencia

* Pie de `App.tsx` ("se guardan en este dispositivo") y los READMEs ("no hay red") serán falsos con sync. Hace falta un texto honesto: "Sincronizado con tu cuenta" o "Solo en este dispositivo", y decir qué se sube.
* El diálogo de borrar debe decir si se borra en los otros aparatos, y debe haber "Eliminadas recientemente" más allá de los 9 s.
* El toast de importar no informa de partidas renombradas u omitidas, aunque el dato existe (`summary.gamesRenamed`).
* Vocabulario mezclado: partida/tablero/juego, candidatas/detectadas/altas, vetada/baja. "Alta/baja" se confundirá con cuenta.
* "Leer captura" y "Importar" son dos importaciones distintas con nombres parecidos.

### Pruebas y diagnóstico

* Pruebas nuevas en Node: dos réplicas con reloj desfasado, borrado en una y edición en otra, importar copia vieja con sync activo, primer sync con datos en ambos lados, registros sin campos nuevos, ida y vuelta con servidor simulado.
* Pantalla "Diagnóstico" con registro local acotado (unos 200 eventos), última sincronización, pendientes y último error. Guardar la versión perdedora antes de sobrescribir.

### Ideal Final Result

Abres la app en cualquiera de los dos aparatos y está la misma partida, sin pasos manuales. Sin red sigue funcionando igual y se pone al día al volver. Nunca se pierde una edición en silencio. En el móvil se puede jugar con una mano.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Sincronización automática de partidas entre móvil y ordenador, local primero.
  * Estado de sync visible y errores que digan qué hacer.
  * Funcionamiento sin conexión real (quitar CDNs, PWA, caché del diccionario).
  * Objetivos táctiles de 44 px, renombrar sin doble clic, entrada del tablero en móvil, filas y pestañas accesibles.
  * Deshacer del tablero y confirmaciones al aplicar o cerrar la importación de captura.
  * Atajos de teclado y mejor aprovechamiento de pantalla grande.
* **Out-of-Scope Non-Goals:**
  * Multijugador, otros idiomas y otros juegos.
  * Cuentas con perfiles, compartir, historial de versiones, edición en tiempo real.
  * CRDT y resolución por celda con interfaz propia.
  * Sincronizar capturas o ficheros binarios.
  * Cambiar el motor de búsqueda de anagramas o jugadas.
  * Reutilizar `restoreBackup` como algoritmo de sync.

## Alternatives Weighed

* **CRDT (Yjs/Automerge):** descartado por sobredimensionado para un usuario con dos aparatos, y porque cambia el modelo de datos.
* **Carpeta de nube (Drive/iCloud):** descartado por frágil en iOS y sin sync automático.
* **Fusión por celda del tablero:** propuesta por un revisor; cuatro de siete prefieren ganador por partida con copia de conflicto. Pendiente de confirmar según si se edita en los dos aparatos a la vez.
* **Cifrado de extremo a extremo con emparejamiento por QR:** pendiente; coste: perder la clave pierde los datos.
* **Sincronizar todo desde el principio (vetadas, candidatas, plantillas):** se propone aplazar a la fase 2 por su complejidad.
* **Sin cambios (seguir con exportar/importar):** es el estado actual y el origen de la queja.

## Key Decisions & Staging for Next Steps

**Decisiones pendientes del autor**

1. ~~Backend y cuenta~~ **Decidido:** token personal con función serverless en Vercel (`GET/PUT /sync`, almacén clave-valor), sin registro. Se rechazan el servicio gestionado y el cifrado con QR por más dependencia o más riesgo de perder datos.
2. ~~Edición simultánea~~ **Decidido:** un aparato activo a la vez. Gana la última versión por partida y la perdedora se conserva como "Nombre (conflicto)". Sin fusión por celdas.
3. ~~Alcance del sync~~ **Decidido:** solo partidas en la fase 1. Vetadas, candidatas y plantillas siguen por copia JSON hasta la fase 2.
4. Plazo de las lápidas (propuesto: 30 días) y origen fijo de la app en Vercel.

**Orden de trabajo propuesto**

0. Cerrar las decisiones de arriba.
1. Consolidar los cambios sin confirmar y fijar el comportamiento actual con pruebas.
2. Refactor sin cambio de comportamiento: hooks de `App.tsx`, estado único de partida activa, puerto de repositorio.
3. Preparación local y reversible: campos opcionales (`rev`, `deviceId`, `deletedAt`, `schemaVersion`), lápidas, función pura de fusión con pruebas.
4. En paralelo, sin depender del sync: quitar CDNs, PWA con caché del diccionario, objetivos táctiles, filas y pestañas accesibles, textos del pie y README.
5. Copia automática previa, interruptor de sync apagado por defecto, cliente detrás de `SyncTransport`, cola persistente, estado de sync en la interfaz.
6. Despliegue por fases: solo subir, luego bidireccional, luego ocultar Exportar/Importar. Rollback: apagar el interruptor; lo local sigue siendo la fuente de verdad.
7. Después: vetadas y plantillas, teclado propio y zoom del tablero, deshacer del tablero, atajos, barra lateral en escritorio, mejoras de captura, Diagnóstico.

**Por verificar antes de convertir en requisito:** tamaño y tiempo de arranque del diccionario en móvil, comportamiento de `e.key` en Android, contraste medido, `aria-live` del toast, foco en `Overlay`, si el build ignora el `importmap`, `touch-action` en el recorte y `share_target` en el aparato del autor.
