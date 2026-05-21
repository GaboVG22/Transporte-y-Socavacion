# Transporte de Sedimentos y Socavación

Aplicación web estática para análisis preliminar de:

- Modelación hidráulica tabular por secciones.
- Arrastre de sedimentos con Meyer-Peter-Müller (MPM).
- Socavación generalizada con método de Neill.
- Socavación generalizada con método de Lischtvan-Levediev.
- Socavación local tipo Bormann-Julien para descarga/umbral.
- Variación temporal, aporte sólido, acorazamiento simplificado y frontera móvil.

## Uso local

Abre `index.html` en el navegador. No requiere instalación.

## Publicación en GitHub Pages

1. Crea un repositorio nuevo.
2. Sube todos los archivos de esta carpeta a la raíz del repositorio.
3. En GitHub entra a **Settings > Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. En **Branch**, selecciona `main` y carpeta `/root`.
6. Guarda y espera la URL pública.

No usa npm, Vite, React, node_modules ni build.

## Estructura

- `index.html`: interfaz principal.
- `styles.css`: estilos.
- `app.js`: motor de cálculo.
- `manifest.json`: metadatos PWA.
- `sw.js`: service worker simple para uso offline.
- `assets/icon.svg`: ícono.
- `.nojekyll`: evita procesamiento Jekyll en GitHub Pages.

## Flujo recomendado

1. Seleccionar cauce, condición y período de retorno.
2. Cargar un cauce de ejemplo o pegar resultados hidráulicos desde HEC-RAS/Excel.
3. Revisar granulometría: D50, D84, D90 y Dm.
4. Calcular resultados.
5. Revisar tablas, gráficos, informe técnico y frontera móvil.
6. Exportar CSV, HTML o JSON.

## Advertencia técnica

La herramienta está diseñada para revisión conceptual y comparación de escenarios. Para diseño definitivo se debe validar con topografía, hidrología, granulometría, rugosidad calibrada y modelación hidráulica/sedimentológica especializada.
