# Estadísticas agrícolas

Las pestañas Rinde, Siniestros y Productividad usan la empresa seleccionada y filtros propios: una o varias campañas, ciclo estacional, grano, lote, época de siembra, ciclo del cultivo y variedad de semilla. El ciclo inicial es Verano. Silos y almacenamiento y Distribución conservan sus filtros de fechas.

## Fuentes y acceso

`GET /api/estadisticas/agricolas?empresaId=...` consulta lotes, planificaciones, siembras, cosechas y siniestros. La API exige pertenencia activa a la empresa y rol Gerente o Encargado; Admin conserva su acceso interno. No modifica registros ni requiere migraciones. Los siniestros se vinculan por ID de siembra, nunca por el nombre incremental.

El repositorio devuelve datos de la empresa. `estadisticasAgricolas.js` concentra los cálculos comprobables y `EstadisticasAgricolas.jsx` presenta filtros, gráficos y tablas. No se agregan dependencias: se utilizan HTML/CSS y Leaflet, ya presente en el proyecto.

## Rinde

- Solo cosechas finalizadas con hectáreas positivas y resultado informado.
- Rinde húmedo ponderado = suma de kg registrados / suma de ha cosechadas.
- Rinde seco ponderado = suma de (rinde seco × ha) / suma de ha con rinde seco informado.
- Un resultado ausente no se trata como cero. Se informa cuántas cosechas quedan excluidas.
- Producción total usa los kg registrados, sin ajuste de humedad. La torta de participación por grano usa las hectáreas de las cosechas finalizadas con superficie positiva; su tabla muestra esas ha, los kg registrados sin ajuste de humedad y el rinde promedio ponderado por superficie según la base seleccionada. Los kg o rindes faltantes se muestran como "Sin datos", sin convertirlos en cero.
- Los rankings comparan dentro del mismo grano. Los cruces por época, ciclo y variedad son descriptivos: no demuestran que una semilla o época cause un mayor rendimiento. Se muestran superficie y cantidad de lotes como contexto.

## Siniestros

La unidad de análisis es lote + campaña + ciclo estacional. Las resiembras y registros deshabilitados forman parte del historial.

- Índice de siniestralidad = unidades con algún siniestro / unidades con siembra × 100.
- Incidencia por causa = unidades con esa causa / unidades con siembra × 100. Una unidad puede tener varias causas: estos porcentajes no se suman.
- Cada unidad se cuenta una vez por causa, aunque existan registros manuales y automáticos del mismo tipo.
- Clasificación exclusiva según el destino del cultivo afectado, independientemente del alcance Parcial/Total de la recorrida: pérdida total si la última siembra o resiembra quedó deshabilitada por motivo Siniestro, incluso si hubo una resiembra previa; con resiembra si existe una etapa de resiembra y la cadena no terminó en pérdida total; afectado sin resiembra en los demás casos. Así, una recorrida de alcance Total puede quedar en afectados sin resiembra si el cultivo sigue en pie. Los filtros seleccionan las unidades y los eventos mostrados, pero la etapa final y la existencia de una resiembra se consultan en toda la cadena del lote, campaña y ciclo, incluso si cambió el grano o la variedad.
- Las tablas de categorías muestran los cultivos y todos los tipos de siniestro de la cadena del lote, campaña y ciclo, sin duplicar la unidad. Los siniestros se ordenan por fecha y, en pérdida total, el que causó la baja se ubica al final aunque falte la recorrida automática. Parcial/Total no permite estimar un porcentaje de kilos perdidos.

## Productividad y superficie

- Productividad ponderada = ha totales / suma de (ha / ha por hora), solo operaciones finalizadas con valores positivos. Las horas son estimadas desde los datos declarados.
- Cumplimiento = operaciones con fin real menor o igual al tentativo / finalizadas con ambas fechas. Se compara por días calendario, sin la tolerancia de justificación de los formularios. El gráfico de trazabilidad muestra dos líneas acumuladas por fecha: finalizaciones esperadas según el fin tentativo (naranja continua) y finalizaciones reales de siembras, resiembras y cosechas (azul discontinua). Cada punto corresponde a una fecha con operaciones; al mantener el cursor sobre él se muestran el lote, el cultivo registrado en esa operación, los fines tentativo y real y el motivo del desvío si existe. Las operaciones pendientes avanzan solo en la línea esperada; las que no tienen fecha tentativa quedan fuera del gráfico. La tabla desplegable conserva el detalle de cada operación, incluidas las que siguen en curso.
- Cobertura por lote, campaña y ciclo: hectáreas cultivables declaradas en la última siembra o resiembra, limitadas a la superficie total actual del lote. Una resiembra reemplaza la superficie vigente de la etapa anterior; ambas siguen visibles en la trazabilidad y en la productividad operativa. La superficie total del polígono se convierte de m² a ha.
- Al crear o editar una siembra o resiembra, las hectáreas cultivables no pueden superar las hectáreas registradas del lote. El formulario y la API aplican el límite; la transacción SQL lo vuelve a comprobar al guardar.
- Superficie sin trabajar = superficie total actual − cobertura. Se muestran diferencias desde 0,05 ha para evitar valores que se redondean a cero; también se usa esa tolerancia al avisar que la superficie sembrada supera la del polígono. Incluye planificaciones sin siembra; los filtros técnicos sin dato en la planificación (época, ciclo del cultivo y variedad) excluyen esos planes de la comparación. No existe una instantánea histórica de la geometría: si cambia el lote, esta referencia cambia.
- Zonas: cantidad de lotes distintos con superficie trabajada y ha acumuladas de los períodos/ciclos elegidos. No incluye lotes meramente planificados sin siembra.
- Mapa de calor: centros aproximados de polígonos, ponderados por cantidad de lotes o ha trabajadas. Su intensidad es relativa a la vista; no representa rendimiento dentro del polígono. Lotes sin coordenadas se excluyen del mapa y se informa su cantidad.

## Verificación

Desde `frontend/AgroDigital.Web`: `node --test src/estadisticasAgricolas.test.js`.

Los casos cubren ponderaciones, datos incompletos, filtros, resiembras, planes pendientes, deduplicación de siniestros y diferencias de fechas. La validación visual utiliza una muestra local de solo lectura; nunca crea registros productivos.
