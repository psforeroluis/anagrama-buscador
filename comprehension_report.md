# Informe de la etapa 6: prueba de comprensión

**Documento:** `docs/designs/anagrama-sync-y-uso-movil.md`, líneas 1-548 (`FeatureRange` 1-312, `DetailedRange` 313-548).
**Revisor:** `egm-comprehension`. Leyó solo el documento y su persona, sin contexto adicional ni código.

### What this proposes

Propone tres bloques de cambios sobre Anagrama, una app web personal de un solo usuario.

1. **Sincronización de partidas entre móvil y ordenador.** El almacenamiento local (IndexedDB) sigue siendo la fuente de verdad. Una cola en segundo plano envía y recibe un único JSON con todas las partidas, guardado en Vercel Blob a través de una función serverless `api/sync.ts`. La función se protege con un token personal.
2. **Uso sin conexión real.** Se quitan las dependencias de red en tiempo de ejecución (Tailwind, fuentes, Font Awesome y React por CDN) y se añade una PWA instalable con service worker que precachea el diccionario.
3. **Mejoras de uso en móvil y ordenador.** Botones táctiles de al menos 44 px, entrada de letras arreglada en el tablero, accesibilidad por teclado, atajos, deshacer/rehacer e importación de captura sin pérdida de trabajo.

Para fusionar, cada partida lleva un contador `rev`. Si dos aparatos editan la misma partida, gana la `rev` más alta y la otra queda como "Nombre (conflicto)". Los borrados se guardan como lápidas durante 30 días. Se entrega en 8 fases (0 a 7) con interruptor, apagado por defecto.

### How the existing system works, per this document

Hoy todo se guarda en el navegador de cada aparato (IndexedDB, con `localStorage` de respaldo). No hay servidor ni claves. Para pasar una partida a otro aparato hay que exportar e importar un JSON a mano, y no hay forma de saber cuál copia es la más reciente.

`index.html` carga Tailwind, iconos, fuentes y React desde servidores externos, y no hay manifest ni service worker. Sin red, la app puede no arrancar.

`saveGame` pone `updatedAt = Date.now()` en cada guardado y `deleteGame` borra de verdad. `restoreBackup` crea copias "(importada)" cuando hay ids repetidos. `App.tsx` mezcla muchas responsabilidades y duplica el estado de la partida activa con `skipSaveRef`. El motor de búsqueda (Web Worker) no cambia.

### Hallazgos

Los números de línea se refieren al documento de diseño.

**1. Blocker. La fase 7 contradice la dependencia declarada. Líneas 315 y 326.**
La línea 315 dice que las fases 6 y 7 "son independientes entre sí y de la sincronización". La tabla de la línea 326 hace depender la fase 7 de la fase 1. El texto no aclara si la fase 7 puede empezar tras la 0 o necesita la 1, ni qué hace con `useGames` o `App.tsx`, que cambian en la fase 1.

**2. Blocker. "Un aparato activo a la vez" frente a la regla de choque. Líneas 79-83, 121, 172 y 219.**
La decisión del autor es un aparato activo a la vez, pero el CUJ 3 describe ediciones en los dos aparatos y el documento fusiona con reglas completas. No dice qué ocurre con un choque inesperado en la partida abierta con pendientes: las líneas 219 y 421 remiten a "la regla de conflicto de la fusión" sin decir qué ve el usuario ni si la partida abierta se reemplaza o se duplica.

**3. Blocker. "Más revisiones" no coincide con "revisión más reciente". Líneas 83, 121 y 172.**
El CUJ 3 dice "la revisión más reciente", la línea 121 "más revisiones" y la 172 "la `rev` más alta". Si el móvil sin red hizo 5 ediciones y el ordenador 2 después, gana el móvil, que es la edición anterior. El documento no lo afirma ni lo justifica, y el lector puede asumir que gana lo último editado.

**4. Major. Dependencias de fases sin explicar. Líneas 315-326.**
"Las fases 3 a 5 dependen de la 2" es solo transitivo. `Overlay` (archivo 33, fase 7) lo usan `SyncPanel` (fase 4), el diálogo de nombre y `HotkeysHelp`: la fase 4 usa un `Overlay` que la 7 aún no modificó, y no queda claro si `SyncPanel` funciona sin foco atrapado. Lo mismo con `Toast` (archivo 20, fase 4).

**5. Major. Conceptos propios sin definir. Líneas 148-151, 172, 175, 241.**
No se define qué cuenta como "edición" para `rev` en el caso de importar una captura (CUJ 8). "Lápida", "papelera" y "Eliminadas recientemente" se mezclan sin decir que son lo mismo. `uses`, `usageScore`, `sortByUsage` y "orden por uso" no se definen. `buildBackup()`, `runInit`, `isValidGame`, `restoreBackup`, `initGames` y `skipSaveRef` aparecen como si el lector conociera el código. Tampoco se explican "Mantenimiento" (alta/baja), "palabras vetadas", "candidatas/detectadas", "plantillas de letras", "atril", "comodines", ni los botones "Mejor jugada", "Reajustar" y "Leer captura".

**6. Major. Primera sincronización incompleta. Líneas 91-95 y 202.**
No explica qué pasa si el mismo `id` existe en ambos lados con contenido distinto en la primera sincronización, cuando `syncedRev` no existe: no se sabe si `rev == syncedRev` cuenta como "sin cambios". Tampoco cubre activar primero en el móvil con el servidor ya poblado, y trata el caso igual. No confirma qué pasa con las "Partida 1" creadas en cada aparato.

**7. Major. Regla 3 de la fusión ambigua. Línea 173.**
No dice qué ocurre con `rev` igual, ni si "posterior" se mide por `rev` o por tiempo. El orden de evaluación entre las reglas 2 y 3 no está dicho. Un borrado en un aparato y una edición en el otro con la misma `rev` no se resuelve.

**8. Major. Desempate por `editedBy`. Líneas 150 y 172.**
El desempate depende de un identificador aleatorio: es arbitrario pero determinista, y puede dar la victoria a la edición más antigua. No se dice cómo se actualiza `editedBy` al aplicar datos remotos.

**9. Major. `rev` de la copia de conflicto y su sincronización. Líneas 172 y 375.**
La copia recibe `rev = 1` y un id nuevo, pero no dice si se sube en el mismo ciclo, cómo la ve el otro aparato, ni si la perdedora se guarda solo en el aparato que detecta el choque o también en el servidor. Si dos aparatos detectan el mismo choque podrían generar dos copias con ids distintos. La idempotencia de la línea 385 ("fusionar dos veces no cambia nada") no se cumple con ids aleatorios.

**10. Major. Purga y partidas con pendientes. Líneas 148 y 174.**
Un aparato apagado 40 días que vuelve con una edición de una partida cuya lápida ya se purgó: no dice si la partida resucita. El plazo de 30 días es pregunta abierta (línea 57), pero se usa como hecho en el CUJ 4, la línea 174 y el archivo 6.

**11. Major. CUJ 4 incoherente. Líneas 86-89.**
Dice que B "desapareció de la lista del móvil tras sincronizar" y que "días después" se busca en "Eliminadas recientemente", pero la sincronización ocurre al abrir la app y no dice cuándo si el móvil estuvo sin abrir. El "Deshacer de 9 s" (línea 186) aparece sin presentación previa.

**12. Major. Estados de sincronización sin definición única. Líneas 34, 194 y 411.**
Se nombran de tres formas: los Goals, el motor (`desactivado | sinSesión | sincronizando | alDía | sinRed | error`) y el diagrama, que omite `desactivado`. No se explica la diferencia entre `desactivado` (interruptor apagado) y `sinSesión` (sin token). El documento dice que no hay cuentas y aun así usa "sesión", "cerrar sesión" y "Sincronizado con tu cuenta" (línea 241).

**13. Major. Mecanismo de ETag. Líneas 120, 198, 399.**
No dice qué ETag usa el `PUT` si el `GET` respondió `304`. La comprobación "en la documentación de Vercel" no tiene enlace, y la línea 537 pide aun así una prueba real. El `put` sin `allowOverwrite` para crear depende de un comportamiento no citado, y "error de existencia → `412`" no dice qué error concreto es.

**14. Major. Edición durante una sincronización. Líneas 196-198 y 411.**
No dice si una edición local mientras se aplican datos remotos se pierde o se pone en cola. El `keepalive` tiene un límite de tamaño que no se menciona ni se dice qué pasa si falla. Los reintentos "2, 8, 30, 120 s" contrastan con "espera creciente" sin tope.

**15. Major. Varias pestañas. Línea 200.**
No dice qué pasa si la pestaña líder se cierra con otras abiertas, quién avisa a las demás de que el estado de sincronización cambió, ni qué pasa sin Web Locks o `BroadcastChannel`.

**16. Major. Tres cosas llamadas "copia de seguridad". Líneas 41, 202, 380.**
Exportar/Importar JSON, la copia automática previa (`anagrama.preSyncBackup.v1`) y `buildBackup()`. El documento no dice cómo restaura el usuario la copia automática, y nada en la interfaz (archivo 18) lo muestra. Que `restoreBackup` delegue en `syncMerge` (archivo 8) mientras la línea 53 declara como Non-Goal reutilizarlo para sincronizar puede leerse como contradicción. Si marca lo que entra como `edit`, restaurar un JSON antiguo podría ganar a una versión remota más reciente por tener `rev` mayor; no se trata.

**17. Major. Seguridad del token. Líneas 208-209 y 245.**
El token vive en `localStorage` en claro y da acceso total de lectura y escritura. No dice qué hacer si se filtra ni cómo rotarlo. "Pegar el token en cada aparato" no explica cómo llega al móvil, y el paso manual que se quería evitar reaparece. No hay límite de intentos contra fuerza bruta en `api/sync.ts`.

**18. Major. Diccionario y caché. Líneas 60, 228, 477.**
El archivo pesa 7,7 MB y se sube el límite de precaché a unos 12 MB; la medición sigue abierta pero la fase 6 ya se compromete a precachear. No dice qué pasa sin espacio, ni qué ocurre si el usuario nunca abrió la app con red, ni en iOS, donde el almacenamiento de una PWA se puede purgar. El Goal de usar sin red y la pregunta abierta sobre iPhone o Android se contradicen en parte.

**19. Major. Preguntas abiertas que bloquean decisiones ya tomadas. Líneas 57-63.**
Sin la URL definitiva de Vercel no se pueden mover los datos locales, pero las fases 0 a 5 avanzan sin esa respuesta. Se descarta el teclado propio antes de comprobar si `e.key` llega válido en Android, y no hay plan alternativo. "Qué leyeron los revisores" es una nota de proceso, no una pregunta abierta, y un lector nuevo no sabe quiénes son los "siete revisores" de la línea 267.

**20. Major. Fase 0 y estado del repositorio. Líneas 332-335.**
"Cambios sin confirmar de la sesión anterior" supone que el lector conoce esa sesión. El archivo 1 pide fijar con pruebas el comportamiento que cambiará, pero el archivo 10 solo dice actualizar las expectativas, sin criterio de cuándo la prueba de la fase 0 deja de ser un contrato.

**21. Major. Referencias a números de línea frágiles. Líneas 180, 214, 236, 347-352, 440-443, 494, 499, 504.**
Referencias como `App.tsx:320-467`, `App.tsx:503`, `ScrabbleBoard.tsx:154-171` y `BoardPanel.tsx:159` dejan de ser ciertas al confirmar la fase 1, que reescribe `App.tsx`. Las líneas citadas en los archivos 19 y 28 ya no existirán al ejecutarse.

**22. Major. Verificación sin criterios medibles. Líneas 531-542.**
Se menciona medir el contraste de textos de 11 px sin explicar antes por qué hay textos de ese tamaño ni dónde están. "Las cifras de `tests/regresion.mjs` no deben cambiar" supone que el lector conoce las cifras. "Sin errores en la consola" no dice en qué navegador. El arranque del diccionario en móvil no tiene umbral de aceptación.

**23. Nit. Vocabulario inconsistente.**
"Aparato" y "dispositivo", "partida" y "juego", "papelera" y "Eliminadas recientemente". El documento fija el vocabulario en la línea 241 pero no dice que los nombres de código `GameSwitcher` y `gamesStore` no se renombran.

**24. Nit. Siglas sin definir.**
`DAWG` (líneas 60 y 229), `CUJ`, y "lápida" como traducción de "tombstone".

**25. Nit. Detalles de redacción.**
La tabla de fases no se relaciona con los tres bloques (el bloque 1 son las fases 2 a 5, el 2 la fase 6 y el 3 la fase 7). El diagrama de la línea 127 muestra `useGames`, que solo existe desde la fase 1, sin indicar que es el estado futuro. La línea 63 lista archivos no leídos que el plan modifica con detalle. La línea 267 ("Cuatro de siete revisores recomendaron esta opción") está en la alternativa C, la rechazada, y es confusa.

### Resumen

El revisor pudo parafrasear todas las secciones, así que no hay una sección imposible de entender. Los tres Blockers son contradicciones internas que cambiarían lo que se implementaría: la dependencia de la fase 7 (hallazgo 1), "un aparato activo" frente a la regla de choque (hallazgo 2) y "más reciente" frente a "más revisiones" (hallazgo 3).
