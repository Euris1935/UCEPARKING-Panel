# Changelog / Documentación de Cambios: Módulo de Reportes

Este documento resume todas las mejoras, resoluciones de errores y nuevas funcionalidades implementadas en el módulo de reportes, tanto en la base de datos, backend y frontend del panel UCE Parking.

---

## 1. Resolución de Errores de Base de Datos y Memoria
- **Error Constraint `persona_id`**: Los reportes no se podían guardar al crear porque violaban la llave foránea con la tabla `personas`. 
  - *Solución*: Se actualizó el controlador `generarYGuardar` (`reports.controller.js`) para validar automáticamente el token JWT del usuario, buscar su ID, recuperar el `persona_id` nativo asociado y utilizarlo al hacer el INSERT en la base de datos `reportes`.
- **Desbordamiento de Memoria (JSON Truncation)**: Se impedía guardar reportes largos (ej. de un mes) porque la columna `Datos_Adjuntos_Ruta` tenía poco espacio y causaba crasheos.
  - *Solución*: En `reports.services.js` se implementó una lógica de "seguridad" que guarda una versión minificada de los datos junto con el rango de fechas exacto (el periodo de búsqueda). De esta manera, el listado de reportes e historial no estalla ni consume ancho de banda y la aplicación funciona fluidamente.

## 2. Descarga Dinámica Transaccional (Live Data Processing)
- Anteriormente el botón de abrir reportes no servía. Ahora, al clicar el botón de **Descargar**, el Frontend emite un "fetch" con el token de seguridad hacia la ruta del Backend `GET /api/reports/:id/download`.
- El Backend utiliza el ID del reporte para recuperar su metadata, recarga la información real base de datos a ese instante de forma segura y genera el documento a ser entregado.

## 3. Generación y Diseño de Documentos Excel (.xlsx)
- Se sustituyó la renderización por PDFs limitados por una funcionalidad nativa estandarizada usando la librería **`exceljs`** del lado del Backend.
- Se programó un servicio dedicado (`excel.generator.js`) encargado de crear y construir un "libro" (workbook) formateándolo instantáneamente.
- **Diseños Estéticos Automáticos**: Los reportes emitidos en Excel vienen con fondos institucionales en las cabeceras, redimensionamiento adaptativo pre-calculado del ancho de las celdas, fuentes y cursivas.
- **Recepción en Pantalla**: En `Reportes.jsx` (Frontend) se programó un `Blob` que descarga el stream bytes directo del Backend y auto-desencadena la ventana de descarga en el navegador con el nombre "reporte_general_[ID].xlsx".

## 4. Nuevo Criterio de Reportes: "EVENTOS" (Logs Técnicos)
- Se analizó la base de datos conectando con la tabla real del motor/sensores para reflejar su actividad a los administradores.
- **Backend**: Se creó el query `getReporteEventos` en el servicio que arrastra el ID del log, Fecha y Hora y tipo de fallo o éxito tecnológico. Dependiendo de si se elige Evento u Ocupación, el Backend determina dinámicamente qué Excel crear.
- **Frontend**: En el Panel en la vista de Reportes (`Reportes.jsx`), el menú desplegable ha sido ampliado para incluir la opción **"Eventos (Registro de actividad de hardware/sistema)"**. Al descargas este formato, el Excel trae cabeceras dedicadas a este tipo de información técnica en vez de un balance financiero.

---
**Ramas de Git Afectadas y Actualizadas:**
* Panel UI: `feature/excel-reports`
* Panel Backend API: `feature/excel-reports`
