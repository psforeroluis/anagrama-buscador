# Goldfish Annotated Review Report

**Status (ronda 1):** resolved (ronda 1 de la etapa 7). Se aplicaron los 24 arreglos PROPOSE FIX (13 Major y 11 Nit). M10a (ESCALATE) se resolvió después: el autor delegó la decisión y se mantuvo un solo documento, con criterios de salida por bloque en la nota de alcance. N1 y N12 se descartaron (DECLINE). El plan detallado (línea 356 en adelante) no se tocó en esta ronda y todavía no refleja `lastUsedAt`, el estado `tokenRechazado`, la versión previa en el servidor ni el `409`.

**Target:** `docs/designs/anagrama-sync-y-uso-movil.md` (líneas 1-312)
**Origen de los hallazgos:** `critic_report.md`, ronda 1 (`egm-design`, `egm-structural`, `egm-style`).
**Resumen de categorías:** 13 PROPOSE FIX (Major), 1 ESCALATE, 11 PROPOSE FIX (Nit) y 2 DECLINE: 24 arreglos propuestos en total. M10 se divide en dos: M10a es ESCALATE y M10b es PROPOSE FIX.

## Prioritized Findings & AI Suggestions

### [Issue M10a] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Líneas 13-17](docs/designs/anagrama-sync-y-uso-movil.md#L13-L17) (Overview) y [líneas 31-35](docs/designs/anagrama-sync-y-uso-movil.md#L31-L35) (Goals)
*   **Discrepancy Description:** El documento agrupa tres esfuerzos independientes: sincronización, uso sin conexión/PWA y mejoras de uso en móvil y ordenador.
*   **Rationale:** El propio plan dice que las fases 6 y 7 son independientes de la sincronización, y una especificación única mezcla criterios de salida distintos.
*   ***AI Suggestion:*** **ESCALATE**
*   ***Justification:*** El autor decidió en esta sesión mantener todo el brief en un solo documento, tras ver este mismo argumento. Esa decisión consta en la conversación, no en el documento ni en ningún fichero que el revisor pudiera leer. No se corrige sin tu confirmación.
*   ***Proposed Edit:***
    *   Location: Overview
    *   Change: Si confirmas que sigue en un documento: añadir una frase que lo diga ("un solo documento por decisión del autor; las fases 6 y 7 se pueden extraer después") y criterios de salida por bloque (ver M10b). Si prefieres dividir: mover las fases 6 y 7 a documentos aparte.

### [Issue M1] [`egm-design`, `egm-structural`] - Severity: Major
*   **Affected Scope:** [Líneas 243-247](docs/designs/anagrama-sync-y-uso-movil.md#L243-L247) (Seguridad, rendimiento y despliegue)
*   **Discrepancy Description:** Falta una sección "Risks & Mitigations" con los modos de fallo: expulsión de IndexedDB/`localStorage` en iOS, cuota del diccionario de 7,7 MB, agotamiento de los 3 reintentos tras `412`, `401` por token inválido (sin estado "token rechazado"), `413` por el límite de 1 MB y fallo del push `keepalive`.
*   **Rationale:** El estándar de especificación exige riesgos y mitigaciones; hoy solo hay tres viñetas.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El hallazgo es válido y comprobable: la sección no existe. Se añade como H2 y se amplía la lista de estados con `tokenRechazado`.
*   ***Proposed Edit:***
    *   Location: tras "Technical Plan", antes de "Alternatives Considered"
    *   Change: nuevo `## Risks & Mitigations` con una tabla riesgo → mitigación (expulsión de almacenamiento: copia JSON y aviso; diccionario: precarga aparte con estado visible; `412` repetido: estado `error` con "Reintentar"; `401`: estado `tokenRechazado`; `413`: aviso con acción de exportar; `keepalive` fallido: queda pendiente y se envía al próximo arranque).

### [Issue M2] [`egm-design`] - Severity: Major
*   **Affected Scope:** [Líneas 83, 173](docs/designs/anagrama-sync-y-uso-movil.md#L173) (Fusión, regla 3; CUJ 3)
*   **Discrepancy Description:** Una lápida con `rev` mayor vence a una edición con `rev` menor y no se conserva copia: se pierde una edición en silencio.
*   **Rationale:** Contradice el Goal "Nunca perder una edición en silencio".
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Es una contradicción real con un Goal explícito.
*   ***Proposed Edit:***
    *   Location: Fusión, regla 3
    *   Change: "Borrado frente a edición: si el otro lado tiene una edición que el borrado no vio (`rev` posterior a la que el aparato que borra conocía), gana la edición y la partida se restaura. Una lápida solo vence si el otro lado no tiene edición pendiente. Si hay duda, la edición se conserva como copia «(conflicto)»." Añadir un CUJ o una línea al CUJ 4 que lo ilustre.

### [Issue M3] [`egm-design`] - Severity: Major
*   **Affected Scope:** [Líneas 119, 207, 247](docs/designs/anagrama-sync-y-uso-movil.md#L207) (documento único; función serverless)
*   **Discrepancy Description:** Cada push sobrescribe la única copia y el servidor solo valida esquema y tamaño; un bug de fusión o un cliente truncado se propaga a todos los aparatos.
*   **Rationale:** Sin versión previa no hay vía de recuperación.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El riesgo es real para el diseño de documento único elegido por el autor, y la mitigación no cambia la decisión.
*   ***Proposed Edit:***
    *   Location: "Función serverless `api/sync.ts`"
    *   Change: antes de cada `PUT` válido, el servidor copia el documento actual a `anagrama-sync.prev.json` (una versión previa). Rechaza con `409` un `PUT` que ponga lápida a más de 5 partidas, o que reduzca el número de partidas a menos de la mitad, salvo con una marca explícita en la petición. Documentar cómo recuperar la versión previa.

### [Issue M4] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Línea 247](docs/designs/anagrama-sync-y-uso-movil.md#L247) frente a [líneas 174 y 176](docs/designs/anagrama-sync-y-uso-movil.md#L174)
*   **Discrepancy Description:** "ningún mensaje del servidor borra datos locales" es inexacto: las lápidas remotas ocultan partidas locales y la purga elimina datos.
*   **Rationale:** La garantía prometida no coincide con las reglas de fusión.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** La afirmación es literalmente falsa con las reglas descritas.
*   ***Proposed Edit:***
    *   Location: Despliegue por fases, marcha atrás
    *   Change: "el servidor no borra datos locales sin lápida; las lápidas conservan el contenido 30 días y la copia automática previa a la primera sincronización permite volver atrás".

### [Issue M5] [`egm-design`] - Severity: Major
*   **Affected Scope:** [Líneas 162, 168, 174](docs/designs/anagrama-sync-y-uso-movil.md#L168) (Fusión, reglas 1 y 4)
*   **Discrepancy Description:** Un aparato sin conexión más de 30 días reintroduce una partida ya borrada y purgada (regla 1). La purga usa `deletedAt` de un reloj de aparato, contra la afirmación "ninguna decisión usa relojes".
*   **Rationale:** `syncedRev` permitiría detectar "estuvo sincronizada y ahora falta en remoto", pero ninguna regla lo usa.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Hay un hueco real en la regla 1 y una afirmación incorrecta sobre relojes.
*   ***Proposed Edit:***
    *   Location: Fusión, regla 1 y párrafo del modelo de datos
    *   Change: añadir la regla "Si `syncedRev > 0` y la partida no existe en remoto ni tiene lápida, se trata como borrada en otro aparato: no se sube; se conserva localmente como copia «(conflicto)» si tiene cambios pendientes y se elimina si no". Cambiar "ninguna decisión de fusión usa relojes" por "la elección del ganador no usa relojes; solo la purga de lápidas usa la hora del servidor". Aclarar que la purga la hace el servidor.

### [Issue M6] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Líneas 31, 83, 121, 172](docs/designs/anagrama-sync-y-uso-movil.md#L172) (Goals, CUJ 3, Fusión)
*   **Discrepancy Description:** El texto dice "más reciente" y "más revisiones" mientras la regla usa la `rev` más alta, que cuenta ediciones. Falta el desempate por `editedBy` en el CUJ 3. El id de la copia perdedora es aleatorio, así que dos aparatos que fusionan crean dos copias.
*   **Rationale:** La redacción promete recencia que la regla no ofrece, y la fusión no es idempotente.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Hallazgo válido; ya lo señalaron también las etapas 5 y 6.
*   ***Proposed Edit:***
    *   Location: Goals, CUJ 3, Fusión
    *   Change: sustituir "más reciente" por "con más ediciones (`rev` más alta)" y decir que es un criterio aceptado porque se usa un aparato activo a la vez. Añadir el desempate por `editedBy` al CUJ 3. Hacer el id de la copia determinista (hash de `id` original + `rev` perdedora + `editedBy`) y precisar `rev = 1`, `syncedRev = 0` y `editedBy` del aparato que detecta el choque.

### [Issue M7] [`egm-design`] - Severity: Major
*   **Affected Scope:** [Líneas 219, 237](docs/designs/anagrama-sync-y-uso-movil.md#L237) (adopción remota; deshacer del tablero)
*   **Discrepancy Description:** Un Ctrl+Z tras adoptar un cambio remoto puede restaurar un estado anterior y subirlo con `rev` mayor, pisando el trabajo remoto. No se dice qué pasa si llega un pull dentro de la ventana de 2 s.
*   **Rationale:** El deshacer en memoria no sabe nada de la sincronización.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Escenario concreto y válido.
*   ***Proposed Edit:***
    *   Location: "Refactor de `App.tsx`" y "Deshacer/rehacer del tablero"
    *   Change: "Al adoptar un cambio remoto en la partida activa se vacía la pila de deshacer. Si llega un pull durante la espera de 2 s, la edición local pendiente se trata como cambio local: aplica la regla de choque."

### [Issue M8] [`egm-design`] - Severity: Major
*   **Affected Scope:** [Líneas 208-210, 245](docs/designs/anagrama-sync-y-uso-movil.md#L208-L210) (autenticación y despliegue)
*   **Discrepancy Description:** No hay entropía mínima del token, límite de intentos, rotación ni revocación. Mientras `index.html` cargue scripts de CDN, esos dominios pueden leer `localStorage`, incluido el token. El orden de despliegue no exige retirar los CDN antes de activar la sincronización.
*   **Rationale:** Un token en `localStorage` con scripts de terceros en la página queda expuesto.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Verificado contra `index.html:9, 68-73`: los scripts externos existen.
*   ***Proposed Edit:***
    *   Location: "Función serverless" y "Despliegue por fases"
    *   Change: token de al menos 32 caracteres aleatorios; límite de intentos por IP en `401`; rotación = cambiar `SYNC_TOKEN` y volver a pegarlo en cada aparato; la fase 6 (quitar CDNs) pasa a ser requisito previo de activar la sincronización.

### [Issue M9] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Líneas 120, 202, 207, 290](docs/designs/anagrama-sync-y-uso-movil.md#L120)
*   **Discrepancy Description:** "Comprobado en la documentación de Vercel" sin enlace ni versión. No se fija la ruta estable del blob (Vercel Blob añade sufijo aleatorio por defecto). No se mapea el error de carrera en la creación a `412`. La afirmación sobre Cloudflare KV (más de 60 s) no tiene fuente.
*   **Rationale:** La concurrencia del diseño depende de comportamientos de plataforma sin cita.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. La fuente existe (`https://vercel.com/docs/vercel-blob`, consultada con la herramienta de documentación de Vercel el 2026-11-22) y puede citarse. La cifra de Cloudflare no se verificó y debe suavizarse.
*   ***Proposed Edit:***
    *   Location: Decisiones de arquitectura, función serverless, Alternativa G
    *   Change: enlazar `https://vercel.com/docs/vercel-blob`; fijar `anagrama-sync.json` con `addRandomSuffix: false`; decir que el error de existencia en la creación se traduce a `412`; añadir un plan de contingencia (si la prueba con dos subidas simultáneas no devuelve `412`, el diseño se detiene y se vuelve a elegir almacén); reescribir la cifra de Cloudflare como "consistencia eventual, con retraso de propagación no acotado a efectos de este diseño (no verificado)".

### [Issue M10b] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Líneas 55-63, 89, 101, 107, 231-241](docs/designs/anagrama-sync-y-uso-movil.md#L55-L63) (Open Questions, Goals, CUJ)
*   **Discrepancy Description:** Preguntas abiertas condicionan decisiones ya comprometidas (diccionario sin medir, origen de despliegue, teclado Android, "30 días" fijo en unos sitios y pendiente en otro). L63 es metadato de proceso. Hay criterios no medibles ("al alcance del pulgar", "sin quedar atrapado") y faltan objetivos para barra lateral, ancho máximo, "Mejor jugada" fija, renombrados, vocabulario y registro de errores.
*   **Rationale:** Un diseño aprobable necesita valores cerrados o declarados provisionales y criterios verificables.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido en cada punto. La decisión de alcance (M10a) va aparte.
*   ***Proposed Edit:***
    *   Location: Open Questions, Goals y CUJ 6 y 7
    *   Change: marcar "30 días" como "(provisional, por confirmar)" en todos los sitios; indicar de qué cuestión abierta depende cada decisión; mover L63 a una "Nota de alcance"; sustituir "al alcance del pulgar" por "dentro del tercio inferior de la pantalla" y "sin quedar atrapado" por "Tab mueve el foco fuera del tablero en una pulsación"; añadir metas medibles (la partida editada aparece en el otro aparato en menos de 10 s con red; arranque en frío medido y registrado, sin umbral hasta tener la medición); añadir un Goal "Cambios secundarios" con barra lateral, ancho máximo, "Mejor jugada" fija, renombrados de botones, vocabulario y registro de errores.

### [Issue M11] [`egm-design`] - Severity: Major
*   **Affected Scope:** [Líneas 154-162, 228](docs/designs/anagrama-sync-y-uso-movil.md#L154-L162) (documento remoto; service worker)
*   **Discrepancy Description:** Conviven clientes de versiones distintas contra `schemaVersion: 1`. No hay política para un `schemaVersion` mayor ni para uno menor.
*   **Rationale:** El aviso de recarga deja versiones antiguas escribiendo sobre un documento que ya no entienden.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido; se alinea con el principio de campos opcionales ya usado.
*   ***Proposed Edit:***
    *   Location: "Documento remoto" y "Función serverless"
    *   Change: "Un cliente que lee un `schemaVersion` mayor al suyo no escribe y muestra «Actualiza la app para sincronizar». El servidor rechaza con `400` un `schemaVersion` menor al actual. Los campos desconocidos se conservan al ir y volver."

### [Issue M12] [`egm-design`, `egm-structural`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Líneas 249-309](docs/designs/anagrama-sync-y-uso-movil.md#L249-L309) (Alternatives Considered)
*   **Discrepancy Description:** Rechazos basados en preferencia sin criterio técnico (A, B, J); juicios subjetivos ("no compensan", "sobredimensionado"); la frase "Cuatro de siete revisores recomendaron esta opción" (L267) es ambigua y no es razón de rechazo; faltan alternativas (último-escritor-gana con marcas de tiempo, protección de despliegue de Vercel, CDNs sin PWA, versión previa en servidor).
*   **Rationale:** Las alternativas deben justificarse con criterios comprobables.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. La cuenta de revisores procede del informe de la fase de brainstorm, un fichero local que el lector del diseño no ve.
*   ***Proposed Edit:***
    *   Location: Alternativas A, B, C, J y nuevas
    *   Change: borrar la frase de L267; reescribir A, B y J con un criterio concreto (A: añade un SDK y reglas de acceso que un usuario único no necesita; B: la pérdida de la clave implica pérdida de datos sin recuperación; J: no elimina el paso manual, que es el problema); en C citar el criterio (el uso es de un aparato activo a la vez); añadir las alternativas K (último-escritor-gana con marcas de tiempo: relojes de aparato no fiables), L (protección de despliegue de Vercel: no cubre aparatos sin sesión de Vercel ni el acceso desde la app) y M (conservar versión previa en servidor: adoptada en M3).

### [Issue M13] [`egm-style`] - Severity: Major
*   **Affected Scope:** [Líneas 25, 27, 162, 246](docs/designs/anagrama-sync-y-uso-movil.md#L25)
*   **Discrepancy Description:** Afirmaciones sin evidencia: "no es tan local como dice ser", "Sin red la app puede no arrancar", "menos de 1 KB por partida" y "unos pocos KB".
*   **Rationale:** Son hipótesis o juicios presentados como hechos.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. El hecho comprobable es que `index.html` carga Tailwind, Font Awesome y React desde dominios externos (verificado por el revisor de diseño).
*   ***Proposed Edit:***
    *   Location: The Problem y Modelo de datos
    *   Change: sustituir por "`index.html` carga Tailwind, Font Awesome, fuentes y React desde dominios externos al ejecutarse; no se ha probado qué pasa sin red". Medir una partida real exportada y escribir el tamaño y el cálculo del margen del límite de 1 MB, incluidas 30 días de lápidas.

### [Issue N2] [`egm-design`] - Severity: Nit
*   **Affected Scope:** [Líneas 180, 186, 223](docs/designs/anagrama-sync-y-uso-movil.md#L180)
*   **Discrepancy Description:** Las referencias de línea derivaron (`saveGame` está en `gamesStore.ts:131-147`, el chip en `App.tsx:504`).
*   **Rationale:** Se vuelven falsas en cuanto se toca el código.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Mejor quitar números de línea que corregirlos, porque dejarán de valer.
*   ***Proposed Edit:***
    *   Location: toda la especificación
    *   Change: sustituir las referencias `fichero:línea` por nombres de función o de bloque.

### [Issue N3] [`egm-design`] - Severity: Nit
*   **Affected Scope:** [Líneas 180, 212](docs/designs/anagrama-sync-y-uso-movil.md#L212) (origen `usage`)
*   **Discrepancy Description:** El origen `usage` no toca `updatedAt`, pero `usageScore` usa `updatedAt` como recencia; abrir una partida dejaría de subirla en el orden por uso.
*   **Rationale:** Cambia el comportamiento ya entregado hoy del orden por uso, contra "sin cambio de comportamiento".
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido y comprobado: `usageScore` calcula los días desde `updatedAt` (`services/gamesStore.ts`), y `handleSelectGame` actualiza `updatedAt` al abrir.
*   ***Proposed Edit:***
    *   Location: "Cambios en el guardado local" y tabla del modelo de datos
    *   Change: añadir el campo local `lastUsedAt`, que fijan `edit` y `usage`, y que `usageScore` usa como recencia en lugar de `updatedAt`. No se sincroniza.

### [Issue N4] [`egm-design`] - Severity: Nit
*   **Affected Scope:** [Líneas 196, 207](docs/designs/anagrama-sync-y-uso-movil.md#L196)
*   **Discrepancy Description:** El `fetch` con `keepalive` admite unos 64 KB, no permite reintento ni leer la respuesta y necesita un ETag fresco. No se dice qué pasa si falla.
*   **Rationale:** El último push puede perderse sin aviso.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido; ya recogido en M1.
*   ***Proposed Edit:***
    *   Location: Motor de sincronización
    *   Change: "El push en `pagehide` es de mejor esfuerzo. Si falla, la partida sigue pendiente (`rev > syncedRev`) y se envía en el próximo arranque."

### [Issue N5] [`egm-design`] - Severity: Nit
*   **Affected Scope:** [Línea 200](docs/designs/anagrama-sync-y-uso-movil.md#L200)
*   **Discrepancy Description:** El liderazgo con Web Locks solo cubre la red; dos pestañas pueden competir en la lectura-modificación-escritura de `rev`.
*   **Rationale:** Se pierde una edición local sin copia de conflicto.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido; ya señalado en la etapa 5.
*   ***Proposed Edit:***
    *   Location: "Varias pestañas" y "Cambios en el guardado local"
    *   Change: "`saveGame` lee y escribe `rev` dentro de una única transacción `readwrite` de IndexedDB; las pestañas se enteran de los cambios por `BroadcastChannel`."

### [Issue N6] [`egm-design`] - Severity: Nit
*   **Affected Scope:** [Línea 202](docs/designs/anagrama-sync-y-uso-movil.md#L202)
*   **Discrepancy Description:** La copia previa de `buildBackup()` en `localStorage` (tope de unos 5 MB, compartido con el respaldo de `gamesStore.ts`) con 3 copias no tiene tamaño máximo ni tratamiento de `QuotaExceeded`.
*   **Rationale:** Puede llenar `localStorage` y romper el guardado de respaldo.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: "Primera sincronización"
    *   Change: conservar una copia previa en lugar de tres. Si falla por cuota, no empezar la primera sincronización y pedir al usuario que exporte una copia manual.

### [Issue N7] [`egm-style`] - Severity: Nit
*   **Affected Scope:** [Líneas 15, 184, 227](docs/designs/anagrama-sync-y-uso-movil.md#L184)
*   **Discrepancy Description:** Terminología variable ("ecos", "lápida", "fuente de verdad", "copia en segundo plano").
*   **Rationale:** El lector no sabe si son conceptos distintos.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Barato y útil para un lector nuevo.
*   ***Proposed Edit:***
    *   Location: Overview y Modelo de datos
    *   Change: definir "eco" una vez ("que un cambio recibido del servidor se reenvíe como si fuera una edición local") y "lápida" ("marca de borrado que conserva la partida 30 días"); usar siempre esos términos.

### [Issue N8] [`egm-style`] - Severity: Nit
*   **Affected Scope:** [Líneas 214, 216](docs/designs/anagrama-sync-y-uso-movil.md#L214)
*   **Discrepancy Description:** "cinco sitios con `skipSaveRef`" sin ubicaciones y "mezcla … y diseño" vago.
*   **Rationale:** Imprecisión.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Corrección menor.
*   ***Proposed Edit:***
    *   Location: "Refactor de `App.tsx`"
    *   Change: "repone la partida activa a mano al cargar, seleccionar, crear, borrar y deshacer, usando `skipSaveRef`" y "mezcla worker, búsqueda, partidas, mantenimiento, avisos y maquetación".

### [Issue N9] [`egm-style`] - Severity: Nit
*   **Affected Scope:** [Líneas 218-219](docs/designs/anagrama-sync-y-uso-movil.md#L218-L219)
*   **Discrepancy Description:** "se adopta y se avisa con un aviso" es redundante.
*   **Rationale:** Redacción.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Corrección trivial.
*   ***Proposed Edit:***
    *   Location: "Refactor de `App.tsx`"
    *   Change: "se adopta y se muestra un aviso".

### [Issue N10] [`egm-style`] - Severity: Nit
*   **Affected Scope:** [Líneas 233, 238](docs/designs/anagrama-sync-y-uso-movil.md#L233)
*   **Discrepancy Description:** Supr pide confirmar el borrado, mientras que otras partes hablan de Deshacer.
*   **Rationale:** No queda claro cuál es el comportamiento previsto.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Hay dos mecanismos (el diálogo de confirmar y el Deshacer de 9 s); deben describirse juntos.
*   ***Proposed Edit:***
    *   Location: "Mejoras de uso en móvil y ordenador"
    *   Change: "Supr abre el diálogo de confirmación; tras confirmar, el aviso ofrece Deshacer durante 9 s y la partida queda en 'Eliminadas recientemente'."

### [Issue N11] [`egm-structural`] - Severity: Nit
*   **Affected Scope:** [Líneas 136, 194](docs/designs/anagrama-sync-y-uso-movil.md#L194)
*   **Discrepancy Description:** Los nombres de estado del texto no coinciden con los del diagrama.
*   **Rationale:** El lector no sabe si son los mismos estados.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido; además `desactivado` falta en el diagrama y los Goals.
*   ***Proposed Edit:***
    *   Location: diagrama, Goals y "Motor de sincronización"
    *   Change: usar los mismos nombres en los tres sitios (desactivado, sin token, sincronizando, al día, sin red, token rechazado, error) y explicar que "desactivado" es el interruptor apagado y "sin token" es no haber pegado el token. Evitar "sesión" y "cuenta", porque no hay cuentas.

### [Issue N13] [`egm-structural`, `egm-style`] - Severity: Nit
*   **Affected Scope:** [Líneas 55-63](docs/designs/anagrama-sync-y-uso-movil.md#L55-L63) (Open Questions)
*   **Discrepancy Description:** "Qué leyeron los revisores" es metadato de proceso y no una pregunta de diseño; Open Questions aparece antes de los CUJ.
*   **Rationale:** Estructura.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Se resuelve junto a M10b.
*   ***Proposed Edit:***
    *   Location: Open Questions
    *   Change: mover la viñeta a una "Nota de alcance" al final de Overview.

### [Issue N1] [`egm-structural`] - Severity: Nit
*   **Affected Scope:** [Líneas 255-309](docs/designs/anagrama-sync-y-uso-movil.md#L255-L309)
*   **Discrepancy Description:** "Rejected by author" sin enlace a discusión o PR.
*   **Rationale:** Trazabilidad.
*   ***AI Suggestion:*** **DECLINE**
*   ***Justification:*** El estándar de EGM pide esa fórmula para decisiones del autor, y no hay discusión ni PR que enlazar. El revisor mismo la admitió con razón técnica concreta, que M12 refuerza.
*   ***Proposed Edit:***
    *   Location: n/a
    *   Change: ninguno.

### [Issue N12] [`egm-structural`] - Severity: Nit
*   **Affected Scope:** [Líneas 3-5, 117](docs/designs/anagrama-sync-y-uso-movil.md#L117)
*   **Discrepancy Description:** Encabezados en inglés ("The Problem", "Goals", "Reason for Rejection") sobre cuerpo en español.
*   **Rationale:** Consistencia de idioma.
*   ***AI Suggestion:*** **DECLINE**
*   ***Justification:*** Son los encabezados de la plantilla de EGM (`references/design_doc.md`), y otras etapas de la revisión los buscan por nombre. Traducirlos puede romper la comparación. No se corrige.
*   ***Proposed Edit:***
    *   Location: n/a
    *   Change: ninguno.

================================================================================

# Ronda 2: hallazgos de la re-auditoría de la etapa 7

**Status (ronda 2):** resolved. Se aplicaron los 39 arreglos PROPOSE FIX (1 Blocker, 15 Major y 23 Nit). El plan detallado (sección Detailed Implementation Plan) no se tocó y está desfasado respecto a los cambios de las dos rondas: `lastUsedAt`, `deletedBaseRev`, `tokenRechazado`, versión previa y `409`, descarga aparte del diccionario, CUJ 9, regla 1 sin borrado.
**Target:** `docs/designs/anagrama-sync-y-uso-movil.md` (líneas 1-359). Los números R2-B1, R2-M1… son los de `critic_report.md`, ronda 2.
**Resumen de categorías:** 39 PROPOSE FIX (1 Blocker, 15 Major, 23 Nit). Ningún ESCALATE ni CONTEST: todos los hallazgos son válidos y se comprobaron contra el documento. Dos propuestas fijan decisiones que conviene que mires antes de aceptar: R2-M10 (mecanismo de caché del diccionario) y R2-M15 (punto de corte de "pantalla grande").
**Nota sobre el límite:** la etapa 7 ya usó su única re-auditoría. Tras aplicar estos arreglos no se repite; lo que no se arregle queda registrado como compromiso aceptado.

## Blocker

### [R2-B1] [`egm-design`] - Severity: Blocker
*   **Affected Scope:** Fusión regla 1, garantías sobre datos locales, `GET` con `404`.
*   **Discrepancy Description:** La regla 1 elimina una partida local con `syncedRev > 0` ausente del remoto sin lápida, lo que contradice "la fusión nunca borra una partida local sin lápida" y "el servidor no borra datos locales sin lápida". Si el Blob se pierde, se recrea o se restaura, todos los aparatos borrarían todas sus partidas sincronizadas.
*   **Rationale:** Pérdida de datos sin papelera, justo lo que el diseño promete evitar.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:* ** Hallazgo válido y creado por el arreglo de M5 de la ronda 1. La ausencia en el remoto no es una orden de borrado. El coste es aceptar que una partida borrada y ya purgada pueda reaparecer en un aparato que estuvo más de 30 días sin conexión.
*   ***Proposed Edit:***
    *   Location: Fusión, regla 1; "Cambios en el guardado local"; "Función serverless" (`GET`)
    *   Change: sustituir el caso por "si existe en local con `syncedRev > 0` y no existe en remoto ni tiene lápida, no se elimina: se conserva y se vuelve a subir (`syncedRev = 0`), y se avisa. Puede resucitar una partida borrada y purgada tras más de 30 días sin conexión; se declara comportamiento aceptado". Un `404` o un remoto con menos de la mitad de las partidas se trata como "servidor reiniciado": se sube lo local, sin borrar nada. Reconciliar las frases de garantía: "la fusión nunca borra una partida local".

## Major

### [R2-M1] [`egm-design`] - Severity: Major
*   **Affected Scope:** Modelo de datos (`rev`, `syncedRev`), CUJ 5.
*   **Discrepancy Description:** Las partidas existentes no tienen `rev` ni `syncedRev`; con ausente igual a 0, `rev == syncedRev` y nunca se consideran pendientes ni se suben.
*   **Rationale:** El CUJ 5 (5 y 3 partidas previas) no funcionaría.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: Modelo de datos
    *   Change: "Una partida sin `syncedRev` nunca se ha sincronizado y cuenta como pendiente. Al activar la sincronización, `rev` ausente se toma como 1. Si el mismo `id` existe en ambos lados con contenido distinto y local no tiene `syncedRev`, se aplica la regla de choque."

### [R2-M2] [`egm-design`] - Severity: Major
*   **Affected Scope:** Objetivos, CUJ 3 y 4, Fusión regla 3.
*   **Discrepancy Description:** La lápida no guarda el `rev` que conocía quien borró, así que "edición posterior al borrado" no se puede calcular; "con duda se conserva como copia" choca con el objetivo y con el CUJ 4; la justificación del CUJ 3 contradice "un aparato activo a la vez".
*   **Rationale:** Regla ambigua en el punto más sensible del diseño.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: Modelo de datos y Fusión regla 3
    *   Change: añadir el campo `deletedBaseRev` (el `rev` de la partida cuando se borró; borrar sube `rev` en 1). Regla: "una edición con `rev` mayor que `deletedBaseRev` gana y restaura la partida, con aviso; en otro caso gana la lápida". Quitar "con duda se conserva como copia" y la repetición. En el CUJ 3 sustituir la justificación por "un choque es raro pero posible si se olvida sincronizar".

### [R2-M3] [`egm-design`] - Severity: Major
*   **Affected Scope:** Fusión regla 4, "Función serverless" (purga), vocabulario.
*   **Discrepancy Description:** `deletedAt` lo escribe el cliente y el servidor lo compara con su reloj; un reloj desviado rompe los 30 días.
*   **Rationale:** Se afirma que la purga usa la hora del servidor.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: "Función serverless", `PUT`
    *   Change: "El servidor sustituye `deletedAt` por su propia hora la primera vez que ve la lápida. El `deletedAt` del cliente solo sirve para mostrar la papelera en local."

### [R2-M4] [`egm-design`] - Severity: Major
*   **Affected Scope:** Fusión regla 2 (copia de conflicto).
*   **Discrepancy Description:** El `editedBy` de la copia es el del aparato detector; al encontrarse, la regla 2 la trata como conflicto nuevo y puede dar "A (conflicto) (conflicto)".
*   **Rationale:** La idempotencia prometida no se cumple.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido; ya lo anticipó la etapa 5.
*   ***Proposed Edit:***
    *   Location: Fusión regla 2
    *   Change: la copia lleva `editedBy` derivado del hash (no del aparato detector). Dos copias con el mismo id son la misma partida (idempotente). Si el nombre ya termina en "(conflicto)", no se vuelve a añadir. Si la copia se edita y choca otra vez, aplica la regla normal sobre su propio id.

### [R2-M5] [`egm-design`] - Severity: Major
*   **Affected Scope:** "Ciclo de una sincronización" y "Motor de sincronización".
*   **Discrepancy Description:** No hay paso de confirmación: una edición hecha durante un `PUT` en vuelo puede marcarse sincronizada sin haberse enviado.
*   **Rationale:** Se perdería una edición en silencio.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: "Ciclo de una sincronización"
    *   Change: "Tras un `PUT` correcto se fija `syncedRev` al `rev` que se envió en esa petición (no al actual) y se guarda el ETag devuelto. Las ediciones hechas durante el envío siguen pendientes."

### [R2-M6] [`egm-design`] - Severity: Major
*   **Affected Scope:** "Función serverless", autenticación.
*   **Discrepancy Description:** El "límite de intentos por IP" no tiene dónde guardar el contador: las funciones no tienen estado y no se nombra almacén.
*   **Rationale:** Es el único control de fuerza bruta citado.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. No se añade otra pieza de infraestructura para un usuario único.
*   ***Proposed Edit:***
    *   Location: "Función serverless", Autenticación y Risks
    *   Change: quitar el límite por IP. Justificar con un token aleatorio de al menos 32 caracteres (adivinarlo no es viable) y la rotación por `SYNC_TOKEN`. Anotar que se puede añadir una regla de límite de tasa de la plataforma si hiciera falta (no verificado).

### [R2-M7] [`egm-design`] - Severity: Major
*   **Affected Scope:** `deleteGame`, purga, desactivación de la sincronización.
*   **Discrepancy Description:** Con la sincronización apagada (por defecto) nada purga las lápidas, y no se dice qué pasa con `syncedRev` al desactivar.
*   **Rationale:** Crecen el almacenamiento y las exportaciones JSON.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: "Cambios en el guardado local"
    *   Change: "Con la sincronización desactivada, cada arranque purga en local las lápidas de más de 30 días con el reloj local. Desactivar conserva `syncedRev`; al reactivar, una partida ausente en remoto sigue la regla 1 (se conserva y se vuelve a subir)."

### [R2-M8] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** Nota de alcance (criterios de salida), CUJ 2, fases.
*   **Discrepancy Description:** El CUJ 2 no está en ningún bloque; las fases 0 y 1 no se asignan; "cada bloque se entrega sin esperar a los otros" contradice que el bloque 2 sea requisito de activar la sincronización y que el criterio del bloque 1 exija dos aparatos sincronizando.
*   **Rationale:** El orden de entrega real no está declarado.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido; lo introduje yo en la resolución de M10a.
*   ***Proposed Edit:***
    *   Location: Nota de alcance
    *   Change: reescribir como: "Orden de entrega: fases 0 y 1 (preparación, necesarias para el bloque 1); bloque 2 (fase 6) antes de activar la sincronización; bloque 1 (fases 2 a 5); bloque 3 (fase 7) en cualquier momento tras la fase 1. Cada bloque se da por bueno por separado con su criterio, pero el criterio del bloque 1 se comprueba con la sincronización activada, para lo que el bloque 2 debe estar entregado. CUJ 2: bloque 2 (sin red) y bloque 1 (puesta al día)."

### [R2-M9] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** Nota de alcance (archivos no leídos), "Mejoras de uso en móvil y ordenador".
*   **Discrepancy Description:** El bloque 3 prescribe diseño (`Cell` memoizado, semántica de Tab y Escape, `aria-live`, pila de deshacer, flujo de captura) sobre archivos no leídos.
*   **Rationale:** El detalle está sin validar y mezcla implementación en la especificación.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: Nota de alcance y "Mejoras de uso"
    *   Change: marcar el bloque 3 como "intención provisional, a validar leyendo `BoardPanel`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast` y `boardImage` antes de implementarlo; afecta a los CUJ 6 y 8". Mover "`Cell` memoizado" y "`touch-action`" al plan detallado.

### [R2-M10] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** "Uso sin conexión", Risks, Open Questions.
*   **Discrepancy Description:** El Technical Plan precachea `dictionary.txt` y la fila de riesgo describe una precarga aparte; el arranque no está medido y "provisional" se repite sin umbral; falta declarar que `/api/*` no cae en el fallback SPA.
*   **Rationale:** Dos mecanismos distintos en el mismo documento.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. La propuesta elige el mecanismo de la fila de riesgo (precarga aparte) y es una decisión que puedes revertir: la instalación no espera 7,7 MB y la app muestra "disponible sin conexión" cuando termina.
*   ***Proposed Edit:***
    *   Location: "Uso sin conexión", Risks, Open Questions
    *   Change: "Precaché del shell y del worker; el diccionario se descarga aparte con `CacheFirst` y un estado visible ('disponible sin conexión'). Si se abre sin red antes de terminar esa descarga, la app dice que necesita red la primera vez." Un solo "provisional" con umbral: "se reabre si el arranque en frío en un móvil de gama media supera 5 s". Añadir "`/api/*` queda fuera del fallback SPA".

### [R2-M11] [`egm-design`] - Severity: Major
*   **Affected Scope:** Goals, CUJ 1, disparadores.
*   **Discrepancy Description:** "Menos de 10 s" no tiene mecanismo (no hay sondeo) ni intervalo definido; un aparato abierto en primer plano no verá la edición del otro.
*   **Rationale:** Objetivo no verificable tal como está escrito.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. Se acota el objetivo en lugar de añadir sondeo, que es más infraestructura.
*   ***Proposed Edit:***
    *   Location: Goals, CUJ 1
    *   Change: "La edición aparece en el otro aparato al abrir la app o al volver a enfocarla, con red, en menos de 10 s desde que se abre o se enfoca. Un aparato abierto en primer plano no se actualiza solo (no hay sondeo)." En el CUJ 1 sustituir "unos segundos" por esa condición.

### [R2-M12] [`egm-design`] - Severity: Major
*   **Affected Scope:** Nota de alcance, Goals, CUJ.
*   **Discrepancy Description:** Las "fases 0 a 7" y el "Verification Plan" solo se definen después de la línea 360.
*   **Rationale:** La especificación depende de contenido que el revisor de esta etapa no evalúa.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: Nota de alcance
    *   Change: "Las fases (0 a 7) y el Verification Plan se definen en la sección Detailed Implementation Plan, al final del documento." Sustituir referencias a números de línea por nombres de sección.

### [R2-M13] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** Modelo de datos, Risks, Alternativa E.
*   **Discrepancy Description:** "809 bytes medidos" no dice cómo se midió; 1.296 partidas supone 1 MB = 1.048.576 bytes sin declararlo; un lugar dice "unos pocos KB" y otro "decenas de KB" con la misma cifra.
*   **Rationale:** Cifras sin método ni unidad coherente.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido.
*   ***Proposed Edit:***
    *   Location: Modelo de datos
    *   Change: declarar el método una vez ("`JSON.stringify` de una partida sintética con las 225 casillas llenas, atril de 7 letras, un nombre de 15 caracteres, lápida y dos UUID; 1 MB = 1.048.576 bytes") y usar "decenas de KB con unas decenas de partidas" en los demás sitios.

### [R2-M14] [`egm-design`] - Severity: Major
*   **Affected Scope:** Decisiones de arquitectura, "Primera sincronización", "Función serverless".
*   **Discrepancy Description:** Se hedgea `ifMatch` pero se afirma sin salvedad que el `put` sin `allowOverwrite` falla si el Blob existe y que eso da `412`.
*   **Rationale:** Comportamientos de terceros presentados como hechos.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido: la documentación consultada cubre `allowOverwrite` por defecto, pero no se comprobó el código de error.
*   ***Proposed Edit:***
    *   Location: las tres secciones
    *   Change: marcar "el `put` de creación falla si el Blob existe" y su traducción a `412` como "no verificado" e incluirlos en la prueba previa que se exige antes de construir el resto.

### [R2-M15] [`egm-design`, `egm-style`] - Severity: Major
*   **Affected Scope:** Goal de "cambios secundarios de interfaz".
*   **Discrepancy Description:** Agrupa ancho máximo, barra lateral, "Mejor jugada" fija, renombrados, vocabulario y `catch {}` sin valor ni criterio.
*   **Rationale:** Objetivo cajón no verificable.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Válido. Propongo un punto de corte (1280 px, el breakpoint `xl`) que conviene que confirmes.
*   ***Proposed Edit:***
    *   Location: Goals
    *   Change: separar en objetivos con criterio: (a) "a partir de 1280 px de ancho el contenido pasa de `max-w-6xl` a `max-w-7xl` y la lista de partidas puede plegarse como barra lateral"; (b) "en móvil, 'Mejor jugada' queda fija en la parte inferior"; (c) "los botones y textos renombrados son los de la lista del plan"; (d) "ningún `catch {}` vacío queda en `gamesStore.ts`, `wordBlocklist.ts` ni `wordCandidates.ts`: los errores van al registro de Diagnóstico".

## Nit

### [R2-N1] - Severity: Nit
*   **Affected Scope:** Motor, disparadores (`pagehide`).
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El `keepalive` admite unos 64 KiB de cuerpo.
*   ***Proposed Edit:*** "Con 809 bytes por partida caben unas 80 partidas en un `keepalive`; si el documento es mayor, el push de `pagehide` se omite y se envía en el próximo arranque."

### [R2-N2] - Severity: Nit
*   **Affected Scope:** "Varias pestañas".
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Sin Web Locks o `BroadcastChannel` hay que seguir funcionando.
*   ***Proposed Edit:*** "Sin Web Locks o `BroadcastChannel`, cada pestaña sincroniza por su cuenta y la seguridad la da `If-Match`."

### [R2-N3] - Severity: Nit
*   **Affected Scope:** "Función serverless", guarda `409`.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** La "marca explícita" no tiene autor.
*   ***Proposed Edit:*** "La marca es la cabecera `X-Confirm-Bulk: 1`, que el cliente pone tras confirmar el usuario. Las lápidas purgadas por el servidor no cuentan."

### [R2-N4] - Severity: Nit
*   **Affected Scope:** CUJ 3.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El Given no da `rev` relativos y `rev` cuenta guardados.
*   ***Proposed Edit:*** Añadir al Given "el móvil acumuló 5 guardados y el ordenador 2", al Then "gana el móvil aunque el ordenador editó después" y la aclaración "`rev` cuenta guardados locales".

### [R2-N5] - Severity: Nit
*   **Affected Scope:** Nota bajo el diagrama.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** La frase sobre `useGames` no tiene relación con el diagrama.
*   ***Proposed Edit:*** Eliminar "`useGames` aparece como estado final tras la fase 1".

### [R2-N6] - Severity: Nit
*   **Affected Scope:** Disparadores y reintentos.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Dos "si falla" seguidos son ambiguos.
*   ***Proposed Edit:*** Separar: "Si falla el push de `pagehide`: queda pendiente. Si falla una sincronización normal: reintento con espera de 2, 8, 30 y 120 s, y 120 s como máximo".

### [R2-N7] - Severity: Nit
*   **Affected Scope:** `PUT` de `api/sync.ts`.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El `413` aparece en Risks pero no en la validación.
*   ***Proposed Edit:*** Añadir "un cuerpo de más de 1 MB responde `413`".

### [R2-N8] - Severity: Nit
*   **Affected Scope:** Alternativas L y M.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** La etiqueta de M no es un rechazo y la afirmación de L no tiene fuente.
*   ***Proposed Edit:*** M: "Parcialmente adoptada: ..." L: añadir "(no verificado)" a "no está pensada para llamadas desde la propia app".

### [R2-N9] - Severity: Nit
*   **Affected Scope:** CUJ 4.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El Then mezcla tres resultados.
*   ***Proposed Edit:*** Dejar en el CUJ 4 solo borrado y restauración desde la papelera, y mover la edición sin conexión frente a un borrado a un **CUJ 9** nuevo; añadir el CUJ 9 al criterio de salida del bloque 1.

### [R2-N10] - Severity: Nit
*   **Affected Scope:** Overview.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** "No usa servidor ni claves" choca con los recursos externos.
*   ***Proposed Edit:*** "no guarda datos en ningún servidor ni usa claves de API (carga recursos estáticos de dominios externos)".

### [R2-N11] - Severity: Nit
*   **Affected Scope:** The Problem.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Dato sin fuente.
*   ***Proposed Edit:*** "En el móvil, donde el autor dice jugar más (dato del autor)".

### [R2-N12] - Severity: Nit
*   **Affected Scope:** The Problem (párrafo final).
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Repite el Overview y sugiere corrección completa.
*   ***Proposed Edit:*** Acortar a la solución y decir "se abordan las dependencias de red y los problemas de uso listados en los Goals".

### [R2-N13] - Severity: Nit
*   **Affected Scope:** Goals.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El absoluto contradice los fallos de cuota y la expulsión del navegador.
*   ***Proposed Edit:*** "Nunca perder una edición en silencio al fusionar dos versiones."

### [R2-N14] - Severity: Nit
*   **Affected Scope:** Vocabulario, Goals, Fusión regla 4.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El plazo es provisional y lo aplica el servidor.
*   ***Proposed Edit:*** En todas las menciones: "30 días (provisional, aplicado por el servidor)" la primera vez y "el plazo de lápidas" después.

### [R2-N15] - Severity: Nit
*   **Affected Scope:** Seguridad, rendimiento y despliegue.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** "Coste despreciable" sin cifra.
*   ***Proposed Edit:*** "El volumen es de decenas de KB; el coste en Vercel no se calculó (no verificado)."

### [R2-N16] - Severity: Nit
*   **Affected Scope:** Alternativas A y D.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** "Ya resueltas", "más superficie" y "frágil en iOS" sin cuantificar ni fuente.
*   ***Proposed Edit:*** Sustituir por afirmaciones concretas o marcarlas "(no verificado)": A "añade un SDK y reglas de acceso por usuario"; D "no ofrece sincronización automática desde una página web (no verificado en iOS)".

### [R2-N17] - Severity: Nit
*   **Affected Scope:** Alternativa G.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** "Cuota gratuita amplia" sin cifra.
*   ***Proposed Edit:*** Quitar esa expresión y mantener la marca "no verificado" del tiempo de propagación.

### [R2-N18] - Severity: Nit
*   **Affected Scope:** CUJ 6 y 7.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** Faltan teclas por paso y la condición de prueba de "visible sobre el teclado".
*   ***Proposed Edit:*** CUJ 7: pestañas con flechas, lista de partidas con flechas y Enter, F2 para renombrar, Supr para borrar con confirmación. CUJ 6: "la casilla activa queda completamente visible con el teclado del sistema abierto, en un móvil de 360 px de ancho".

### [R2-N19] - Severity: Nit
*   **Affected Scope:** Goals.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El cambio de pistas y botones de captura en móvil no figura en los objetivos.
*   ***Proposed Edit:*** Añadir "En móvil, la importación de captura muestra pistas propias del aparato y botones en pantalla para vaciar una casilla y poner un comodín" y citarlo en el CUJ 8.

### [R2-N20] - Severity: Nit
*   **Affected Scope:** Terminología.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** "Aparato"/"dispositivo" y chip/franja/aviso/toast nombran lo mismo.
*   ***Proposed Edit:*** Usar "aparato" siempre. Definir una vez: "chip" (indicador junto a la lista), "franja" (barra persistente de error con "Reintentar"), "aviso" (mensaje temporal).

### [R2-N21] - Severity: Nit
*   **Affected Scope:** Goals, diagrama, motor, Risks.
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** La lista de 7 estados se repite cuatro veces con textos distintos.
*   ***Proposed Edit:*** Una sola lista canónica en Goals (estados y texto: "Desactivado", "Sin token", "Sincronizando", "Sincronizado hace X", "Sin red · N pendientes", "Token rechazado", "Error") y que el resto remita a ella.

### [R2-N22] - Severity: Nit
*   **Affected Scope:** Risks (expulsión de almacenamiento).
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** El aviso es genérico, sin disparador ni lugar.
*   ***Proposed Edit:*** "Al activar la sincronización se pide almacenamiento persistente (`navigator.storage.persist()`), si el navegador lo admite; si no se concede, el panel Sincronización muestra el aviso."

### [R2-N23] - Severity: Nit
*   **Affected Scope:** Fusión (uso en restauración).
*   ***AI Suggestion:*** **PROPOSE FIX**
*   ***Justification:*** No se dice qué lado es local y cuál remoto al restaurar.
*   ***Proposed Edit:*** "Al restaurar una copia, 'local' son las partidas del aparato y 'remoto' el contenido de la copia importada."

================================================================================

# Etapa 9: hallazgos de preparación para implementar (ronda 1)

**Status (etapa 9):** resolved ("auto accept" el 2026-11-22: aplicados los 52 arreglos PROPOSE FIX; N19 descartado). Notas: la especificación cambió en B2 (sin `deletedBaseRev`), M15/B5 (sin `pushOnly`/`full`) y B1/M17 (fase 7 diferida y posterior a la 4); el plan se reescribió de la fase 0 a la 7 y su estado del código se reconcilió con `bef3b54`, que ya contiene una implementación previa (por ejemplo, el id de la copia usa hash). Sin re-auditar todavía.
**Target:** `docs/designs/anagrama-sync-y-uso-movil.md` (líneas 376-630, Detailed Implementation Plan). Los identificadores B1…, M1…, N1… son los de `implementation_readiness_report.md`.
**Resumen de categorías:** 52 PROPOSE FIX (5 Blocker, 25 Major y 22 Nit), 1 DECLINE (N19) y ningún ESCALATE ni CONTEST. Comprobé contra el código lo que podía: B5 es cierto (`Importar` está en `components/GameSwitcher.tsx`, no en `ScreenshotImport.tsx`), `max-w-6xl` está en `App.tsx:512`, la interfaz de Mantenimiento está en `components/BoardPanel.tsx` y `tsconfig.json` tiene `types: ["node"]` y no incluye `api/`.

**Tres propuestas cambian la especificación, no solo el plan, y conviene que las mires antes de aceptar en bloque:**
*   **B2:** sustituir la regla de borrado frente a edición (`deletedBaseRev`) por "gana la edición si ese lado tiene cambios pendientes", con `rev = max(rev de ambos) + 1` al restaurar. Es el arreglo que el revisor de la etapa 8 propuso y que se aceptó como compromiso pendiente; aquí pasa a ser Blocker porque los aparatos no convergen. Elimina el campo `deletedBaseRev`.
*   **M15 y B5:** eliminar el modo `pushOnly`/`full` y el paso de "ocultar Exportar/Importar". La activación es manual (ordenador, revisar el documento remoto, móvil) y la copia JSON se queda siempre en el menú "Copia de seguridad".
*   **B1:** marcar la fase 7 como diferida: no entra en la puerta de implementación de este plan y se completa después de leer los componentes. Es compatible con tu decisión de mantener un solo documento, pero el plan deja de prometer que la fase 7 está lista.

## Blocker

*   **B1 (PROPOSE FIX).** Fase 7 provisional y no construible. *Edición:* título "Fase 7: diferida (intención provisional)"; quitar de la tabla la dependencia "en cualquier momento tras la 1" (ver M17); añadir la lista de decisiones pendientes tras leer `BoardPanel`, `ScrabbleBoard`, `Results`, `WordInput`, `BoardBuilder`, `Overlay`, `Toast` y `boardImage` (tecla de cambio de dirección, estado de un paso de deshacer, detección de Mac, barra lateral, `/` y Alt+N, aviso de duplicado, qué estados llevan forma o texto); declarar que el contenedor `max-w-6xl` está en `App.tsx:512` (no en `BoardPanel.tsx`); la fase 7 no se implementa hasta completar esa lista y tener pruebas para `useBoardHistory`.
*   **B2 (PROPOSE FIX).** Convergencia tras borrar y restaurar. *Edición (especificación y plan):* regla 3 pasa a "si un lado tiene cambios pendientes (`rev > syncedRev`) y el otro una lápida, gana la edición: la partida se restaura con `rev = max(rev de ambos) + 1` y se avisa; en otro caso gana la lápida". Con `rev` igual y contenido distinto (incluida lápida frente a no lápida) se aplica la regla de choque (empate por `editedBy`). Quitar `deletedBaseRev` del modelo de datos, del documento remoto, del CUJ 9, del archivo 8 y del archivo 9. Añadir a `tests/sync.mjs`: ediciones asimétricas (el ordenador edita 3 veces y borra, el móvil edita una vez), convergencia de ambos aparatos tras restaurar y `rev` igual con contenido distinto.
*   **B3 (PROPOSE FIX).** Puerta de la 2b invertida. *Edición:* "Se detiene el diseño si ninguna de las dos subidas simultáneas recibe el error, o si las dos lo reciben". La creación sin `allowOverwrite` que no falla no detiene el diseño: se anota el resultado y la primera sincronización se apoya en el reintento de la L228.
*   **B4 (PROPOSE FIX).** Tailwind. *Edición (archivo 27):* trasladar la configuración inline completa de `index.html:15-66`: colores `ink`, `accent`, `aqua`, `brand-text` y `brand-subtle`, `fontFamily`, `borderRadius.4xl`, `animation` (`fade-in`, `rise`, `pop`, `float`) y `keyframes`. `content`: `./index.html`, `./*.{ts,tsx}`, `./components/**/*.{ts,tsx}`, `./hooks/**/*.{ts,tsx}` y `./services/**/*.{ts,tsx}`.
*   **B5 (PROPOSE FIX).** Renombrado mal atribuido. *Edición:* el menú "Copia de seguridad" con las etiquetas "Exportar copia" y "Restaurar copia" se hace en `components/GameSwitcher.tsx` (archivo 20, fase 4); el archivo 36 solo renombra "Leer captura" en `BoardPanel.tsx`; se quita `ScreenshotImport.tsx` de ese archivo. Quitar el paso de "ocultar Exportar/Importar" (archivo 25 y especificación L278): la copia JSON queda siempre en el menú.

## Major

*   **M1 (PROPOSE FIX).** La fase 2 rompe la fase 1. *Edición:* nuevo archivo de la fase 2 "`hooks/useGames.ts`, `App.tsx` (Modify)": `updateActive` pasa origen `edit`, `select` pasa `usage`, `useGames` llama a `purgeDeleted` y a `initGames({ createDefault })`. `origin` es obligatorio en `saveGame`.
*   **M2 (PROPOSE FIX).** Fase 1 mal delimitada. *Edición:* añadir a la fase 1 `components/BoardPanel.tsx`, `components/GameSwitcher.tsx` y `components/Toast.tsx` con el nuevo contrato de props (`BoardPanel` recibe `activeGame` y `onChange(patch)` en lugar de los tres setters y `onClear`); asignar a `useGames` `persistGame`, `saveStatus`, `pendingWrites`, `failedGames`, el reintento de exportación, `handleImportGames`, el respaldo `createGame('Partida 1')` y el incremento de `uses`; `useToast` conserva los 3 s y los 9 s del aviso con acción como parámetro.
*   **M3 (PROPOSE FIX).** APIs sin definir. *Edición (fase 1):* `useGames` devuelve `{ games, activeGame, updateActive, select, create, rename, remove, undoRemove, refresh }`; `refresh()` relee el almacenamiento (lo usa `useSync`). `useToast` expone `show(message, { action?, durationMs?, persistent? })`. `onRemoteAdopted` se crea en la fase 4 con `useSync` (no en la fase 1) y lo dispara `useSync` tras `refresh()` cuando cambia la partida activa.
*   **M4 (PROPOSE FIX).** `syncMerge` con valores sin definir. *Edición:* id de la copia = `<id original>-conflicto-<rev perdedora>-<editedBy perdedora>` y `editedBy` de la copia = el de la perdedora (cadenas, sin hash ni `crypto.subtle`; función síncrona y pura). "Contenido distinto" = `name`, `board`, `rack` o `blanks` distintos (metadatos fuera). Retorno: `{ toLocal, toRemote, conflicts, notices }`. Las copias se guardan con origen `copy` (`rev = 1`, `syncedRev = 0`, sin sumar). `rev` ausente se lee como 1 dentro de `merge`. Incluir la excepción de la regla 1 (`syncedRev > 0` ausente en remoto y sin lápida: se conserva y se vuelve a subir).
*   **M5 (PROPOSE FIX).** Purga local con sincronización activa. *Edición:* al terminar una sincronización correcta, el motor elimina las lápidas locales que ya no están en el documento remoto (`purgeDeleted` con la lista del remoto); añadirlo a la lista de pruebas y a la cobertura.
*   **M6 (PROPOSE FIX).** Firma de `saveGame`. *Edición:* `origin` obligatorio. Llamadores: `persistGame` y `restoreBackup`, `edit`; `runInit`, `edit` solo para la partida que crea (con `createGame` fijando `rev = 1`); `edit` calcula `rev = (guardada.rev ?? 1) + 1`. `usage` lee el registro guardado y mezcla solo `uses` y `lastUsedAt`. `saveGame` devuelve `{ notice?: string }` para el aviso de `remote`.
*   **M7 (PROPOSE FIX).** Transacción y respaldo. *Edición:* helper nuevo `txReadWrite` en `gamesStore.ts` (lectura, cálculo y escritura en una transacción `readwrite`); en la ruta `localStorage` la lectura-modificación-escritura se hace sin `await` entre ambas (un solo turno de ejecución). Las pruebas de Node cubren la ruta `localStorage`; la transacción de IndexedDB se comprueba a mano con dos pestañas (ya figura en el Verification Plan).
*   **M8 (PROPOSE FIX).** `listGames`, `snapshot` y lápidas. *Edición:* función interna `listAllGames()` (con lápidas) que usan `snapshot`, `saveGame` y `deleteGame` en la ruta de respaldo; `listGames()` pública filtra. `purgeDeleted` la llama `useGames` al arrancar.
*   **M9 (PROPOSE FIX).** `writeFallback` y los `catch`. *Edición:* regla única: en rutas de escritura (`saveGame`, `deleteGame`, `writeFallback`) se registra y se relanza (la prueba de `tests/persistence.mjs:49-52` y el aviso de error de `App.tsx` se mantienen); en rutas de lectura (`JSON.parse`, `getItem`) se registra y se devuelve el valor por defecto.
*   **M10 (PROPOSE FIX).** `runInit` y primera sincronización pendiente. *Edición:* `initGames({ createDefault })` lee `firstSyncPending` de `anagrama.sync.v1` (lo fija el motor al activar la sincronización); `useGames` llama a `initGames({ createDefault: !firstSyncPending })`; tras la primera sincronización, `refresh()` y, si sigue sin haber partidas, crea "Partida 1".
*   **M11 (PROPOSE FIX).** `diagnostics.ts`. *Edición:* memoria más copia en `localStorage` bajo `anagrama.diagnostics.v1`; entrada `{ at, source, message }`; si escribir falla (por ejemplo, cuota llena) se ignora sin lanzar.
*   **M12 (PROPOSE FIX).** Dependencias de la 2b. *Edición:* la fase 2b añade `@vercel/blob` como `devDependency`, usa `.env.local` (ya ignorado por `*.local`) con `BLOB_READ_WRITE_TOKEN`, obtiene el ETag con `head()` y se mueve el `.gitignore` a esta fase; la tabla pasa a "depende de 0, 1 y el alta del almacén" y se ejecuta antes de la fase 2.
*   **M13 (PROPOSE FIX).** Contrato HTTP. *Edición:* `PUT` correcto: `200` con cabecera `ETag` y cuerpo `{ "etag": ... }`; el `If-Match` lleva el ETag tal como lo devolvió el servidor (con comillas); `PUT` sin `If-Match` con Blob existente, y `PUT` con `If-Match` sin Blob: `412`; otros métodos: `405`; `pull` devuelve `{ status: 'notModified' }` ante `304`; el límite de 1 MB se comprueba con `content-length` y con la longitud real del cuerpo; la validación del servidor es superficial (cada partida con `id` texto y `rev` número) y el cliente aplica `isValidGame`; un fallo al escribir `prev.json` no impide el `PUT`; el `400` lleva `{ error: 'schema' | 'body' }` y solo `schema` muestra "Actualiza la app". Firma única `pull(etag?)` y `push(doc, etag?)` (corregir también la especificación L218). `tsconfig.json`: añadir `api` a `include`. La constante de 30 días vive en `services/sync/constants.ts`, importada por cliente y servidor, etiquetada "provisional".
*   **M14 (PROPOSE FIX).** Motor. *Edición:* ciclo de un solo vuelo; un disparador durante un ciclo marca "repetir" y el temporizador de 2 s se reinicia con cada edición; `413` y `400` pasan a `error` con código; el motor recibe `{ storage, now, setTimeout, events, transport, games }` inyectables; se persisten `token`, `enabled`, `firstSyncPending`, ETag, `lastSyncedAt` y `lastError` (`deviceId` se conserva al desactivar); copia previa en `anagrama.preSyncBackup.v1`; las pruebas nombran los seis estados.
*   **M15 (PROPOSE FIX).** `pushOnly`/`full`. *Edición (especificación L220, L277 y plan archivos 15, 16, 25):* se elimina el modo. Activación manual: activar en el ordenador, revisar el documento remoto, activar en el móvil. Se mantiene la marcha atrás de apagar el interruptor.
*   **M16 (PROPOSE FIX).** Piezas de interfaz sin responsable. *Edición:* archivo nuevo `components/SyncErrorBanner.tsx` (franja con "Reintentar"); la pantalla "Diagnóstico" es una sección de `SyncPanel` (últimos 50 errores, última sincronización, pendientes y "Copiar diagnóstico"); "Sincronización" es siempre un diálogo; el archivo 25 pasa a una subsección "Procedimiento de activación" (no es un archivo) sin la marcha atrás duplicada.
*   **M17 (PROPOSE FIX).** Solapamiento 4-7. *Edición:* la fase 7 se entrega después de la fase 4 (tabla, orden de entrega y especificación L25); el deshacer tras "Aplicar a la partida" usa `useBoardHistory` (guarda una instantánea antes de aplicar) y el aviso de `useToast` solo ofrece la acción.
*   **M18 (PROPOSE FIX).** PWA. *Edición:* `index.tsx` registra el service worker con `registerSW` de `virtual:pwa-register` y `App.tsx` monta `UpdateBanner`; `tsconfig.json` añade `vite-plugin-pwa/client` a `types`; los tres iconos usan la inicial "A" sobre `#080b14` (el autor aporta el arte o se genera con una herramienta externa, sin dependencia nueva); `globPatterns` incluye `**/*.{js,css,html,woff2,svg,png}` y `additionalManifestEntries` añade `/services/anagramSolver.ts`; la regla `CacheFirst` apunta a la URL `/services/dictionary.txt`; "worker" siempre significa el fichero `anagramSolver.ts` (Web Worker), el service worker se nombra así; la descarga aparte se marca provisional como en Open Questions.
*   **M19 (PROPOSE FIX).** Dependencias. *Edición:* instalar con `npm install --save-exact` y dejar las versiones en `package.json` y `package-lock.json` (ambos en las listas de las fases 2b, 3 y 6); `@vercel/blob` en la 2b y 3, `@vercel/node`, `vite-plugin-pwa`, `tailwindcss` 3.4.x, `postcss` y `autoprefixer` en `devDependencies`; `@fontsource/*` y `@fortawesome/fontawesome-free` en `dependencies`.
*   **M20 (PROPOSE FIX).** Puerta de la fase 0. *Edición:* commit 1 con rutas explícitas (`App.tsx`, `components/GameSwitcher.tsx`, `services/gamesStore.ts`, `tests/persistence.mjs`); commit 2 con los README y `docs/designs/`; los informes (`concepts_brief.md`, `design_draft.md`, `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `goldfish_review_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`) se mueven a `docs/reviews/` y van en un tercer commit, nunca con `git add -A`. Los archivos de documentación de las fases 5 y 7 incluyen `public/services/README.md` y `data/README.md`.
*   **M21 (PROPOSE FIX).** Archivos no leídos. *Edición:* lista única de lectura previa con nombres completos (`Results.tsx`, `WordInput.tsx`, `BoardBuilder.tsx`) que añade `ScrabbleBoard.tsx`, `wordCandidates.ts`, `glyphs.ts` e `index.css`; cada archivo se lee antes de la fase en la que se modifica (`wordCandidates.ts` antes de la 4, `ScrabbleBoard.tsx` antes de la 7).
*   **M22 (PROPOSE FIX).** Mantenimiento. *Edición:* la interfaz de Mantenimiento está en `components/BoardPanel.tsx`; el archivo 36 pasa a modificar `BoardPanel.tsx` para plegarla como opción avanzada, y el archivo 6 deja de decir que está en `App.tsx`.
*   **M23 (PROPOSE FIX).** Atajos. *Edición:* el input oculto del tablero cuenta como campo de texto salvo para Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, que siguen activos.
*   **M24 (PROPOSE FIX).** Alcance sin origen. *Edición:* añadir a Goals: diálogos con `role="dialog"`, foco atrapado y devuelto, estados de captura que no dependen solo del color y textos de 11 px con contraste de al menos 4,5:1. Quitar "lista de jugadas sin scroll anidado". El aviso del ⌘V solo usa `navigator.platform` para elegir entre Ctrl y ⌘.
*   **M25 (PROPOSE FIX).** Verificación. *Edición:* la 2b espera "exactamente una de las dos subidas recibe `BlobPreconditionFailedError`" y "tras escribir, `get` con `useCache: false` devuelve el ETag nuevo"; los códigos HTTP se comprueban en la integración con `api/sync.ts`; los CUJ 1 a 5 y 9 se prueban en dos aparatos y los 6 a 8 en la fase 7, en un solo aparato; la medición de arranque en frío pasa a la fase 6 (móvil del autor, umbral 5 s); "todas las ramas" se sustituye por la lista de casos de `syncMerge` y del motor, sin herramienta de cobertura.

## Nit

*   **N1 (PROPOSE FIX).** La fase 6 pasa a depender de la fase 1 (`App.tsx` se toca en ambas).
*   **N2 (PROPOSE FIX).** `.gitignore` es Modify; las líneas son `.env*`, `!.env.example` y `.vercel`.
*   **N3 (PROPOSE FIX).** Quitar el `<link rel="manifest">` manual (lo inyecta el plugin) y completar el manifest con `start_url`, `scope`, `background_color` y `lang`.
*   **N4 (PROPOSE FIX).** Repartir las pruebas por fase: fase 1 (comprobación manual de partidas), 6 (`dist/` sin dominios y arranque en frío), 7 (pruebas de `useBoardHistory` en Node y comprobaciones manuales); `buildBackup` descarta `syncedRev`, `lastUsedAt`, `rev` y `editedBy` y conserva `uses`.
*   **N5 (PROPOSE FIX).** Quitar de la introducción del plan la frase de historial de revisión.
*   **N6 (PROPOSE FIX).** La puerta de la fase 0 cita los cuatro archivos sin confirmar y quita "sesión anterior".
*   **N7 (PROPOSE FIX).** "Puerta" solo para la 2b; la fase 0 es "requisito previo".
*   **N8 (PROPOSE FIX).** "la usan la fase 4 y la 7".
*   **N9 (PROPOSE FIX).** `lastUsedAt` entra en la validación de `isValidGame` y en la tabla del README (campo solo local).
*   **N10 (PROPOSE FIX).** Unificar "una sola copia previa" en una frase.
*   **N11 (PROPOSE FIX).** Reformular el pie: "Solo en este aparato" cuando el estado es `disabled` y "Sincronizado" en los demás; el texto actual no menciona la red.
*   **N12 (PROPOSE FIX).** Fusionar los archivos 24 y 37 de documentación en un archivo por fase.
*   **N13 (PROPOSE FIX).** Quitar la "marcha atrás" repetida del procedimiento de activación.
*   **N14 (PROPOSE FIX).** Criterio de las capturas del cambio de Tailwind: el autor valida sin diferencias visibles las pantallas de los CUJ 6 y 7.
*   **N15 (PROPOSE FIX).** Descrito en M9.
*   **N16 (PROPOSE FIX).** Citar `GameSwitcher.tsx:81` para el recorte de 40 caracteres; "mínimo 44 px"; mencionar `tabpanel` y la región `aria-live` de dirección.
*   **N17 (PROPOSE FIX).** La comprobación de `dist/` incluye `fonts.gstatic.com` y los `preconnect`; "las cifras de `tests/regresion.mjs`" = las del `npm test` actual.
*   **N18 (PROPOSE FIX).** Inspeccionar `rev` en la pestaña Application de las herramientas del navegador; sacar la acción correctiva del paso de medición; "consola del navegador" en lugar de "de Chrome", incluyendo Safari de iOS.
*   **N19 (DECLINE).** Las etiquetas en inglés (Type / Scope, Proposed Changes, Given/When/Then) son las de la plantilla de EGM, y las etapas posteriores las buscan por nombre.
*   **N20 (PROPOSE FIX).** Corregir el archivo 3: `restoreBackup` añade "(importada)" cuando el nombre entrante ya existe, no cuando el id choca.
*   **N21 (PROPOSE FIX).** El archivo 21 pasa a "añadir `role="alert"` para errores y un modo persistente" (ya tiene `role="status"` y `action`).
*   **N22 (PROPOSE FIX).** `tests/sync.mjs` usa el patrón de bundle con esbuild de `tests/persistence.mjs`, y los disparadores `visibilitychange`/`online` se prueban con la fuente de eventos inyectable de M14.
*   **N23 (PROPOSE FIX).** Fase 0: `byRecent` y el desempate de `sortByUsage` pasan a `lastUsedAt ?? updatedAt`, y abrir y renombrar dejan de fijar `updatedAt` (en `App.tsx:363` y `:426`).
