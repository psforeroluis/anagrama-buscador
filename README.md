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
npx tsc --noEmit
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
