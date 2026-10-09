# AgroDigital - Contexto persistente para Codex

Este archivo contiene contexto tecnico estable para continuar el desarrollo de AgroDigital en futuras sesiones. No es un historial de conversaciones ni reemplaza a la documentacion del proyecto.

## Nombre y objetivo general

AgroDigital es un sistema de informacion orientado a digitalizar, centralizar y optimizar la gestion de campanias agricolas, desde la pre-siembra hasta la distribucion del grano.

El sistema debe permitir registrar, consultar, controlar y analizar informacion productiva y operativa de lotes, campanias, siembras, cosechas, silos, almacenamiento, distribucion, estadisticas, reporteria IA y asistencia mediante AgroBot.

## Fuentes de verdad

- `AGENTS.md`: fuente principal para entorno tecnico, decisiones vigentes y convenciones de desarrollo.
- `Manual de Usuario.pdf`: fuente funcional principal para modulos, pantallas, campos, estados, permisos, acciones y comportamiento esperado.
- `V3-Ambiente_de_implementacion_AgroDigital.docx`: referencia tecnica actual para stack, herramientas, infraestructura, seguridad y roles.
- `Tesis - AgroDigital.docx`: referencia academica y contextual para problematica, alcance, procesos agricolas, justificacion y fundamentos.
- DER validado: cuando exista, sera la fuente principal de estructura de base de datos.

Si existe una contradiccion entre documentos, codigo, DER o decisiones anteriores, no elegir una interpretacion arbitraria. Informar el conflicto antes de modificar el proyecto.

## Jerarquia de referencia

### Comportamiento funcional

1. Manual de Usuario.
2. Decisiones explicitas tomadas durante el desarrollo.
3. Documento de tesis.

### Entorno y decisiones tecnicas

1. `AGENTS.md`.
2. Ambiente de Implementacion.
3. Decisiones explicitas tomadas durante el desarrollo.

### Alcance y fundamentos academicos

1. Documento de tesis.
2. Manual de Usuario.

### Base de datos

1. DER validado, cuando este disponible.
2. Decisiones explicitas tomadas durante el desarrollo.
3. Manual de Usuario para comportamiento funcional asociado.

## Entorno de desarrollo

### IDE

- Microsoft Visual Studio Community 2022.
- Version instalada: 17.14.38.

### Backend

- C#.
- ASP.NET Core Web API.
- Version inicial del proyecto API: .NET 9.0.

### Frontend

- HTML.
- CSS.
- JavaScript.
- React.
- Vite.
- Leaflet para el mapa interactivo inicial de Lotes.
- Node.js.
- npm.

### Base de datos

- Microsoft SQL Server 2019 Developer Edition.
- Version del motor instalada: 15.0.2000.5.
- SQL Server Management Studio 22.
- Autenticacion mixta habilitada.

### Instancia SQL Server para AgroDigital

- Cada integrante debe configurar su propia instancia local de SQL Server 2019 Developer Edition.
- La cadena de conexion real debe guardarse fuera del repositorio mediante `dotnet user-secrets` o variables de entorno.

No asumir automaticamente `localhost`, `.\SQLEXPRESS` ni otra instancia sin confirmar el entorno local.

### Instalacion SQL Server anterior

Existe una instalacion anterior de Microsoft SQL Server 2012 con instancia `JERESERVER`, usada para trabajos y materias anteriores.

No utilizar, modificar, actualizar, eliminar ni tomar `JERESERVER` como instancia predeterminada para AgroDigital salvo indicacion expresa del usuario.

## Seguridad y credenciales

- No almacenar contrasenias, tokens, secretos ni credenciales sensibles en `AGENTS.md`, el repositorio, documentacion versionada ni codigo fuente.
- No usar credenciales administrativas como `sa` directamente desde la aplicacion.
- Las cadenas de conexion deben respetar la instancia definida para AgroDigital y manejar secretos fuera del codigo versionado.
- Las contrasenias de usuarios deben almacenarse cifradas/hasheadas; no deben ser visibles para administradores.
- El comportamiento de AgroBot y ReporterIA debe respetar permisos por rol y no inventar informacion.

## Arquitectura actual del sistema

Arquitectura implementada parcialmente en el repositorio:

- Backend en C# con ASP.NET / ASP.NET Core.
- Frontend en React.
- Base de datos centralizada en SQL Server 2019.
- Acceso mediante navegador web.
- Posible infraestructura futura en nube, sin proveedor especifico definido por ahora.
- Servicios de inteligencia artificial para ReporterIA y AgroBot.

No introducir tecnologias, proveedores cloud, frameworks o patrones estructurales nuevos sin necesidad tecnica clara o confirmacion del usuario.

## Estructura actual del repositorio

El proyecto de trabajo se ubicara en `C:\Users\Jere\Desktop\AgroDigital`.

Estructura inicial definida:

- `backend/`: API y backend en C# / ASP.NET Core.
- `backend/AgroDigital.Api/`: API REST inicial en ASP.NET Core Web API.
- `frontend/`: aplicacion web en React.
- `frontend/AgroDigital.Web/`: frontend inicial en React + Vite.
- `database/`: scripts SQL, documentacion y recursos de base de datos.
- `database/scripts/00_master_create_database.sql`: script madre de creacion completa de la base de datos.
- `database/scripts/09_cosechas.sql`: script incremental del modulo Cosechas y documentos adjuntos.
- `database/scripts/29_cosechas_rediseno.sql`: rediseño de Cosechas (EmpresaId, EstadoControl, maquinaria, rinde seco, tolerancias por grano, partes diarios y vista vw_CosechasAvance).
- `frontend/AgroDigital.Web/src/Cosechas.jsx`: consulta con avance y control de perdidas, registrar/editar, modal de finalizacion, partes diarios, Tirada de Aros con mapa y detalle. Estilos: bloque `cos-*` al final de `styles.css`.
- `database/scripts/09_almacenamiento.sql` y `10_almacenamiento_campania_cosecha.sql`: estructura de Almacenamiento y referencias textuales. Comparten prefijos numericos con scripts de otros modulos; identificarlos por nombre completo y respetar sus dependencias.
- `frontend/AgroDigital.Web/src/Almacenamiento.jsx`: consulta, registro y edicion de movimientos de almacenamiento.
- `frontend/AgroDigital.Web/src/Estadisticas.jsx`: modulo Estadisticas con pestanias Silos y almacenamiento y Distribucion, filtros de periodo (atajos: ultimos 30 dias, ultimos 6 meses, este anio, por campania y personalizado) y grano; la empresa sale del selector superior de App. Graficos en HTML/SVG propios, sin librerias. Estilos: bloque `est-*` al final de `styles.css`.
- `frontend/AgroDigital.Web/src/Distribucion.jsx`: envios por camion (indicadores y tabla por Carta de Porte), registro, conciliacion con analisis de merma en vivo, detalle con trazabilidad, catalogos y parametros por grano. Sus estilos son el bloque `dist-*` al final de `styles.css`; reutiliza las clases `alm-*` de Almacenamiento.
- `database/scripts/23_distribucion.sql`: estructura del modulo Distribucion (catalogos, parametros por grano, envios, camiones, documentos y vistas). Pendiente de incorporar al script madre cuando el modulo este probado.
- `docs/`: documentacion tecnica y funcional versionada que corresponda.

Actualizar esta seccion cuando se creen carpetas, proyectos, scripts o convenciones reales.

## Modulos funcionales principales

Segun el Manual de Usuario, AgroDigital incluye:

- Ingreso al sistema, registro, login con usuario/contrasenia y posible login con Google o Facebook.
- Usuarios.
- Lotes.
- Silos.
- Campanias.
- Siembras.
- Cosechas.
- Almacenamiento.
- Distribucion.
- Estadisticas.
- Reporteria IA.
- AgroBot.

## Roles y permisos

Roles definidos:

- Gerente: alta, edicion y consulta de la estructura operativa (Lotes, Campanias, Siembras, Cosechas y Silos), registros de campo y movimientos de grano; acceso a Estadisticas y Reporteria IA y gestion completa de Usuarios.
- Encargado: alta, edicion y consulta de la estructura operativa, registros de campo y movimientos de grano; acceso a Estadisticas y Reporteria IA; en Usuarios solo consulta.
- Empleado de campo: consulta operativa y registro de Seguimientos, tiradas de aros, partes de cosecha y controles de silo. Solo puede editar o eliminar los registros de campo que cargo. Sin acceso a Estadisticas ni Reporteria IA.
- Empleado Administrativo: consulta operativa y gestion de movimientos de grano en Almacenamiento y Distribucion.

Estos permisos se evaluan segun el rol del usuario en la empresa del registro; Admin tiene acceso interno completo. La matriz implementada esta en `backend/AgroDigital.Api/Services/PermisosService.cs`.

AgroBot esta disponible para los cuatro roles, pero sus respuestas deben respetar los permisos del usuario logueado.

## Reglas funcionales destacadas

- En Cosechas, el alta solo ofrece la última siembra de un lote activo y cultivado si la siembra y su seguimiento están finalizados y todavía no tiene cosecha. La API aplica la misma regla. El avance usa todas las siembras aptas de la empresa y campaña, incluidas las que aún no tienen cosecha y las ya cosechadas; el rinde muestra una tarjeta por grano presente en las cosechas. La fecha de inicio admite hasta el 31 de diciembre del año final del período de campaña. Los valores de contratista, cosechadora y ancho de cabezal pueden guardarse en el catálogo para futuras cargas; el nombre de la cosechadora se normaliza a mayúsculas y Sin dato oculta los campos de maquinaria. En la tabla se destaca el nombre del lote.
- En el historial de Seguimiento de Siembra, el botón de trazabilidad junto a Posemergentes abre una línea de tiempo cronológica de las aplicaciones preemergentes y posemergentes de la siembra y sus resiembras anteriores. Cada evento conserva su fecha, motivo, etapa y productos aplicados.
- Refertilización se registra en Seguimiento de Siembra después de Siniestros y Posemergentes. Usa la superficie efectivamente sembrada de la siembra, fecha posterior a su inicio y hasta cuatro meses después, urea entre 1 y 500 kg/ha y hectáreas/hora positivas. La API calcula horas trabajadas y urea total; alta, edición y eliminación comparten los permisos de registro de campo. La migración incremental es `database/scripts/30_refertilizacion_seguimientos.sql`. Las eliminaciones de los tres tipos de registro requieren confirmación en la interfaz.
- En la consulta de Siembras, Ciclo estacional (Verano/Invierno) está en la fila principal; Más filtros agrupa Tipo de registro (Siembra/Resiembra), Tipo de soja (Primera/Segunda), Época de siembra de maíz (Temprano/Tardío), Ciclo del cultivo (Corto/Largo) y fechas Desde/Hasta. Ocultarlos conserva los filtros aplicados; Limpiar restablece todos sus valores. El botón Más filtros muestra cuántos filtros avanzados siguen activos aunque el panel esté cerrado. Cosechas también permite filtrar por Ciclo estacional en la fila principal, aplica el ciclo al avance y muestra ese contador para los filtros avanzados.
- En Editar Siembra, el boton final dice Guardar cambios y permanece deshabilitado hasta que cambie algun dato editable del formulario. Volver al valor original lo deshabilita otra vez; los insumos y documentos que se guardan inmediatamente no cuentan como cambios pendientes del formulario.

- La tabla de consulta de Siembras muestra Hectareas (CantidadHectareasTrabajadas, en ha) en lugar de Cantidad de Semillas. Semillas totales se calcula y muestra en el registro, la revisión y el detalle.
- La tabla de consulta de Siembras omite Siniestro, Semilla total (kg), Urea total (kg) y Hectáreas hora para conservar una vista legible; esos datos técnicos siguen disponibles en el detalle. Tampoco muestra casillas de selección ni la acción de exportación sin implementar. Las siembras deshabilitadas permanecen atenuadas y solo ofrecen arrepentimiento cuando la última baja es restaurable.
- En Registrar Siembra, el selector de Ciclo estacional debe ser visible antes del lote. Los lotes disponibles se filtran por el ciclo elegido: una siembra de Verano deshabilitada no excluye la planificación pendiente de Invierno del mismo lote. Invierno puede sembrarse cuando Verano ya se cosechó o cuando su siembra fue deshabilitada.

- La consulta de Siembras permite filtrar Fecha de inicio con Desde/Hasta inclusivos, combinados con los demas filtros. Cualquiera de los extremos puede dejarse vacio; Limpiar restablece ambos. La productividad promedio se calcula sobre los registros filtrados.

- En resiembra, seleccionar Si en pulverizacion exige al menos un registro en la tabla de agroquimicos para continuar o guardar. Completar el formulario sin agregarlo a la tabla no satisface la condicion; seleccionar No permite continuar sin aplicaciones.

- En Datos generales de siembra y resiembra se muestra Cultivo anterior, informativo y de solo lectura, obtenido del último cultivo cosechado en una campaña previa del lote. En resiembra, Cultivo a resembrar conserva el campo técnico Producto y las reglas de selección existentes (parcial conserva el original; total permite cambiarlo). En siembras originales el campo se presenta como Cultivo.
- En Datos generales de resiembra se muestran dos campos: Cultivo afectado, informativo y de solo lectura obtenido de Producto de la siembra original; y Cultivo a resembrar, que conserva el campo tecnico Producto y las reglas de seleccion existentes (parcial conserva el original; total permite cambiarlo). En siembras originales el campo se presenta como Cultivo.

- En Datos generales de Siembras, la seleccion del lote y la referencia a la siembra original se presentan antes de las fechas. La fecha de inicio de resiembra permanece deshabilitada hasta seleccionar un lote con fecha real de fin original disponible, para aplicar los limites correspondientes.

- En resiembras, el paso 2 pregunta mediante radio buttons Si/No integrados como opciones con borde redondeado y seleccion verde si se pulverizo luego de la primera siembra. Por defecto No oculta el apartado de agroquimicos y permite continuar sin aplicaciones; Si lo muestra. Al editar, las aplicaciones existentes mantienen visible el apartado y el selector en Si; para elegir No primero se eliminan explicitamente las aplicaciones. El selector controla la carga opcional y no agrega un campo persistido; en siembras originales el apartado sigue visible.

- Se permiten hasta cuatro resiembras encadenadas por lote y periodo de campaña. Cada una toma como registro anterior la última siembra o resiembra del lote que tenga siembra y seguimiento finalizados; la API y la transacción SQL bloquean la quinta. Al crear una resiembra se agrega automáticamente al seguimiento de esa resiembra un registro de siniestro con FechaInicio, Siniestro, TipoResiembra y Cultivo a resembrar, identificado como Resiembra = Sí.

- La resiembra inicia entre FechaFinReal de la última siembra o resiembra aplicada al lote y cuatro meses calendario después, inclusive (ajustando al último día del mes si corresponde), sin superar el fin de la campaña. Su fin tentativo no puede ser anterior al inicio ni posterior al 31 de diciembre del año final del periodo de campaña. Frontend y API validan estos limites al crear y editar.

- La tabla principal de Siembras muestra Fecha de fin tomada de FechaFinReal; sin fecha real muestra un guion. La fecha tentativa se conserva en registro, edicion, detalle y modal de finalizacion.

- Registrar resiembra solo permite lotes cuyo último registro tenga EstadoSiembra Finalizado y seguimiento en Estado Finalizado dentro de la misma campaña. Al editar una siembra o resiembra existente, lote, tipo de registro y ciclo estacional son fijos; el formulario muestra estos datos sin permitir modificarlos y no repite el estado de Seguimiento. La resiembra editada conserva su lote aunque ella o su seguimiento estén en curso; la API valida que la etapa anterior esté finalizada y corresponda al mismo lote, ciclo y campaña. El historial de seguimiento del último registro reúne las recorridas de su cadena de siembras y resiembras, sin reasignar ni perder los registros originales. Las recorridas de etapas anteriores se distinguen visualmente; la tabla de Siniestros agrega Cultivo y Resiembra. Al intentar abrir el seguimiento de una etapa anterior cuando existe una resiembra posterior, el frontend ofrece ir al historial completo de la última resiembra.
- El boton de estado En curso de Siembras abre una ventana modal de finalizacion sobre la consulta. Solicita FechaFinReal y hectareas por hora promedio; conserva la justificacion por desvio mayor a 3 dias. FechaFin se carga al registrar como fecha tentativa, se presenta con ese nombre y no se reemplaza por FechaFinReal al finalizar.

- Se permite una siembra original **activa** por lote, periodo de campaña y ciclo estacional. Los lotes ya sembrados en el ciclo elegido se excluyen del selector para nuevas siembras; editar excluye el propio registro. Verano e Invierno tienen cadenas independientes de resiembras. La API rechaza duplicados con HTTP 409 y verifica dentro de una transacción SQL con bloqueos UPDLOCK/HOLDLOCK. La siembra original de Invierno solo se habilita después de cosechar la última etapa de Verano, salvo que no haya planificación de Verano o que su cadena de siembra haya sido deshabilitada. Mientras se conserve CampaniaNombre como texto, su prefijo de periodo YYYY-YYYY identifica el periodo.
- Si alguna etapa de una cadena de siembra y resiembras ya tiene cosecha iniciada o finalizada, la acción de deshabilitar esa cadena queda bloqueada en la tabla de Siembras y en la API.
- La baja de una siembra se gestiona desde Siembras y afecta su cadena activa de siembra y resiembras. Conserva el motivo en `LoteDeshabilitaciones`. Si hay planificación pendiente de Invierno, el usuario decide si se conserva, dejando el lote habilitado, o se retira y se deshabilita el lote; el plan ejecutado de Verano siempre permanece como historial. El arrepentimiento desde Siembras o Lotes reactiva exactamente la cadena de esa baja, restaura el seguimiento y recupera el plan de Invierno retirado. La migración es `database/scripts/24_siembras_ciclo_y_bajas.sql`.
- Excepción de rehabilitación: si un lote con siembras en la campaña activa se habilita **para nuevas siembras**, las siembras y resiembras previas quedan deshabilitadas como historial y puede registrarse una nueva siembra original para otro cultivo del mismo periodo. La exclusión de duplicados considera solo siembras activas. El usuario es dirigido a Editar campaña para planificar el nuevo cultivo; la combinación anterior se cierra sin borrar su historial. La baja queda registrada.
- **Habilitar lote y sus siembras** es un arrepentimiento de la última baja: dentro de una transacción reactiva todas las siembras/resiembras afectadas por esa baja, recupera el estado previo del seguimiento de la última etapa, quita solamente el siniestro automático generado por la baja y elimina ese motivo de deshabilitación. Las etapas descartadas en bajas anteriores permanecen deshabilitadas. Esta reversión solo se ofrece mientras la campaña esté activa; una baja antigua sin instantánea del estado previo no se restaura por inferencia. Si el lote no tiene siembras en la campaña activa, mantiene la habilitación normal. El script `database/scripts/20_rehabilitacion_lotes.sql` agrega las columnas nullable de compatibilidad.
- EstadoCultivo de Lotes resume la última campaña asociada al lote y la última siembra o resiembra de ese periodo. Al asociar el lote a una campaña y al registrar una siembra o resiembra queda Pendiente; al finalizar la siembra o resiembra más reciente pasa a Cultivado; al finalizar una cosecha vinculada exactamente a esa última siembra pasa a Cosechado. Finalizar el seguimiento no cambia EstadoCultivo. Las transiciones recalculan este valor dentro de la misma transacción y la edición de campaña conserva el estado derivado del historial. `database/scripts/12_recalcular_estado_cultivo_lotes.sql` regulariza los lotes existentes.
- Después de guardar o finalizar Siembras y Cosechas, el frontend vuelve a consultar Lotes y Campañas para mostrar sus estados derivados sin recargar la página. Al volver al módulo Lotes también actualiza su lista desde la API.

- Las cuentas nuevas quedan en estado pendiente de aprobacion hasta que un Gerente las apruebe y asigne rol.
- El boton Aprobar usuario permanece deshabilitado hasta seleccionar un rol.
- Los lotes no se eliminan una vez creados, por trazabilidad historica.
- Deshabilitar un lote exige registrar un motivo. Alquilado recientemente se ofrece al registrar un lote nuevo durante una campaña y elegir dejarlo deshabilitado, o al deshabilitar desde Editar campaña ese lote recién registrado antes de asociarlo. La API solo acepta este motivo para un lote creado dentro del periodo de una campaña activa de su empresa (desde el 1 de enero del primer año hasta el 31 de diciembre del segundo), sin combinaciones ni siembras en ese periodo. Para los demás lotes las opciones son Fin de alquiler, Siniestro u Otro motivo. Siniestro exige tipo y fecha; Otro motivo exige detalle. Cada baja se conserva en `dbo.LoteDeshabilitaciones`, incluso si luego se rehabilita. El alta de un lote inactivo durante una campaña y las bajas desde Lotes o Campañas conservan el motivo obligatorio y registro atómico.
- La baja se bloquea si la última siembra o resiembra del lote continúa En curso, o si su cosecha vinculada todavía está En curso. Si la última siembra está Finalizada y no tiene cosecha, la baja finaliza su seguimiento sin borrar la siembra ni sus recorridas. Cuando el motivo es Siniestro se agrega automáticamente una recorrida de siniestro con alcance Total, fechada y asociada a la última siembra o resiembra. Los registros de siembra de un lote actualmente deshabilitado se muestran atenuados y con una marca, conservando sus acciones de consulta y trazabilidad. El script incremental es `database/scripts/13_motivos_deshabilitacion_lotes.sql`; `database/scripts/21_alcance_siniestros_deshabilitacion.sql` completa el alcance de los registros automáticos anteriores.
- Un lote cosechado cuya cosecha ya finalizó y que no pertenece a una campaña activa se puede deshabilitar desde Lotes con motivo obligatorio. La baja afecta al lote y conserva intactas la siembra y la cosecha históricas. Una cosecha todavía en curso sigue bloqueando la baja. La edición de datos del lote no cambia `Activo`; las transiciones de habilitación y deshabilitación usan sus acciones dedicadas.
- Al elegir Habilitar lote y sus siembras se revierte solo la última baja: se rehabilitan la siembra original y todas las resiembras que esa baja deshabilitó, se recupera el estado previo del seguimiento y se toma la última siembra o resiembra de la cadena como etapa vigente del lote. El popup identifica esa última etapa antes de confirmar. Habilitar lote para nuevas siembras mantiene la cadena anterior como historial deshabilitado.
- La fecha del siniestro al deshabilitar un lote se admite entre el 1 de enero del primer año y el 31 de diciembre del segundo año del período de su campaña, inclusive; por ejemplo, 2026-2027 permite del 01/01/2026 al 31/12/2027. El popup y la API aplican el mismo rango. Para un lote sin asociación directa se toma la última campaña de su empresa y, si no existe, el período operativo actual. Este registro automático por baja es una excepción a la regla de fecha de las recorridas manuales del seguimiento.
- Al crear o editar un lote, la API compara su poligono con todos los lotes de la misma empresa, incluso los deshabilitados. Bloquea con HTTP 409 cuando la interseccion cubre al menos el 90 % de ambos poligonos; esto evita registrar el mismo terreno con otro nombre sin bloquear lotes vecinos con limites parcialmente compartidos. El frontend consulta estas restricciones remotas de nombre y superposición antes del popup de campaña activa; la superposición se presenta mediante un popup propio.
- Campanias agrupa combinaciones de Lote + Producto + CicloEstacional durante un periodo productivo. Cada lote puede aparecer una vez en Verano y una vez en Invierno, con el cultivo elegido para cada ciclo. Todo lote habilitado debe tener planificación de Verano, salvo que tenga una planificación de Invierno y se registre un motivo explícito para omitir Verano. El lote con solo Invierno permanece habilitado. Un lote sin ninguno de los dos ciclos debe asociarse o deshabilitarse con motivo. Registrar y Editar aplican esta validación también en la API. Los motivos de omisión se conservan en el historial del lote, separados de las bajas, mediante `CampaniaVeranoOmisiones`; la migración incremental es `database/scripts/25_omisiones_verano_campania.sql`. La fecha tentativa de fin debe estar al menos cuatro meses calendario después de la fecha de inicio. `database/scripts/22_campanias_ciclo_estacional.sql` agrega el ciclo y considera Verano las combinaciones anteriores.
- El nombre de campania se asigna automaticamente con formato `CAMP - 0001`, `CAMP - 0002`, etc.
- El nombre de siembra se asigna automaticamente con formato `SIEM - 0001`, `SIEM - 0002`, etc.
- El nombre de cosecha se asigna automaticamente con formato `COS - 0001`, `COS - 0002`, etc.
- Una campania pasa a En curso al registrar una siembra.
- Una campaña permanece activa mientras tenga al menos un lote de sus combinaciones sin cosecha finalizada. Se finaliza automáticamente al finalizar la cosecha del último lote asociado; almacenamiento y distribución no postergan ese cierre.
- Al registrar un lote cuando existe una campaña activa de la empresa, se solicita una decisión antes de persistir: cancelar, registrar y deshabilitar el lote, o registrarlo y abrir Editar campaña para asociarlo. Este popup es la última validación del formulario: solo puede aparecer cuando los datos obligatorios, el polígono cerrado y la superficie calculada sean válidos. La alternativa de deshabilitar se persiste de forma atómica para que el lote no quede activo sin asociación. Si el lote nuevo se registra habilitado para asociarlo, Editar campaña exige guardarlo asociado o deshabilitarlo con motivo antes de salir; Cancelar comprueba las asociaciones ya persistidas y no confunde selecciones sin guardar con asociaciones efectivas. La navegación entre módulos se bloquea mientras esté pendiente esta decisión. Al habilitar un lote ya deshabilitado con una campaña activa, se muestra un popup con Cancelar y Agregar a la campaña; esta segunda opción abre Editar campaña sin habilitarlo todavía. La habilitación se confirma después de guardar la asociación; si se cancela, el lote conserva su baja y motivo anteriores sin solicitar otro. El botón Guardar cambios queda deshabilitado si no hay modificaciones.
- El selector de lotes por rotación en Editar campaña ofrece lotes habilitados que todavía no figuran en el ciclo estacional seleccionado, independientemente del grano o de si ya están asociados en el otro ciclo. La tabla de combinaciones del formulario se filtra por el ciclo seleccionado; la validación de lotes faltantes contempla ambos ciclos juntos.
- La Ficha de campaña filtra sus combinaciones por búsqueda de lote o zona, ciclo estacional, grano y etapa productiva, sin cambiar el orden de más recientes primero. Limpiar restablece todos los filtros. Las tablas de combinaciones de la ficha y de Registrar/Editar campaña muestran solo Etapa: Pendiente hasta finalizar la siembra, Cultivado al finalizarla y Cosechado al finalizar la cosecha; el Estado interno se conserva para las reglas operativas. La consulta de Campañas conserva el estado general de cada campaña, pero ya no tiene la vista intermedia «Ver lotes y cultivos». Sus indicadores de combinaciones, pendientes y hectáreas planificadas también aparecen en la Ficha y responden a sus filtros.
- La pantalla de consulta se titula **Ficha de campaña**. Las tablas de combinaciones en la ficha y en Registrar/Editar campaña omiten las fechas repetidas de inicio y fin, porque son fechas generales de campaña y no de planificación individual del lote. Desde la ficha, cada planificación pendiente se puede retirar con motivo obligatorio. Si el lote tiene Verano e Invierno, el usuario decide si retira solo el ciclo elegido (el lote sigue habilitado y toma el cultivo restante) o ambos (el lote pasa a deshabilitado); ambos caminos conservan el motivo en `CampaniaPlanificacionBajas`. La baja completa también registra `LoteDeshabilitaciones`. El retiro se realiza en una transacción y no borra el lote ni los registros de siembra. En Editar campaña también se pueden quitar planificaciones pendientes ya persistidas: si permanece otro ciclo del mismo lote, se guarda sin pedir motivo; si se quita su última asociación, la validación exige volver a asociarlo o deshabilitarlo con motivo, y esa baja usa el retiro transaccional. Las planificaciones con siembra iniciada no se pueden quitar ni cambiar de cultivo desde Editar. Con campaña activa, la acción Deshabilitar en Lotes está bloqueada; para lotes ya sembrados la baja desde Siembras se definirá más adelante.
- En la Ficha de campaña, la tabla de combinaciones no repite una acción de ver detalle. Su acción Registrar siembra abre directamente el formulario de Siembras con empresa, campaña, ciclo estacional y lote de esa planificación ya seleccionados; se ofrece solo para planificaciones sin siembra iniciada. La validación operativa de Siembras sigue aplicando, incluida la espera de cosecha de Verano antes de sembrar Invierno cuando corresponde.
- Al retirar una planificación desde la ficha, la existencia de siembras se comprueba por lote, campaña y ciclo de la planificación retirada, incluso si la siembra ya fue deshabilitada: una planificación ejecutada conserva su historial. Se puede retirar una planificación pendiente de Invierno aunque Verano tenga siembra o cosecha; el lote conserva Verano y sigue habilitado. La opción de retirar ambos ciclos solo se ofrece cuando las dos planificaciones siguen pendientes y sin etapa operativa; el backend también rechaza una solicitud directa que incluya un ciclo ejecutado.
- El historial de deshabilitaciones visible en la ficha del lote reúne `LoteDeshabilitaciones` y `CampaniaPlanificacionBajas`. Cada fila distingue si la baja afectó al lote completo o a una planificación e indica Verano/Invierno y el cultivo en las planificaciones retiradas. Una baja parcial de planificación no cambia `Lotes.Activo` y por eso no se registra como baja del lote; su motivo permanece en `CampaniaPlanificacionBajas` y se muestra en el historial unificado. La marca de motivo junto al nombre de un lote actualmente deshabilitado se obtiene de su última baja del lote, no de una baja parcial de planificación.
- La omisión de Verano para un lote planificado solo en Invierno utiliza las mismas opciones de motivo que la baja de planificación: Fin de alquiler, Siniestro u Otro motivo. Siniestro exige tipo y fecha; Otro motivo exige detalle. `CampaniaVeranoOmisiones` conserva estos campos por separado y el historial de la ficha del lote los presenta junto a las otras bajas sin marcar el lote como deshabilitado.
- En el selector de rotaciones de Invierno, el antecesor es el cultivo planificado en Verano de esa misma campaña cuando existe; si no hay planificación de Verano para el lote, se toma el último cultivo del historial anterior. Las planificaciones de otros ciclos siguen siendo elegibles en el selector.
- En la pantalla principal, el tramo Destino del Grano agrupa Almacenamiento y Distribucion; no son excluyentes.
- El boton Finalizar actua sobre una combinacion Producto + Lote, no sobre toda la campania.
- Cuando todas las combinaciones de una campania quedan finalizadas, el sistema finaliza automaticamente la campania.
- En Siembras, el estado inicia como Pendiente, pasa a En curso con el primer seguimiento y a Finalizado al finalizar seguimiento.
- El seguimiento de una siembra se registra como Siniestro o Posemergente. Ambos requieren fecha posterior a la FechaInicio de siembra y hasta seis meses calendario después, además de un punto georreferenciado dentro del polígono del lote; frontend y API lo validan. Siniestro requiere causa y alcance/pérdida Parcial o Total; incluye Incendio entre sus causas. Posemergente requiere motivo de aplicación (Plaga, Maleza o Enfermedad), alcance Parcial o Total y al menos un agroquímico cargado. Su primera fecha es directamente Fecha de aplicación y se usa en todos sus agroquímicos, sin repetir el campo por producto. El historial los presenta en tablas separadas: no muestra Latitud ni Longitud como columnas, y en Posemergentes agrega las Drogas aplicadas, resumidas desde sus agroquímicos asociados. Las coordenadas se conservan para el mapa y la validación geográfica.
- El mapa de Seguimiento se muestra con ancho máximo de la mitad del formulario (hasta 720 px) y altura de 260 px; limita el encuadre y desplazamiento al entorno del polígono del lote. Usa zoom máximo y máximo nativo 17 para no solicitar teselas satelitales fuera de rango al ampliar la vista.
- El historial consolidado de Seguimiento separa visualmente cada etapa de siembra mediante una fila divisoria discreta `Resiembra` antes de los registros de la etapa anterior, tanto en Siniestros como en Posemergentes. Las filas conservan su fondo normal; el separador es la única marca visual de la etapa anterior.
- Decision vigente de Cosechas (29_cosechas_rediseno.sql): dos estados independientes, igual que Siembras. Estado de la cosecha: al registrar queda En curso con fecha tentativa de fin; el boton de estado abre un modal de finalizacion que pide fecha real (entre el inicio y hasta 6 meses despues, sin limite por el dia de hoy), hectareas por hora, kg, hectareas, humedad e impurezas; si la fecha real se aleja mas de 3 dias de la tentativa exige justificacion. En el modal se puede ingresar el total cosechado en kg o el rinde promedio en kg/ha; el otro campo se calcula automáticamente con las hectáreas trabajadas, incluso si estas cambian. La API conserva el cálculo oficial del rinde y del rinde seco (a la humedad base de dbo.GranoBasesComercializacion) a partir del total enviado. Control de perdidas (EstadoControl): Sin controles -> En curso con la primera Tirada de Aros -> Finalizado con Finalizar control; cerrado, no admite agregar, editar ni eliminar tiradas. Cerrar el control no finaliza la cosecha; el modal de finalizacion puede cerrarlo en el mismo paso.
- Una cosecha por siembra (indice unico filtrado UX_Cosechas_SiembraId). Solo se registra sobre una siembra Finalizada que sea la ultima de su cadena (sin resiembra posterior); lote, grano, campania y empresa se toman de la siembra en la API. La fecha de inicio no puede ser anterior al fin real de la siembra. Responsable obligatorio; maquinaria (Propia/Contratada, contratista, cosechadora, ancho de cabezal) opcional.
- Tirada de Aros: el punto se marca en el mapa y debe quedar dentro del poligono del lote; la fecha va del inicio de la cosecha hasta cuatro meses calendario despues, sin limite por el dia de hoy; si ya finalizo, tampoco puede superar su fecha real de fin. PMG: el indicado, si no el de la siembra y si no el de referencia del grano (PmgOrigen). Los granos de precosecha (promedio por aro, opcional) se descuentan del aro cabezal. Severidad: Baja <= tolerancia, Media <= tolerancia x factor, Alta por encima. Tolerancias de referencia INTA PRECOP en dbo.GranoToleranciasCosecha (Soja 90, Maiz 210, Sorgo 180, Trigo 80, Girasol 70 kg/ha) con ajuste opcional por empresa en dbo.GranoParametrosCosecha (Gerente y Encargado); grano sin referencia usa cortes generales 80/150. Cada tirada guarda la tolerancia y el factor aplicados: cambiar parametros no reclasifica el historial.
- Partes diarios de cosecha (dbo.CosechaPartes): solo con la cosecha En curso; fecha entre el inicio y hoy; el total de hectareas no supera las sembradas. Destino Silo, Distribucion directa o Pendiente. Un parte con destino Silo genera en la misma transaccion el ingreso en Almacenamiento (Origen = Cosecha, vinculado por CosechaId) y desde entonces solo se editan sus observaciones; no se elimina (el stock se corrige con un ajuste). Al finalizar, los kg cosechados no pueden ser menores a lo ya ingresado a silos o distribuido desde la cosecha; el modal precarga kg, hectareas y humedad desde los partes.
- GET /api/cosechas devuelve solo las cosechas de las empresas del usuario (Admin: todas).
- Almacenamiento registra ingresos y egresos de grano en silos y recalcula stock automaticamente.
- Se generan movimientos automaticos de almacenamiento al crear un silo con grano inicial y al distribuir grano desde un silo.
- Distribucion puede salir directo desde una cosecha o desde un silo.
- ReporterIA debe generar analisis y recomendaciones basadas en datos reales de la operacion, sin inventar informacion.
- AgroBot no guarda historial entre sesiones segun el Manual de Usuario.

- El formulario de registro y edicion de Siembras mantiene cuatro pasos en este orden: 1) Datos generales; 2) Pre-siembra y agroquimicos (muestreo, analisis de suelo, cantidad de muestras, grano antecesor, observaciones y multiples aplicaciones); 3) Detalle de siembra (datos tecnicos del cultivo, superficie, urea, semillas y responsable); 4) Documentacion y revision. Cada paso debe mostrar su contenido y ayuda correspondientes; avanzar desde el indicador de pasos debe respetar las validaciones de los pasos anteriores.
- En el registro y edicion de Siembras, el tipo de registro se elige en una tarjeta independiente debajo del contexto de empresa/campaña y antes del indicador de pasos. Datos generales no repite ese control ni el campo Nombre, porque este se asigna automáticamente al guardar; las secciones del formulario se separan mediante encabezados compactos con icono y línea, incluidas las fechas tanto en siembra como en resiembra. En resiembra, Tipo de resiembra inicia en Parcial y solo ofrece Parcial o Total; los campos se distribuyen en filas alineadas: lote, hectáreas y cultivo anterior; luego cultivo a resembrar, tipo y siniestro, separado por otra línea; y finalmente las fechas. Los controles obligatorios reservan la misma altura de etiqueta que los informativos para mantener sus entradas alineadas. En siembra normal, el bloque inicial se ordena como lote, hectáreas del lote, cultivo anterior y cultivo; Hectáreas del lote informa la superficie registrada y aclara que las hectáreas efectivamente trabajadas se definen en el paso Detalle de siembra.
- En todos los apartados visibles de agroquímicos, el dato técnico persistido como `Variedad` se presenta al usuario como `Droga`. La Variedad de Semilla conserva su nombre, porque representa otro dato funcional.
- Variedad de Semilla usa un selector con búsqueda y alta simple, filtrado por el grano elegido. La base inicial incluye Soja: `46I20`, `50I17`; y Maíz: `ACA473`, `DOW226`. Los valores agregados se normalizan a mayúsculas y se persisten, junto con Marcas y Drogas de agroquímicos, en `dbo.CatalogoValores`.
- Urea se conserva como campo opcional para todos los granos: su uso debe responder al análisis de suelo y al manejo definido. Es frecuente en maíz, trigo y sorgo; en soja puede registrarse para situaciones puntuales.
- Densidad de Siembra muestra separador de miles con punto en el formulario y conserva su valor numérico sin formato para cálculos y persistencia.
- En Detalle de siembra, Densidad de Siembra informa rangos orientativos por cultivo en semillas/ha: Maíz 50.000-100.000, Soja 250.000-500.000, Sorgo granífero 180.000-320.000, Trigo 2.000.000-4.500.000 y Girasol 35.000-70.000. Al ingresar un valor positivo fuera del rango aparece una advertencia no bloqueante; el registro puede continuar y guardarse. Para Otro no se muestra rango. La validación obligatoria de densidad mayor que cero permanece vigente.
- El mismo criterio orientativo y no bloqueante se aplica a PMG (g): Soja 130-220, Maíz 220-400, Sorgo 20-40, Trigo 30-50 y Girasol 40-80; a Profundidad (cm): Soja 3-5, Maíz 4-8, Sorgo 4-5, Trigo 2-4 y Girasol 3-6; y a Urea (kg/ha): Soja 0-100, Maíz 0-400, Sorgo 0-300, Trigo 0-300 y Girasol 0-250. Urea sigue siendo opcional: vacía no advierte; cero es válido. Para Otro no hay rango orientativo. Fuera de estos rangos se informa al productor sin impedir avanzar ni guardar.
- Los números visibles usan punto para separar miles. Semillas totales, Semilla total (kg) y Urea total (kg) se muestran redondeadas a enteros, sin decimales, en registro, revisión y detalle. En la consulta de Siembras, la tabla debe caber en el ancho de escritorio sin desplazamiento horizontal y Hectáreas alinea sus valores por la coma decimal, reservando el mismo espacio cuando un valor es entero. Semilla (kg/ha), dosis y superficies conservan hasta dos decimales cuando aportan precisión operativa. Los totales se recalculan desde los datos de entrada sin recortar la precisión usada en el cálculo; no se persisten para registros nuevos. La columna nullable histórica CantidadSemillas permanece para consultar registros anteriores, y la API deriva el dato cuando está vacía. La precisión técnica de superficies y coordenadas se conserva donde el cálculo geográfico la requiere.
- Las columnas numéricas de las tablas de consulta muestran punto de miles y alinean los valores por la coma decimal. Los enteros reservan el espacio de la parte decimal para mantener la alineación vertical, y la unidad ocupa una posición constante en cada columna.
- Fórmulas de Detalle de siembra: semillas totales = densidad (semillas/ha) × hectáreas cultivables; semilla kg/ha = densidad × PMG (g por mil semillas) ÷ 1.000.000; semilla total kg = densidad × PMG × hectáreas ÷ 1.000.000; urea total kg = urea kg/ha × hectáreas. Los valores sin entradas completas se muestran vacíos; Urea total también queda vacía cuando no se indicó urea.
- En Detalle de siembra, Soja y Maíz requieren `Ciclo del cultivo` con valores Corto o Largo. Soja requiere además `Tipo de soja` con valores Primera o Segunda; Maíz requiere `Época de siembra` con valores Temprano o Tardío. Los campos aparecen según el cultivo seleccionado, se limpian al cambiar a un cultivo incompatible y se validan tanto en frontend como en API. Para otros cultivos se ocultan y se persisten como null. Las columnas son nullable para conservar la lectura de registros históricos y se almacenan para futuros análisis comparativos de rendimiento por tipo, época y ciclo.

## Calculos funcionales definidos

- Los campos numéricos editables de Detalle de siembra (PMG, densidad, profundidad, hectáreas cultivables y urea) bloquean negativos en el formulario y la API los rechaza.
- El historial de cultivos del lote incorpora cultivos operativos solo cuando su cosecha esta Finalizada; crear una campaña o iniciar una siembra/cosecha no los agrega. Se consulta desde Cosechas, agrupado por campaña y cultivo, con fechas de cosecha y orden por finalizacion real descendente. Se conserva el cultivo anterior inicial cargado al registrar el lote como antecedente historico. Cultivo antecesor de Siembras usa este historial, excluyendo cultivos pendientes o en curso.

- En pre-siembra, Cantidad de Muestras admite enteros no negativos y Cantidad Aplicada de agroquimicos debe ser mayor a cero. El formulario bloquea cantidades negativas y la API valida antes de persistir.
- En Pre-siembra, el apartado visible se llama **Barbechos / Preemergentes**. Cada pulverización se identifica por Fecha de aplicación y Motivo de aplicación (Plaga, Maleza o Enfermedad); una fecha nueva inicia otra pulverización y reinicia el motivo. Las drogas se cargan como registros hijos de esa combinación y la consulta las agrupa por aplicación, con un detalle de marca, tipo, cantidad y unidad.
- La Fecha de aplicación de Barbechos / Preemergentes se valida desde la fecha de finalización de la última cosecha del lote, cuando existe una cosecha finalizada registrada, hasta la Fecha de inicio de la siembra. Si el lote no cuenta con esa fecha histórica, conserva como límite inicial el comienzo operativo de la campaña.
- En registro y edicion de Siembras, Cultivo antecesor es de solo lectura y se obtiene del registro mas reciente de HistorialCultivos del lote seleccionado (el historial se entrega del mas reciente al mas antiguo). Si no hay historial se muestra Sin historial y se guarda null. La API obtiene el dato del lote, sin confiar en un valor editable enviado por el cliente; se conserva el nombre tecnico ProductoAntecesor.

- En registro y edicion de Siembras, la fecha de muestreo debe estar entre el 1 de enero del primer año del periodo de campaña y la fecha de inicio de siembra, inclusive. La fecha de analisis no puede ser anterior al muestreo ni posterior al inicio de siembra. Estos limites se validan tanto en frontend como en API.

- Rinde de cosecha: `Rinde (kg/ha) = Cantidad de grano cosechado / Hectareas trabajadas`.
- Perdida de cabezal en Tirada de Aros: `((Granos del Aro Cabezal / 0.25) * PMG) / 100`.
- Perdida de cola en Tirada de Aros: `((Promedio de granos de los 3 Aros Cola / 0.25) * PMG) / 100`.
- Perdida total en Tirada de Aros: `Perdida Cabezal + Perdida Cola`.
- Merma en Distribucion (por camion / Carta de Porte, la calcula la API al conciliar):
  - Secado (%) = `(HumedadDestino - HumedadBase) / (100 - HumedadBase) * 100`, 0 si no supera la base. HumedadBase sale de `dbo.GranoBasesComercializacion`.
  - Materias extranas sobre tolerancia (%) = `MateriasExtranasDestino - ToleranciaME`, 0 si no la supera.
  - Merma esperada (%) = `Secado + Manipuleo + ME sobre tolerancia`; Merma esperada (kg) = `KgRecibidos * Merma esperada % / 100`.
  - Diferencia de balanza = `KgDespachados - KgRecibidos`; Descuento por calidad = `KgRecibidos - KgNetosLiquidados`; Merma total = `KgDespachados - KgNetosLiquidados`.
  - Merma no justificada = `Merma total - Merma esperada (kg)`; Desvio (pp) = `Merma no justificada / KgDespachados * 100`.
  - Nivel de desvio: Bajo <= DesvioMedioPp (0,5 por defecto), Medio <= DesvioAltoPp (1,5 por defecto), Alto por encima. Un desvio negativo es Bajo.
  - La logica vive en `Services/CalculadoraMermaDistribucion.cs` y se usa igual en la previsualizacion y en la conciliacion.

## Integraciones funcionales previstas

- Google Maps para marcar coordenadas de lotes, seguimientos de siembra y controles de Tirada de Aros.
- Login con Google o Facebook como posibilidad funcional.
- Exportacion de reportes PDF desde tablas con registros seleccionados.
- Adjuntos/documentacion en modulos que lo requieren, como siembras, seguimientos, cosechas, controles, distribucion y silos.
- Servicios IA para ReporterIA y AgroBot.

## Proceso agricola de referencia

La tesis describe el flujo operativo de campania:

1. Pre-siembra: analisis de suelo, recomendaciones, definicion de insumos y acondicionamiento.
2. Siembra: definicion de cultivo, semilla, densidad, fertilizacion, ejecucion y registro.
3. Seguimiento: recorridas, deteccion de malezas, plagas o enfermedades, georreferenciacion y aplicaciones.
4. Cosecha: control de condiciones, recoleccion, humedad, impurezas, rinde y Tirada de Aros.
5. Almacenamiento: decision de destino, silos de chapa o silo bolsa, controles periodicos.
6. Distribucion: logistica, camiones, carta de porte, entrega, mermas e informes.
7. Informe final de campania: analisis integral para toma de decisiones futuras.

## Convenciones de trabajo con Codex

- En la tabla de Lotes, la celda de acciones conserva display table-cell y el contenedor interno actions-cell-content dispone los botones en una fila flex sin saltos, centrada verticalmente. No aplicar flex directamente a esa celda ni dejar el contenedor interno sin estilos al integrar cambios.

- La revision final de Siembras usa tarjetas amplias en dos columnas en escritorio y una en pantallas chicas, con texto de datos de 16px como base, titulos de 19px y espaciado generoso; respeta el ajuste de texto de accesibilidad.

- Todos los popups se renderizan mediante portal sobre `document.body`, con un backdrop fijo que ocupa la ventana y los centra respecto al viewport, incluso mientras la página subyacente tiene scroll. Si su contenido supera la ventana, el scroll ocurre dentro del backdrop.
- En los formularios, el asterisco de obligatoriedad aparece inmediatamente después del nombre del campo y antes del control. En etiquetas con clase `field`, envolver nombre y asterisco juntos en `field-label` para que no ocupen filas separadas.
- Las tablas muestran los registros más recientes primero, usando fecha y luego el identificador de creación cuando corresponda. En altas aún no persistidas, cada fila nueva se inserta al inicio. Solo se usa otro orden cuando una regla funcional o una solicitud explícita lo requiera.
- Los campos de texto editables del frontend aplican por defecto una mayuscula inicial mediante `onChangeCapture` en `App.jsx`. No se aplica a correos, contrasenias, fechas, numeros, buscadores ni identificadores/codigos con formato propio. Las excepciones se declaran con `data-text-case`: `preserve` conserva el valor y `upper` convierte todo a mayusculas. Variedad de Semilla usa `upper` y la API tambien la persiste en mayusculas.

- El formulario de registro y edicion de Siembras muestra debajo de cada campo una ayuda breve identificada como `Regla`, basada en las validaciones vigentes del frontend y la API. Los textos se centralizan en `SIEMBRA_FIELD_RULES` dentro de `Siembras.jsx` y deben actualizarse junto con cualquier cambio de obligatoriedad, rango, dependencia, calculo o condicion funcional; los errores dinamicos se mantienen separados y en rojo.

- Accesibilidad cambia exclusivamente el tamaño de las fuentes (Chico 100%, Medio 112%, Grande 124%) mediante font-size. No aplicar zoom ni transform de escala al body o contenedores; imagenes, iconos, sidebar y anchos de la estructura mantienen sus dimensiones. El texto puede ocupar mas lineas y aumentar naturalmente la altura del contenido.

- Antes de cambios relevantes, revisar contexto existente, `AGENTS.md` y documentos relacionados con la tarea.
- Antes de iniciar o reiniciar la API o Vite, comprobar si ya estan levantados en sus puertos locales (API 5135 y frontend 5173) e identificar los procesos. El usuario normalmente inicia el proyecto desde CMD: reutilizar esas instancias, sin abrir duplicados ni detener sus procesos. Tras cambios medianos o mayores, compilar frontend y API y comprobar que ambos respondan. Si una instancia iniciada por el usuario necesita reiniciarse para cargar el codigo nuevo, informarlo; reiniciar por cuenta propia solo las instancias iniciadas por Codex.
- Mantener coherencia con la arquitectura y tecnologias definidas.
- Priorizar soluciones simples, mantenibles y justificables para una tesis academica.
- Si se confirma una decision tecnica importante, aplicarla y actualizar `AGENTS.md` si corresponde.
- No modificar decisiones estructurales importantes sin consultar previamente.
- Mantener `AGENTS.md` actualizado solo con informacion estable y util.

## Comandos habituales

- Ejecutar API: `dotnet run --project C:\Users\Jere\Desktop\AgroDigital\backend\AgroDigital.Api\AgroDigital.Api.csproj`.
- Compilar API: `dotnet build C:\Users\Jere\Desktop\AgroDigital\backend\AgroDigital.Api\AgroDigital.Api.csproj`.
- Ejecutar frontend: desde `C:\Users\Jere\Desktop\AgroDigital\frontend\AgroDigital.Web`, correr `npm run dev`.
- Compilar frontend: desde `C:\Users\Jere\Desktop\AgroDigital\frontend\AgroDigital.Web`, correr `npm run build`.
- Ejecutar script madre de base de datos: abrir y ejecutar `C:\Users\Jere\Desktop\AgroDigital\database\scripts\00_master_create_database.sql` en SSMS contra la instancia SQL Server configurada localmente, o usar `sqlcmd`.

## Decisiones tecnicas vigentes

- Distribucion: un envio (`dbo.Distribuciones`, nombre `DIST - 0001` numerado por empresa) agrupa camiones (`dbo.DistribucionCamiones`); la merma se concilia por camion / Carta de Porte. Ciclo del camion: En transito -> Recibido -> Conciliado; el estado del envio se deriva de sus camiones (`dbo.vw_DistribucionesResumen`).
- Distribucion: una vez registrado un camion no se borra y sus kg despachados y el origen del envio no se modifican. Solo se editan datos logisticos (chofer, camion, destino, CPE y ticket de balanza) y la cabecera (responsable y observaciones).
- Distribucion: si el grano sale de un silo, cada camion genera su Egreso FIFO en Almacenamiento (Origen = Distribucion) dentro de la misma transaccion del envio, mediante `IAlmacenamientoRepository.RegistrarEgresoDistribucionAsync`. Si sale directo de la cosecha, el saldo disponible es cosechado - ingresos a silos - ya distribuido directo (`SaldoCosechaDto.KgDistribuidosDirecto`).
- Distribucion: al conciliar se guarda una foto de los parametros aplicados (humedad base, manipuleo, tolerancia) y de la merma esperada; cambiar parametros despues no altera envios ya conciliados. Volver a conciliar recalcula con los parametros vigentes.
- Distribucion: catalogos por empresa (`Transportistas`, `Choferes`, `Camiones`, `DestinosDistribucion`) con FK compuestas (Id, EmpresaId); no se borran, se desactivan. La patente se guarda sin espacios ni guiones y en mayusculas; el DNI, solo digitos. La CPE es unica por empresa.
- Distribucion: permisos. Consulta, cualquier usuario de la empresa. Alta, edicion, recepcion, conciliacion, documentos y catalogos: Encargado y Empleado Administrativo. Parametros por grano: Gerente y Encargado. Indicadores agregados de merma: solo Gerente y Encargado (el resto recibe `IncluyeMerma = false`).
- Distribucion: los graficos de merma por acopiadora, kg por destino y diferencia de balanza por transportista se reservan para el futuro modulo de Estadisticas, no para la pantalla de Distribucion.
- Estadisticas (primera version): pestanias Silos y almacenamiento y Distribucion, por empresa y periodo (`GET /api/estadisticas/almacenamiento` y `/distribucion`, con `empresaId`, `desde`, `hasta` y `grano` opcional; sin fechas, ultimos 6 meses). Solo lectura, sin tablas propias. Acceso: Gerente, Encargado y Admin. Campanias, Siembras y Cosechas se suman cuando esos modulos esten terminados; Usuarios queda para una etapa posterior.
- Estadisticas: cada grafico se marca "Segun el periodo" o "Al dia de hoy". Al dia de hoy (ignoran fechas): stock, antiguedad del stock y camiones sin conciliar. El grano se compara sin tildes ni mayusculas.
- Estadisticas, criterios: el flujo mensual excluye transferencias entre silos y reconstruye el stock al cierre de cada mes hacia atras desde el stock actual; las mermas de almacenamiento son ajustes negativos por motivo mas egresos manuales por Deterioro; un control programado en el periodo esta en termino si el siguiente se hizo hasta esa fecha, los vencidos sin hacer cuentan como incumplidos salvo que el silo ya no tenga grano, y los no vencidos no cuentan.
- Almacenamiento esta integrado al menu y a la API; genera el ingreso inicial de grano al crear un silo. El script madre incluye su estructura y las bases existentes se actualizan con los dos incrementales de almacenamiento, sin ejecutar scripts de reasignacion de empresas.
- Pendiente de integracion estructural: Almacenamiento conserva Campania/Cosecha como texto libre y no posee EmpresaId ni aislamiento por empresa. Esto no reemplaza la regla objetivo de EmpresaId en tablas operativas; requiere una migracion especifica antes de considerarlo integrado al flujo multiempresa de Campanias/Cosechas.
- Almacenamiento agrega Producto como texto libre y opcional en el movimiento (mismo criterio que Campania/Cosecha, columna NULL agregada via `11_almacenamiento_producto.sql`). Es independiente del campo `Producto` ya existente en `dbo.Silos`, porque un mismo silo puede recibir mas de un producto a lo largo del tiempo y el movimiento debe poder dejar registrado cual corresponde a ese ingreso o egreso puntual. La tabla de consulta muestra el Producto del movimiento y, si no fue cargado, cae al Producto registrado en el Silo. Cuando exista un catalogo formal de Productos, la migracion natural es agregar ProductoId (INT NULL + FK) y evaluar la baja de esta columna de texto.
- Lotes permite exportar los registros seleccionados a PDF y confirmar la habilitacion/deshabilitacion mediante modal. Se conservan los filtros y campos de cultivo locales.

- SQL Server objetivo: SQL Server 2019 Developer Edition configurado localmente por cada integrante.
- No usar `JERESERVER` para AgroDigital salvo indicacion expresa.
- Stack base: C# / ASP.NET Core Web API, React, SQL Server 2019.
- No hay proveedor cloud especifico definido.
- La base de datos debe ser relacional.
- El modelado de Lotes se inicia con `dbo.Lotes` para datos generales y `dbo.LoteCoordenadas` como tabla hija para las esquinas del poligono marcado en el mapa.
- Para la API se usa la plantilla moderna `ASP.NET Core Web API` de Visual Studio 2022 / .NET CLI, no la plantilla antigua `Aplicacion web ASP.NET (.NET Framework)` usada en videos de Visual Studio 2019.
- La API inicial expone endpoints `GET /api/lotes`, `GET /api/lotes/{loteId}`, `POST /api/lotes` y `PUT /api/lotes/{loteId}`.
- La API expone `POST /api/auth/login` para validar credenciales contra `dbo.Usuarios` en SQL Server. El admin inicial se seedeea desde el script madre con usuario fijo y contrasenia guardada como hash PBKDF2-SHA256 con salt, nunca en texto plano ni hardcodeada en el frontend.
- La firma local de tokens de autenticacion debe configurarse fuera del repositorio con `dotnet user-secrets` usando la clave `Auth:SigningKey`. En produccion debe configurarse mediante variable de entorno o gestor de secretos equivalente.
- La tabla `dbo.Usuarios` es la tabla unica para identidades del sistema: Admin, Gerente, Encargado, EmpleadoCampo y EmpleadoAdministrativo. Los permisos finos por empresa se resolveran con tablas relacionales asociadas.
- Los datos personales ampliados del usuario deben modelarse en una tabla relacionada separada de `dbo.Usuarios`, para no mezclar identidad/login con perfil personal y datos de contacto.
- El frontend inicial muestra una pantalla de login y un panel interno de administracion para AgroDigital. El panel admin solo solicita el nombre del responsable inicial y crea una cuenta gerente inicial persistida en SQL Server. La contrasenia temporal se muestra una unica vez al crearla o regenerarla; en base solo se almacena su hash en `dbo.Usuarios.PasswordHash`. La trazabilidad del acceso inicial queda en `dbo.AccesosGerenteIniciales`.
- El panel admin permite editar el responsable inicial y habilitar/deshabilitar accesos gerente mediante baja logica. Si el acceso esta en `Pendiente de primer ingreso`, editar el responsable tambien regenera el usuario inicial. No se implementa eliminacion fisica de estos registros para conservar trazabilidad y permitir reactivacion.
- Cuando un gerente ingresa por primera vez con credenciales temporales, el frontend muestra una pantalla de completar registro antes del dashboard. Al finalizar, el mismo registro de `dbo.Usuarios` se actualiza con nombre, apellido, telefono, correo, nueva contrasenia hasheada y `DebeCambiarPassword = 0`; desde ese momento el gerente ingresa con correo electronico y contrasenia definitiva.
- El primer registro del gerente crea un `GrupoGestion` padre y una o varias `Empresas` iniciales. La relacion usuario-empresa queda en `UsuarioEmpresas`, preparada para roles discriminados por empresa.
- El ID de grupo de gestion no lo genera el panel admin. Se genera cuando el gerente completa su primer registro y crea su grupo de gestion, momento en el que tambien debe poder cargar todas las empresas que quiera.
- El flujo de gestion de usuarios queda orientado a `GrupoGestion` como nivel padre del gerente, empresas asociadas al grupo, usuarios que pueden pertenecer a varias empresas y roles discriminados por empresa. Las invitaciones/OTP deben ser de un solo uso, vencer a los 7 dias y conservar historial de solicitudes descartadas/rechazadas.
- Las empresas no deben eliminarse fisicamente; si un gerente pierde acceso o deja de operar una empresa, debe deshabilitarse para conservar trazabilidad.
- Toda tabla operativa debe incluir `EmpresaId` para separar correctamente la informacion entre empresas.
- No se implementa eliminacion fisica de lotes porque el Manual de Usuario indica que forman parte de la trazabilidad historica.
- El frontend inicial de Lotes consume `http://localhost:5135/api/lotes` y se sirve localmente en `http://127.0.0.1:5173/`.
- CORS de la API permite `http://localhost:5173`, `http://127.0.0.1:5173` y `http://localhost:3000` para desarrollo local.
- La pantalla de Lotes tiene vista de consulta y vista de registro con menu lateral estilo AgroDigital.
- La vista de consulta de Lotes adopta un diseno tipo dashboard: sidebar verde ancho con navegacion textual, topbar con breadcrumb/estado/usuario, filtros en tarjeta, tabla blanca con chips de condicion y acciones por fila.
- El sidebar principal debe poder expandirse y contraerse con boton hamburguesa. Sus enlaces visibles son: Usuarios, Lotes, Campañas, Siembras, Cosechas, Silos, Almacenamiento, Distribución, Estadísticas y Reportería IA.
- El control de expandir/contraer sidebar se presenta como una flecha flotante lateral centrada y sobresaliente, no como boton hamburguesa. Al hacer hover sobre la flecha con el menu contraido, el sidebar se expande levemente como previsualizacion de apertura.
- El logo principal debe mostrarse en el header/breadcrumb junto al icono de inicio, no dentro del boton hamburguesa del sidebar. Al abrir o contraer el sidebar, el logo se desplaza junto con el contenido principal.
- Con el sidebar contraido, tambien se muestra un logo compacto dentro del propio sidebar usando `src/assets/agrodigital-compact-logo.png`, sin quitar el logo del header. Con el sidebar expandido, el logo completo se muestra dentro del sidebar y el logo del header se oculta.
- La flecha de expandir/contraer sidebar usa una burbuja grande semitransparente con efecto glass.
- El header funciona como breadcrumb interactivo de ubicacion del sistema. En Lotes debe mostrar `Lotes`; en registro debe mostrar `Lotes / Registrar lote`, con `Lotes` clickeable para volver a la consulta.
- El fondo principal del contenido se mantiene limpio, sin patron de trigo, para reducir ruido visual. El elemento decorativo tipo paisaje/campo queda reservado para la parte inferior del sidebar.
- El sidebar usa una imagen de campo distinta segun su estado: `src/assets/sidebar-landscape-collapsed.png` para menu comprimido y `src/assets/sidebar-landscape-expanded.png` para menu expandido.
- La interfaz de Lotes esta probando una filosofia visual flotante: sidebar y contenido principal separados del borde de la ventana, con bordes redondeados grandes, sombras suaves y tarjetas redondeadas.
- El frontend incorpora un control flotante de accesibilidad persistente, separado de AgroBot, que permite cambiar el tamanio de texto entre Chico, Medio y Grande. El tamanio actual/base del sistema corresponde a Chico. Accesibilidad y AgroBot se mantienen siempre visibles como una columna flotante fija en el borde inferior derecho de la pantalla, estilo widget de WhatsApp, sin importar el scroll o la pantalla activa. El panel de accesibilidad se cierra al hacer clic fuera o presionar Escape.
- La vista de consulta de Lotes incluye resumen superior con tarjetas de Total de lotes, Hectareas propias y Hectareas alquiladas calculadas desde los datos cargados.
- Las pantallas de consulta deben usar un estado vacio reutilizable cuando no haya registros, con icono grande, mensaje contextual y boton de accion principal para crear el primer registro del modulo.
- La condicion `Alquilado` se representa con chip naranja e icono de trato/acuerdo; `Propio` se representa con chip verde e icono de casa.
- La marca visual del frontend usa el logo real `src/assets/agrodigital-logo.png` en la cabecera/menu superior.
- La pantalla de consulta del modulo se titula `Lotes`; el checkbox del encabezado de la tabla selecciona todas las filas visibles.
- En el formulario de Lotes, el campo visible `Zona` se envia por ahora a la API como `ciudad` porque la base y el backend conservan ese nombre. Si se confirma el cambio conceptual, hacer una migracion ordenada de base/API/frontend.
- El registro de Lotes usa Leaflet/OpenStreetMap/Esri imagery como implementacion inicial de mapa interactivo: el usuario marca esquinas, cierra el poligono tocando el primer punto o cerca de el, y el frontend calcula superficie total y hectareas antes de enviar a la API.
- El mapa de Lotes debe ofrecer capas con nombres/limites politicos y una opcion satelital; se permite zoom alto para marcar lotes con muchas esquinas.
- Para evitar teselas grises de Esri, las capas satelitales se limitan al zoom disponible y la capa `Calles y limites` queda como opcion principal para acercamiento fino.
- El mapa de registro de Lotes puede expandirse y sus puntos/esquinas son arrastrables para corregir el poligono antes de guardar.
- La interfaz del frontend debe usar pantalla completa, evitando marcos centrados con espacio desperdiciado.
- El diseño del frontend debe mantenerse mobile-first: en pantallas chicas el menu se adapta a barra superior/inferior y los formularios/mapas se apilan.
- Al expandir el mapa de Lotes, se fuerza la capa `Calles y limites` para evitar el mensaje `Map data not yet available` de la capa satelital y permitir zoom fino.
- En el mapa de Lotes, el boton de limpieza debe borrar los puntos marcados sin mover la vista actual del mapa.
- En modo mapa expandido, mostrar una lista de coordenadas de los puntos marcados y permitir eliminar puntos individuales.
- En el formulario de Lotes, los paneles de coordenadas normal y expandido permiten eliminar puntos individuales del poligono.
- En modo mapa expandido, cuando el poligono esta cerrado, mostrar hectareas y superficie total calculadas.
- En modo mapa expandido, mantener visibles AgroBot y accesibilidad en la columna flotante fija del borde inferior derecho; si hay superposiciones, ajustar los controles internos del mapa antes que ocultar los widgets globales.
- En modo mapa expandido de Lotes, el mapa debe respetar el header/topbar de la pagina: se expande debajo del header dentro del panel principal, no encima de toda la ventana.
- En modo mapa expandido de Lotes, no debe generarse scroll de pagina; si hay muchos puntos, el desplazamiento queda limitado al panel/lista de coordenadas.
- En modo mapa expandido de Lotes, mantener la filosofia flotante del sistema: margen interno respecto del panel, bordes redondeados y altura alineada al area util del menu lateral/contenido.
- En el mapa de Lotes, marcar o cerrar puntos no debe cambiar automaticamente el modo expandido ni reencuadrar la vista; expandir/contraer queda reservado al boton del mapa.
- La pantalla de Registrar Lote usa composicion por tarjetas: encabezado con titulo/descripcion, tarjeta superior de datos generales, tarjeta izquierda para mapa del lote y calculos, tarjeta derecha para puntos marcados.
- Las pantallas `Detalle Lote` y `Editar Lote` siguen la misma composicion visual que Registrar Lote. Detalle es solo consulta, con campos bloqueados, mapa sin edicion y accion para pasar a editar. Editar reutiliza el formulario, mapa editable y guardado mediante `PUT /api/lotes/{loteId}`.
- Cuando Registrar Lote no tiene puntos marcados, el panel derecho muestra un mini tutorial coherente con la funcionalidad: marcar primer punto, continuar esquinas, cerrar tocando el primer punto y usar zoom para ubicacion.
- El mapa normal de Registrar Lote inicia en vista satelital con etiquetas como opcion visual principal; al expandirse puede forzar calles y limites para evitar teselas faltantes en zoom alto.
- Los campos `Provincia` y `Zona` del formulario de Lotes usan dropdowns con busqueda interna.
- La busqueda interna de dropdowns debe ignorar acentos/diacriticos para mejorar usabilidad: por ejemplo, `Cordoba` debe encontrar `Córdoba`.
- Las localidades del campo `Zona` se cargan dinamicamente desde la API oficial Georef Argentina (`https://apis.datos.gob.ar/georef/api/localidades`) filtrando por provincia. Se conserva un fallback local reducido solo para que el formulario siga funcionando si Georef no responde.
- Al seleccionar una `Zona` en el registro o edicion de Lotes, el mapa consulta el centroide de esa localidad en Georef, filtrado por la `Provincia` elegida, y centra la vista alli sin alterar los vertices ya marcados. Si Georef no responde o no devuelve coordenadas, el formulario y el mapa conservan su comportamiento actual.
- El flujo de empleados permite registrarse desde `Unirse a grupo` usando ID de grupo de gestion + OTP valida. La solicitud queda pendiente para el gerente; al aprobarla, el gerente puede dar acceso a todas sus empresas con un rol general o a empresas puntuales con roles discriminados por empresa.
- El modulo Cosechas queda implementado inicialmente con consulta, registro, edicion, detalle y documentacion. Mientras Campanias no exista como tabla, conserva `CampaniaNombre` como texto opcional y permite asociar una `SiembraId` existente para arrastrar lote, producto, empresa y hectareas trabajadas.

