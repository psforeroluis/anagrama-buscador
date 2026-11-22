# Informe de la etapa 7: revisión crítica (ronda 1)

**Documento:** `docs/designs/anagrama-sync-y-uso-movil.md`, líneas 1-312 (especificación; el plan detallado empieza en la 313 y queda fuera).
**Estándar:** `feature-spec-standard.md` para diseño y estructura. Estilo sin estándar.
**Contexto adicional:** ninguno.

## Estado de los revisores

| Revisor | Estado |
|---|---|
| `egm-design` | completado (usó `agents/design_critic.md`, porque `agents/design.md` no existe) |
| `egm-structural` | completado |
| `egm-style` | completado |

**Totales tras deduplicar:** 0 Blocker, 13 Major, 13 Nit. El sintetizador corrigió el recuento a mitad del informe (de 10 a 12 y luego a 13 Major). M1 queda en el límite de Blocker según el estándar. Los identificadores son nuestros, para referirse a los hallazgos.

**Veredicto del sintetizador:** no listo para aprobar. M1, M2, M3, M5 y M6 afectan al objetivo central de no perder ediciones en silencio y deben resolverse antes del plan detallado.

--------------------------------------------------------------------------------

## Major

**M1. Falta una sección "Risks & Mitigations".** (L243-247 y todo el documento; design y structural)
El estándar la exige: modos de fallo, seguridad, límites y mitigaciones. Solo hay un H3 "Seguridad, rendimiento y despliegue" de tres viñetas. Faltan estos modos de fallo:
*   Expulsión de IndexedDB o `localStorage` por el navegador (iOS Safari). El token y el `deviceId` viven en `localStorage`.
*   Cuota para el diccionario precacheado de 7,7 MB (solo aparece en L60).
*   Agotamiento de los 3 reintentos tras `412` (L198).
*   `401` por token inválido: la lista de estados de L194 no tiene "token rechazado".
*   `413` por el límite de 1 MB (L162).
*   Fallo del push con `keepalive`.
*Recomendación:* un H2 que asigne una mitigación a cada riesgo.

**M2. La regla 3 contradice "Nunca perder una edición en silencio".** (L32, 83, 173; design)
Una lápida con `rev` mayor gana a una edición con `rev` menor y no se guarda copia "(conflicto)". Ejemplo: el móvil edita sin red hasta `rev` 4, el ordenador borra en `rev` 5 y el trabajo del móvil se pierde sin aviso.
*Recomendación:* conservar la edición como copia "(conflicto)" o restaurar la partida, y reflejar la regla en los CUJ.

**M3. El documento remoto único no tiene vía de recuperación.** (L119, 207, 247; design)
Cada push sobrescribe la única copia. El servidor solo valida esquema, tamaño y "objeto con `games`". Un bug de fusión, o un cliente con estado vacío o truncado, se propaga a todos los aparatos.
*Recomendación:* guardar al menos una versión previa en el servidor y rechazar pushes que pongan lápida a más de N partidas sin una marca explícita.

**M4. Las garantías sobre datos locales son inexactas.** (L247 frente a L174 y L176; design y style)
L247 dice "ningún mensaje del servidor borra datos locales", pero las lápidas remotas ocultan partidas locales y la purga elimina datos.
*Recomendación:* reformular como "el servidor no borra datos locales sin lápida".

**M5. Resurrección de partidas tras la purga de lápidas a los 30 días.** (L168, 174; design)
La regla 1 ("solo existe en un lado: se toma") hace que un aparato sin conexión más de 30 días reintroduzca una partida ya borrada y purgada. `syncedRev` podría detectar "estuvo sincronizada y ahora falta en remoto", pero ninguna regla lo usa. La purga usa `deletedAt` de un reloj de aparato, contra la afirmación de L162 de que "ninguna decisión usa relojes".
*Recomendación:* definir el caso `syncedRev > 0` con la partida ausente en remoto y corregir la afirmación sobre relojes.

**M6. La resolución de conflictos es incoherente y no determinista.** (L31, 83, 121, 172; design y style)
Los objetivos y el CUJ 3 dicen "gana la más reciente" y "más revisiones", mientras que la regla dice `rev` más alta. `rev` cuenta ediciones, no recencia: el móvil con más ediciones puede ganar al cambio más reciente del ordenador. Falta el desempate por `editedBy` en el CUJ 3 y en L121. La copia del perdedor recibe "id nuevo": si ambos aparatos fusionan se generan dos copias, y los reintentos por `412` o por caída generan más.
*Recomendación:* unificar la redacción con la regla, hacer determinista el id de la copia (por ejemplo, hash de id + `rev` perdedor + `editedBy`) e indicar qué `rev`, `syncedRev` y `editedBy` recibe la copia.

**M7. Adopción remota frente a la pila de deshacer y a la escritura en curso.** (L219, 237; design)
La pila de 50 pasos está solo en memoria. Un Ctrl+Z tras adoptar un cambio remoto puede restaurar un estado anterior y subirlo con `rev` mayor, pisando el trabajo remoto. Tampoco se especifica qué pasa si llega un pull dentro de la ventana de 2 s de espera. `App.tsx` guarda `board`, `boardRack` y `boardBlanks` por separado (`App.tsx:346, 363, 426`).
*Recomendación:* vaciar la pila al aplicar un cambio remoto, o tratar el deshacer como una edición normal sujeta al control de conflictos.

**M8. Huecos de seguridad con un token bearer en `localStorage`.** (L208-210, 245; design)
No se indica entropía mínima del token, límite de intentos tras `401`, rotación ni revocación (cerrar sesión solo borra el token local, L210), ni qué protege el token. Hasta retirar los scripts CDN, `cdn.tailwindcss.com` y `aistudiocdn.com` (`index.html:9, 68-73`) pueden leer `localStorage`, incluido el token. El orden de despliegue (L247) no hace de la retirada de los CDN un requisito previo para activar la sincronización.

**M9. Suposiciones de plataforma sin fuente, de las que depende la arquitectura.** (L120, 202, 207, 290; design y style)
L120 dice "comprobado en la documentación de Vercel el 2026-11-22" sin enlace ni versión (`ifMatch`, `BlobPreconditionFailedError`, `useCache:false`, ETag en blobs privados, `allowOverwrite:false`). No se fija la ruta estable del blob: Vercel Blob añade un sufijo aleatorio por defecto salvo que `addRandomSuffix` esté desactivado, lo que rompería un documento único. No se especifica el mapeo del error de carrera en la creación a `412`, ni los límites de tiempo y cuerpo de la función. La afirmación de que Cloudflare KV tiene obsolescencia de más de 60 s (L290) tampoco tiene fuente.
*Recomendación:* enlazar la documentación, distinguir lectura de verificación en ejecución y declarar un plan de contingencia si falla la atomicidad condicional.

**M10. Alcance, preguntas abiertas y criterios de éxito.** (L13-17, 31, 35, 55-63, 89, 101, 107, 231-241; design y style)
Se agrupan tres esfuerzos independientes: sincronización, uso sin red/PWA y mejoras de uso. Las preguntas abiertas condicionan decisiones ya comprometidas: arranque del diccionario sin medir (L60) frente al objetivo de uso sin red (L35); origen de despliegue sin decidir (L58), con IndexedDB por origen; teclado de Android sin probar (L61) frente a la entrada ya fijada (L122, 236); los "30 días" figuran como fijos en L31, 89 y 174 pero como pendientes en L57. L63 ("Qué leyeron los revisores") es metadato del proceso, no una pregunta de diseño. Hay criterios no verificables ("al alcance del pulgar", L101; "sin quedar atrapado", L107) y no hay metas medibles de latencia de sincronización ni de arranque en frío. Faltan objetivos o un apartado de cambios secundarios para barra lateral, ancho máximo, barra fija "Mejor jugada", renombrados de botones (L240), vocabulario (L241), registro de errores en `catch {}` y la lista de 200 eventos de diagnóstico (L223).
*Recomendación:* dividir en especificaciones separadas o añadir criterios de salida por bloque; cerrar o marcar como provisionales los valores abiertos; usar umbrales medibles.

**M11. Evolución del esquema y clientes desfasados.** (L154-162, 228; design)
El service worker mantiene clientes antiguos hasta que el usuario pulsa "Recargar" (L228), así que conviven versiones distintas contra `schemaVersion: 1`. No hay política para un cliente que lee un `schemaVersion` mayor, ni para un servidor que rechaza uno menor. Afecta también al rollback (L247).
*Recomendación:* el cliente debe negarse a escribir en lugar de descartar campos desconocidos.

**M12. Alternativas con rechazos poco fundamentados.** (L249-309; design, structural y style)
Casi todas empiezan por "Rejected by author" sin enlace. Algunas razones son solo preferencia: A (L255), B (L261), J (L309). Las razones de B y C usan juicios subjetivos ("no compensan", "sobredimensionado"). L267, "Cuatro de siete revisores recomendaron esta opción", es ambiguo (no se sabe si es C o la elegida), no tiene fuente y no es una razón de rechazo. Faltan alternativas: último-escritor-gana con marcas de tiempo o reloj lógico híbrido, la protección de despliegue de Vercel en lugar de un bearer propio, alojar los recursos CDN sin PWA y conservar una versión previa en servidor.
*Recomendación:* eliminar o citar la frase de L267, reescribir los rechazos con criterios medibles y valorar las alternativas faltantes.

**M13. Redacción afirmada sin evidencia.** (L25, 27, 162, 246; style)
L25 "la app no es tan local como dice ser" es un juicio retórico. L27 "Sin red la app puede no arrancar" es hipótesis sin prueba. L162 "menos de 1 KB por partida" y L246 "unos pocos KB… coste despreciable" no tienen medida: un tablero de 225 casillas más metadatos puede superar 1 KB.
*Recomendación:* sustituir por hechos observados (`index.html` carga Tailwind, Font Awesome y React desde dominios externos) o declarar que no se probó. Medir con una exportación real y dar el cálculo de margen del límite de 1 MB, incluidas las lápidas de 30 días.

## Nit

*   **N1.** (L255-309) "Rejected by author" es admisible con razón técnica concreta, pero conviene enlazar discusión o PR. (structural)
*   **N2.** (L180, 186, 223) Las referencias de línea derivaron: `saveGame` está en `services/gamesStore.ts:131-147` (no 127-143) y el chip "Guardado" en `App.tsx:504` (no 503). (design)
*   **N3.** (L180, 212) `saveGame` pone `updatedAt`, pero también lo hacen `App.tsx:346, 363, 426`. Dejar de actualizarlo al abrir una partida cambia el orden de la lista (`gamesStore.ts:106`, `App.tsx:460`), lo que contradice "sin cambio de comportamiento". (design)
*   **N4.** (L196, 207) `fetch` con `keepalive` en `pagehide` admite unos 64 KB, no permite reintentar ni leer la respuesta y necesita un ETag fresco. Indicar qué pasa con un push fallido. (design)
*   **N5.** (L200) El liderazgo con Web Locks cubre solo la sincronización. Las ediciones concurrentes desde dos pestañas compiten en la lectura-modificación-escritura de `rev`. (design)
*   **N6.** (L202) `buildBackup()` en `localStorage` (tope de 5 MB, compartido con el respaldo de `gamesStore.ts:133-146`) con 3 copias: fijar el tamaño máximo y el comportamiento ante `QuotaExceeded`. (design)
*   **N7.** (L15, 184, 227) Terminología variable ("ecos", "lápida", "fuente de verdad", "copia en segundo plano"). Definir "ecos" una vez. (style)
*   **N8.** (L214, 216) "cinco sitios con `skipSaveRef`" no cita ubicaciones y "mezcla … y diseño" es vago. (style)
*   **N9.** (L218-219) "se adopta y se avisa con un aviso" es redundante. (style)
*   **N10.** (L233, 238) Supr pide confirmar, mientras que los objetivos mencionan Deshacer. Aclarar el comportamiento previsto. (style)
*   **N11.** (L194 frente a L136) Los nombres de estado del texto (`desactivado | sinSesión | …`) no coinciden con los del diagrama. (structural)
*   **N12.** (L3-5, 117) Encabezados mezclan inglés y español ("The Problem", "Goals", "Reason for Rejection") sobre cuerpo en español. "Decisiones de arquitectura tomadas por el autor" podría ser un H3 hermano de "Vista general". (structural)
*   **N13.** (L55-63) "Open Questions" está antes de los CUJ y L63 es metadato de proceso: moverlo a una nota de alcance. (structural, style)

## Verificado contra el código (lente de diseño)

*   `index.html` carga Tailwind desde `cdn.tailwindcss.com` (L9), Font Awesome desde cdnjs (L10) y React por `importmap` desde `aistudiocdn.com` (L68-73): la afirmación de que no hay uso real sin red se sostiene.
*   No existen `vercel.json` ni `api/`. `data/README.md:7` cita `anagrama-buscador.vercel.app`.
*   `createGame` usa `crypto.randomUUID` con alternativa, así que las colisiones de id entre aparatos son poco probables.

## Estructura (revisor structural)

Jerarquía de encabezados sin saltos, bloques de código cerrados, una tabla (L146-152) bien formada y sin enlaces. Presentes: Problem Statement, Goals y Non-Goals, Proposed Architecture, Alternatives Considered. Ausente: Risks & Mitigations (M1).

================================================================================

# Ronda 2 de la etapa 7 (re-auditoría)

**Documento:** `docs/designs/anagrama-sync-y-uso-movil.md`, líneas 1-359 (el plan detallado empieza en la 360).
**Revisores nuevos y sin contexto previo:** `egm-design` (usó `agents/design_critic.md`), `egm-structural`, `egm-style`. Los tres completados; ninguno reintentado.
**Totales tras deduplicar:** 39 hallazgos únicos: **1 Blocker, 15 Major, 23 Nit.** Informes brutos: design 18, structural 10, style 24 (52; 13 duplicados fusionados). Los números de línea se refieren al documento tras los arreglos de la ronda 1. Los identificadores R2-B1, R2-M1… y R2-N1… son nuestros.
**Límite de re-auditorías:** esta era la única re-auditoría que permite el flujo. No se puede repetir la etapa otra vez; los hallazgos que queden sin arreglar se registran como compromisos aceptados.

**Comprobado contra el código por `egm-design`:** `index.html` carga Tailwind, Font Awesome, Google Fonts y `aistudiocdn.com` desde dominios externos; `usageScore` en `services/gamesStore.ts` usa `updatedAt`; `data/README.md` cita `anagrama-buscador.vercel.app`. **`egm-structural`:** las áreas exigidas por el estándar están presentes, las Alternativas cumplen la regla y encabezados, tablas y bloques de código son correctos.

## Blocker

**R2-B1. La regla de fusión 1 contradice el invariante de pérdida de datos.** (L181, 189, 197, 219, 261)
La regla 1 elimina del aparato una partida local con `syncedRev > 0` ausente del remoto y sin lápida, si no tiene cambios pendientes. La línea 189 dice que la fusión nunca borra una partida local sin lápida y la 261 que el servidor no borra datos locales sin lápida: las tres no pueden ser ciertas. Se activa también si el documento remoto se borra, se recrea o se restaura desde `.prev` o una copia; la línea 197 solo cubre un `rev` menor en partidas existentes. El `GET` devuelve `404` si falta el Blob (L219) y no se dice si cuenta como remoto vacío: si lo es, todos los aparatos borrarían todas sus partidas sincronizadas, sin papelera ni lápida.
*Recomendación:* no borrar nunca en local solo por ausencia; usar papelera local o conservar y resubir como "reinicio del servidor"; tratar `404` o un remoto reducido como reinicio; reconciliar las líneas 189 y 261.

## Major

1. **R2-M1. Partidas existentes sin migración de `rev`/`syncedRev`.** (L105, 156, 160, 211, 215) Con campos opcionales y valor ausente igual a 0, `rev == syncedRev` y no hay "pendiente": las partidas previas (las 5 y 3 del CUJ 5) nunca se suben. La regla 2 queda indefinida con mismo id y `rev` 0. Definir valores por defecto y una marca "sucia" en la primera activación.
2. **R2-M2. Regla edición contra lápida no calculable.** (L42, 93, 99, 185, 186) La lápida no registra el `rev` conocido por quien borró; borrar suma 1 y una edición concurrente puede empatar. "Con duda se conserva como copia" choca con el objetivo de L42 y con el CUJ 4 (la edición gana y se restaura), y "duda" no está definida. Las dos frases de L186 repiten la regla. La justificación de L93 ("un aparato activo a la vez") contradice el CUJ 3. Hace falta una tabla de decisión con empates y un `baseRev` en la lápida.
3. **R2-M3. El purgado de lápidas depende del reloj del aparato.** (L175, 187, 220) `deletedAt` lo escribe el cliente y el servidor lo compara con su `now`; un reloj desviado rompe los 30 días. Que el servidor selle `deletedAt` en el primer `PUT`, o retirar la afirmación de L175.
4. **R2-M4. La copia "(conflicto)" puede duplicarse o encadenarse.** (L185) El id es determinista pero `editedBy` es el del aparato detector; al encontrarse, la regla 2 la trata como conflicto nuevo y puede dar "A (conflicto) (conflicto)". Hacer determinista `editedBy`, declarar idempotente mismo id y `rev`, y definir qué pasa si el perdedor se edita y choca otra vez.
5. **R2-M5. Confirmación de push no especificada.** (L197, 211) Nada dice cómo un `PUT` exitoso marca como sincronizado; una edición hecha durante un `PUT` en vuelo (espera de 2 s) puede marcarse sincronizada sin haberse enviado. Falta un paso de confirmación que fije `syncedRev` al `rev` realmente enviado y guarde el nuevo ETag.
6. **R2-M6. "Límite de intentos por IP" sin almacén.** (L221) Las funciones serverless no tienen estado y no se nombra Redis, KV ni contador en Blob. Es el único control de fuerza bruta de un token con acceso total. Indicar dónde vive el contador o retirar la afirmación y justificar con entropía y rotación.
7. **R2-M7. Lápidas acumuladas con la sincronización apagada.** (L187, 199, 223, 261) `deleteGame` siempre escribe lápida local pero el purgado lo dirige el servidor; con la sincronización apagada (valor por defecto) nada purga y crecen el almacenamiento y las exportaciones JSON. Falta un purgado local y definir qué pasa con `syncedRev` al desactivar (interacción con la regla 1 al reactivar).
8. **R2-M8. Criterios de salida de bloques incompletos y dependencia contradictoria.** (L15, 23-27, 83-87, 151, 226-233, 259) El CUJ 2 no está en ningún bloque. L23 deja las fases 0 y 1 sin asignar, aunque el refactor de `App.tsx` es prerrequisito del bloque 1. L24 dice que cada bloque se entrega sin esperar a los otros, pero el bloque 2 es prerrequisito de activar la sincronización (L26-27, 259) y el criterio del bloque 1 exige dos aparatos sincronizando. Asignar el CUJ 2 y declarar el orden real.
9. **R2-M9. El bloque 3 prescribe diseño sobre código no leído.** (L28, 72, 250-254) L28 admite que no se leyeron `BoardPanel`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast` ni `boardImage`, pero se fijan `Cell` memoizado, semántica de Tab y Escape, `aria-live`, pila de deshacer y flujo de captura. La pregunta del teclado Android deja sin validar el enfoque central. Leer los archivos o marcar como intención provisional; mover detalle de implementación (como `Cell`) al plan; reubicar el descargo de L28 en Riesgos o Preguntas abiertas nombrando los CUJ 6 y 8.
10. **R2-M10. Precaché del diccionario contradictorio y sin probar.** (L45, 71, 242, 268) L242 precachea `dictionary.txt` (7,7 MB) y la fila de riesgo de L268 describe otro mecanismo (precarga aparte con estado visible). El arranque en frío no está medido; la decisión "provisional" aparece cuatro veces sin umbral ni diseño alternativo. Declarar también que `/api/*` queda excluido del fallback SPA.
11. **R2-M11. Objetivo "<10 s" sin mecanismo ni medición.** (L41, 209) Los disparadores son arranque, `visibilitychange`, `online`, 2 s tras editar y `pagehide`; no hay sondeo, así que un aparato abierto en primer plano no verá la edición del otro. No se define inicio y fin del intervalo; el CUJ 1 dice "unos segundos" y el CUJ 4 "días después". Acotar a "al abrir o enfocar" o añadir sondeo.
12. **R2-M12. Dependencia de contenido fuera de alcance.** (L23, 25, 69, 130, 259) Las "fases 0 a 7" y el "Verification Plan" solo se definen después de la línea 360. Definirlos en el alcance o declarar que remiten al plan.
13. **R2-M13. "809 bytes medidos" sin método y cifras derivadas incoherentes.** (L172-175, 260, 271, 308) No se dice cómo se midió ni si cubre nombre más largo, comodines o unicode; 1.296 partidas solo vale con 1 MB = 1.048.576 B, sin declararlo; L260 dice "unos pocos KB" y L308 "decenas de KB" con la misma cifra. Nombrar la fuente una vez, fijar la definición de 1 MB y unificar.
14. **R2-M14. Afirmaciones sobre terceros presentadas como hechos.** (L130, 215, 220) L130 hedgea `ifMatch` ("lectura de documentación, no una prueba"), pero L215 y L220 afirman sin salvedad que el `put` sin `allowOverwrite` falla si el Blob existe y que ello da `412`. Ampliar la puerta de verificación o marcar como no verificado.
15. **R2-M15. Objetivo-cajón vago.** (L53, 253, 255) "Cambios secundarios de interfaz" agrupa ancho máximo, barra lateral, "Mejor jugada" fija, renombrados, vocabulario y `catch {}`; "ancho máximo mayor" y "pantallas grandes" sin valor ni punto de corte; "registro de los errores" sin CUJ ni criterio de salida.

## Nit

1. **R2-N1 (L209):** `fetch` con `keepalive` tiene un límite de cuerpo cercano a 64 KiB y el push envía el documento completo; fallaría antes del límite de 1 MB. Documentar el tope o enviar solo lo cambiado.
2. **R2-N2 (L213):** sin alternativa si faltan Web Locks o `BroadcastChannel` (iOS Safari antiguo; enlaza con la pregunta de L73).
3. **R2-N3 (L220):** la guarda `409` (más de 5 lápidas o menos de la mitad de las partidas) menciona una "marca explícita" sin decir quién la pone; excluir los purgados del servidor del recuento.
4. **R2-N4 (L93, 160):** `rev` cuenta guardados y depende de la espera; el Then del CUJ 3 no dice qué lado gana porque el Given no da `rev` relativos.
5. **R2-N5 (L151):** "`useGames` aparece como estado final tras la fase 1" no se relaciona con el diagrama y remite a una fase no definida; mover a L226 o eliminar.
6. **R2-N6 (L209-210):** el segundo "Si falla" es ambiguo tras el de `pagehide`; separar casos y dar valores del backoff o decir que los fija el plan.
7. **R2-N7 (L219-220 y 271):** el `413` aparece en Riesgos pero la validación del `PUT` no declara código para el exceso de tamaño, a diferencia de `400`, `409` y `412`.
8. **R2-N8 (L356 y 350):** Alternativa M dice "Adoptada solo en parte" en el campo de rechazo; cambiar la etiqueta. Alternativa L: "no está pensada para llamadas desde la propia app" sin fuente.
9. **R2-N9 (L99, CUJ 4):** el Then agrupa purgado tras el plazo, restauración y edición offline que gana; solo papelera y restauración se siguen del Given y When. Separar.
10. **R2-N10 (L11):** "no usa servidor ni claves" choca con L35 (recursos desde dominios externos, confirmado en `index.html`); acotar a "no guarda datos en servidor".
11. **R2-N11 (L35):** "En el móvil, que es donde más se juega" sin fuente.
12. **R2-N12 (L37):** "sincronización local primero" repite L15 y L149; "se corrigen los problemas" sugiere corrección completa.
13. **R2-N13 (L43):** "Nunca perder una edición en silencio" es un absoluto que contradicen L215 (fallo de cuota) y L267 (expulsión del navegador); acotar a la fusión.
14. **R2-N14 (L29, 68, 187):** la lápida dice 30 días pero el plazo es provisional (L68) y lo aplica el servidor (L187).
15. **R2-N15 (L260):** "el coste de nube es despreciable" sin cifra.
16. **R2-N16 (L282, 301):** "ya resueltas", "Más superficie de configuración" y "Frágil en iOS" sin cuantificar ni fuente.
17. **R2-N17 (L319):** "cuota gratuita amplia" de Cloudflare sin cifra; mantener la marca "no verificado" del tiempo de propagación.
18. **R2-N18 (L111, 117):** "Cada paso se hace con flechas, Enter, F2/Supr o Tab" no asigna tecla por paso (F2 y Supr no están en el When); "sigue visible sobre el teclado" necesita condición de prueba.
19. **R2-N19 (L254):** quitar pistas "arrastra / Ctrl+V" en móvil y añadir botones de vaciar y comodín no figura en Objetivos ni CUJ.
20. **R2-N20 (terminología):** "aparato" frente a "dispositivo"; "chip", "franja", "aviso" y "toast" nombran la misma superficie (L29, 237); definir cada una una vez.
21. **R2-N21 (L44, 87, 150-151, 207, 237):** la lista de 7 estados se repite cuatro veces (riesgo de deriva) y el texto visible varía ("Sin conexión, 3 pendientes", "Sin conexión · N pendientes", "sin red con N pendientes"); una lista canónica y una cadena única.
22. **R2-N22 (L267-268):** "aviso de que el almacenamiento puede borrarse" es genérico, sin disparador ni lugar en la interfaz.
23. **R2-N23 (L175, 179):** al usar `syncMerge` para restaurar una copia de seguridad no se dice qué lado es "local" y cuál "remoto".
