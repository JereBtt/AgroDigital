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

## Extracción por módulos 2: filtros comunes y tabla operativa

Los dos bloques que seguían a `lotes-filtros.css` se trasladaron sin cambiar reglas: desde `.status-segmented button` hasta `.green-button:disabled` a `src/styles/filtros-y-botones.css`, y desde `.table-shell` hasta `.compact-actions-cell` a `src/styles/tablas-operativas.css`. Este último incluye selectores compartidos y reglas de Lotes y Siembras; se mantiene como tramo contiguo en vez de mover esas reglas a una posición distinta. `src/styles.css` importa ambos archivos en ese orden, antes de `.cosecha-warning-modal-backdrop`. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Queda pendiente revisar visualmente filtros, tablas y acciones de Lotes y Siembras en una sesión funcional.

## Extracción por módulos 3: formularios y mapa de Lotes

Para mantener válido el orden de `@import`, se trasladaron tres bloques contiguos y consecutivos, sin cambiar sus reglas: desde `.cosecha-warning-modal-backdrop` hasta el ajuste final de Refertilización a `src/styles/bloque-operativo-inicial.css`; desde `.field` hasta `.dropdown-empty` a `src/styles/formularios-compartidos.css`; y desde `.lote-editor-grid` hasta `.map-note svg` a `src/features/lotes/lotes-formulario-mapa.css`. `src/styles.css` los importa en ese orden antes de `.floating-widgets`.

`bloque-operativo-inicial.css` es un archivo de transición: contiene avisos y reglas de Siembras y Campañas que deberán subdividirse al llegar a esos módulos. `lotes-formulario-mapa.css` conserva también reglas de Seguimientos que ya estaban intercaladas con el editor, el mapa y su tutorial. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Queda pendiente revisar visualmente el formulario, mapa y tutorial de Lotes, además del historial de Seguimientos, con una sesión funcional.

## Extracción por módulos 4: modales y baja/reactivación de Lotes

Para alcanzar el primer grupo de modales sin poner `@import` después de reglas CSS, se separaron tres tramos contiguos: desde `.floating-widgets` hasta `@keyframes copy-fade` en `src/styles/controles-globales.css`; desde `.manager-users-panel` hasta el final de los estilos responsivos de Perfil en `src/styles/usuarios-perfil.css`; y desde `.ocupacion-chip` hasta `.export-lotes-button:disabled` en `src/styles/ajustes-operativos.css`. Después se trasladó el bloque de `.confirmation-modal-backdrop` hasta la regla móvil de `.lote-disable-fields` a `src/styles/modales-y-bajas.css`. Este último conserva confirmaciones compartidas y estilos de Siembras junto al modal de baja de Lotes. La compilación y el SHA-256 del CSS generado coincidieron con la línea base tras ambos movimientos.

El modal de reactivación estaba más adelante. El tramo anterior, desde el comentario de los campos de Siembras hasta las acciones de cabecera de Cosechas, quedó temporalmente en `src/styles/bloque-operativo-posterior.css`; las reglas desde `.enable-lote-history-modal` hasta `.enable-lote-history-footer button` pasaron a `src/features/lotes/lotes-reactivacion.css`. Los imports conservan el orden anterior a la trazabilidad de Seguimientos. `npm run build` terminó correctamente y el CSS compilado conservó el nombre `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base.

`usuarios-perfil.css`, `ajustes-operativos.css` y `bloque-operativo-posterior.css` contenían reglas de más de un módulo al cerrar este corte. El primero se dividió en el paso siguiente; los otros se revisarán al avanzar por Campañas, Siembras y los módulos operativos. La revisión visual de baja, confirmación y reactivación de Lotes sigue pendiente con una sesión funcional.

## Extracción por módulos 5: Usuarios, administración y Perfil

`usuarios-perfil.css` se dividió, conservando su secuencia, en `features/usuarios/usuarios-gestion.css`, `features/acceso/ingreso-empleado.css`, `features/usuarios/usuarios-aprobacion.css`, `features/usuarios/usuarios-equipos.css` y `features/perfil/perfil.css`. El archivo original se eliminó. `npm run build` terminó correctamente y el CSS compilado conservó `index-QRaE5sgT.css` con SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD`.

Del final de `bloque-operativo-posterior.css` se separaron, en orden, `features/admin/admin-invitaciones.css`, `features/usuarios/usuarios-invitaciones.css`, `styles/notificaciones.css`, `features/usuarios/usuarios-consulta.css`, `features/empresas/empresas-consulta.css` y `features/cosechas/cosechas-base.css`. El último archivo conserva el bloque de Cosechas que ya seguía a las vistas de Empresas; se revisará en el paso de ese módulo. `bloque-operativo-posterior.css` conserva las reglas anteriores para separarlas por módulo. La compilación volvió a producir `index-QRaE5sgT.css` con el mismo SHA-256 de la línea base. Queda pendiente la revisión visual de gestión, aprobaciones, equipos, invitaciones y perfil en una sesión funcional.

## Extracción por módulos 6: Campañas, Siembras, Seguimientos y Cosechas

El antiguo `bloque-operativo-inicial.css` se dividió, en su orden original, en `styles/estados-agricolas.css`, `features/siembras/siembras-formularios.css`, `features/campanias/campanias-formularios.css`, `styles/vistas-compartidas.css`, `features/campanias/campanias-grilla.css` y `features/siembras/siembras-refertilizacion.css`. El archivo transitorio se eliminó. La compilación conservó el CSS `index-QRaE5sgT.css` y su SHA-256 de línea base.

`ajustes-operativos.css` se dividió en `styles/ocupacion-y-filtros.css`, `features/campanias/campanias-consulta.css` y `features/lotes/lotes-ajustes.css`. Del comienzo de `bloque-operativo-posterior.css` se extrajo `features/siembras/siembras-ajustes.css`, incluida la regla compartida del catálogo que precedía a Silos. `bloque-operativo-posterior.css` ahora comienza con Silos y se revisará en el paso operativo. En ambos cortes la compilación volvió a conservar el mismo CSS y SHA-256.

El final de `src/styles.css` se dividió en `features/siembras/seguimiento-trazabilidad.css` y `features/cosechas/cosechas-ajustes.css`; `src/styles.css` queda como lista ordenada de imports. `features/cosechas/cosechas-base.css`, creado al separar Usuarios, permanece antes del modal de reactivación de Lotes, como en la cascada original. La compilación volvió a conservar el CSS `index-QRaE5sgT.css` y el SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` de la línea base. Falta revisar visualmente Campañas, Siembras/Seguimientos y Cosechas con una sesión funcional.

## Extracción por módulos 7: Silos

`styles/ocupacion-y-filtros.css` se dividió en `features/silos/silos-ocupacion.css` y `styles/filtros-padres.css`, sin cambiar sus reglas ni orden. El bloque de Silos desde su encabezado de tablero hasta el final de ficha y control se trasladó desde `styles/bloque-operativo-posterior.css` a `features/silos/silos.css`. La hoja transitoria comienza ahora con Almacenamiento. Ambas compilaciones produjeron `index-QRaE5sgT.css` con SHA-256 `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD`, idéntico a la línea base. Falta comprobar visualmente tablero, registro, ficha y controles de Silos.
