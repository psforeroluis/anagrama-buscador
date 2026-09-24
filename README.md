# Anagrama — buscador de palabras

Aplicación web local para buscar anagramas y patrones, gestionar partidas y
calcular jugadas sobre un tablero de 15 × 15. El cálculo se realiza en un Web
Worker y no requiere servicios externos ni claves de API.

## Desarrollo

Requiere una versión reciente de Node.js.

```bash
npm install
npm run dev
```

La aplicación queda disponible normalmente en `http://localhost:3000`.

## Comprobaciones

```bash
npm test
npm run build
npm run typecheck
```

Las partidas y plantillas aprendidas se guardan en IndexedDB, con
`localStorage` como respaldo. Desde la propia interfaz se puede descargar e
importar una copia de seguridad en JSON.

En el panel **Mantenimiento** del tablero se pueden revisar todas las palabras
visibles. Las desconocidas quedan como altas pendientes y las palabras vetadas,
como bajas pendientes. Ambas listas se exportan por separado para actualizar el
diccionario principal. Las altas no intervienen en las búsquedas y las bajas
siguen vetadas hasta que la comprobación confirme que el diccionario publicado
ya contiene los cambios.

Las pruebas incluyen el motor y regresiones de persistencia: escrituras simultáneas,
recuperación tras errores, respaldo al fallar IndexedDB y restauración de atriles.
La interfaz muestra el estado del guardado; la exportación espera a las escrituras pendientes.

La lista de mantenimiento del 6 de septiembre está en
`data/dictionary-maintenance-2026-09-06.json`. Sus cinco altas ya están en el
diccionario y sus 123 bajas ya están excluidas; `npm test` verifica ambos grupos
contra el motor. «taoiares» sigue pendiente de validar y no entra en las búsquedas.
