# Línea base para organizar los estilos del frontend

Fecha: 31/10/2026. Rama: `organizacion-frontend-segunda-capa`. Punto de partida: `adf32ff856bda8fb08a0667a76028ed1f8e70f7d`.

`src/main.jsx` importa `src/styles.css`. Vite también incorpora al CSS final las hojas importadas por componentes. La línea base se obtuvo con `npm run build` desde `frontend/AgroDigital.Web`, sin cambios de estilos.

| Archivo | Tamaño | SHA-256 |
| --- | ---: | --- |
| `src/styles.css` | 259.618 bytes; 11.981 líneas | `692BBD78929A03C67B560C0F1A3E5EB7556AD1015807FEA9B54BA33CC79365EA` |
| `dist/assets/index-QRaE5sgT.css` | 247.103 bytes | `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` |

La compilación terminó correctamente. Vite informó el aviso ya existente de un chunk JavaScript mayor a 500 kB. `dist/` es salida generada y no se versiona como referencia; el commit de partida permite reconstruirla.

## Comprobación de cada extracción

1. Mantener el orden original de las reglas y de las hojas importadas. No cambiar valores ni eliminar reglas durante un traslado.
2. Ejecutar `npm run build` y calcular el SHA-256 del CSS resultante con `Get-FileHash dist/assets/index-*.css -Algorithm SHA256`.
3. Si la huella coincide con la línea base, el CSS generado es idéntico. Si difiere, comparar el contenido compilado y revisar la cascada antes de continuar.
4. Comprobar visualmente las pantallas afectadas en ancho de escritorio y móvil, incluidos menús, formularios, tablas, mapas y modales.

El recorrido visual previo al primer traslado queda pendiente de ejecución con una sesión funcional del sistema. En particular, conviene revisar Acceso/Perfil, Lotes, Campañas, Siembras/Cosechas, Silos/Almacenamiento/Distribución y las pantallas de estadísticas e IA.

## Extracción 1: reglas globales

Las reglas iniciales de `:root`, `*`, `body` y controles básicos se trasladaron sin cambios a `src/styles/base.css`. `src/styles.css` la importa inmediatamente después de Leaflet. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base.

## Extracción 2: acceso inicial

El bloque contiguo desde `.auth-shell` hasta `.join-team-link` se trasladó a `src/styles/acceso.css`, incluidas las reglas que también seleccionan elementos de administración. `src/styles.css` lo importa después de `base.css` y antes de `.admin-page`. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Queda pendiente comprobar las pantallas de acceso en una sesión funcional.

## Extracción 3: registro y administración

El bloque contiguo desde `.admin-page` hasta `.regenerate-password-button:hover` se trasladó sin cambiar reglas a `src/styles/administracion.css`. `src/styles.css` lo importa después de `acceso.css` y antes de `.app-frame`. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Queda pendiente comprobar visualmente el registro y el panel administrativo con una sesión funcional.

## Extracción 4: estructura de la aplicación

El bloque contiguo desde `.app-frame` hasta `.user-avatar` se trasladó sin cambiar reglas a `src/styles/estructura-app.css`. Contiene el marco, menú lateral, encabezado y controles de navegación; su única referencia `url(...)` es un SVG embebido. `src/styles.css` lo importa después de `administracion.css` y antes de `.content-panel`. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Queda pendiente la revisión visual de menú expandido/contraído y encabezado con una sesión funcional.

## Extracción 5: primer bloque de contenido compartido

El bloque contiguo desde `.content-panel` hasta `.status-segmented` se trasladó sin cambiar reglas a `src/styles/contenido-compartido.css`. Incluye paneles, tarjetas de resumen, encabezados y filtros básicos. `src/styles.css` lo importa antes del primer ajuste específico de Lotes. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base.

La extracción del contenido compartido continúa pendiente: después de este corte hay reglas genéricas de búsqueda, botones y tablas intercaladas con Lotes y Siembras. Antes de trasladarlas hay que definir cortes adicionales que preserven su posición en la cascada. Queda pendiente revisar visualmente paneles, tarjetas y filtros con una sesión funcional.

## Mapa previo a la organización por módulos

Relevado sobre `src/styles.css` en el commit `34fb2` (10.195 líneas físicas). Los rangos son orientativos y cambiarán cuando se extraigan bloques. Las primeras diez líneas son las importaciones de Leaflet y de los estilos ya separados. Esta sección registra ubicación y mezcla de reglas; no supone cambios de CSS.

| Líneas | Contenido predominante | Mezclas que deben conservar su posición |
| --- | --- | --- |
| 12-46 | Ajustes de filtros de Lotes | Siguen reglas compartidas de estado en 47-60. |
| 47-181 | Estado, Siembras, búsqueda y botones | Siembras ocupa 61-86; búsqueda, filtros y botones generales ocupan 87-181, con una regla propia de Lotes. |
| 182-642 | Tabla de Lotes y acciones | Comparte selectores y presentación con Siembras y Seguimientos. |
| 643-1820 | Registro, detalle y seguimiento de Siembras | Incluye controles genéricos de formularios y modales. |
| 1821-2500 | Campañas y formularios | Incluye estado vacío, paginación y ajustes de Refertilización. |
| 2501-4408 | Formularios, mapa y detalle de Lotes | Incluye Seguimientos, controles comunes, ajustes globales responsivos y reglas de acceso. |
| 4409-6213 | Usuarios, equipos y Perfil | Varias reglas de flujo de ingreso, contraseñas y administración. |
| 6214-6858 | Silos, Campañas, Lotes y Siembras | Ocupación, filtros, modales de baja y ajustes de siembra intercalados. |
| 6859-7786 | Silos | Bloques de consulta, registro, controles y gráficos. |
| 7787-8460 | Almacenamiento | Comparte clases `alm-*` con Distribución. |
| 8461-9050 | Distribución | Usa selectores de tablas y clases de Almacenamiento. |
| 9051-9414 | Estadísticas | Termina con un ajuste de tarjeta compartida. |
| 9415-9818 | Administración, Usuarios, notificaciones y Empresas | Invitaciones y vistas de consulta aparecen después de Estadísticas. |
| 9819-10195 | Cosechas | Hay un modal de Lotes en 10013-10108, trazabilidad de Seguimientos en 10109-10171 y ajustes de Siembras/Cosechas al final. |

`Inicio`, `Reportería IA`, `AgroBot` y `Estadísticas Agrícolas` ya tienen hojas CSS propias en sus carpetas de `features`. Para el primer traslado de Lotes, el corte más acotado es el bloque 12-46, inmediatamente anterior a `.status-segmented button`. Después habrá que revisar por separado la tabla y los bloques posteriores de Lotes, manteniendo las reglas intercaladas en su orden original. La verificación de cada traslado seguirá siendo compilación, huella del CSS generado y revisión visual de las pantallas afectadas.

## Extracción por módulos 1: filtros iniciales de Lotes

El bloque 12-46 del mapa, desde el comentario de la barra de filtros hasta `.lotes-filters .status-segmented button`, se trasladó a `src/features/lotes/lotes-filtros.css`. `src/styles.css` lo importa inmediatamente después de `contenido-compartido.css` y antes de `.status-segmented button`, conservando el orden. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Queda pendiente la revisión visual de los filtros de Lotes en escritorio y móvil.
