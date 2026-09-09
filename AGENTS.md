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
- `database/scripts/09_almacenamiento.sql` y `10_almacenamiento_campania_cosecha.sql`: estructura de Almacenamiento y referencias textuales. Comparten prefijos numericos con scripts de otros modulos; identificarlos por nombre completo y respetar sus dependencias.
- `frontend/AgroDigital.Web/src/Almacenamiento.jsx`: consulta, registro y edicion de movimientos de almacenamiento.
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

- Gerente: consulta en modulos operativos, acceso a Estadisticas y Reporteria IA, y gestion completa del modulo Usuarios, incluyendo aprobacion de cuentas y asignacion de roles.
- Encargado: alta, edicion y consulta en modulos operativos, acceso a Estadisticas y Reporteria IA; en Usuarios solo consulta.
- Empleado de campo: consulta en modulos operativos; sin acceso a Estadisticas ni Reporteria IA.
- Empleado Administrativo: consulta en modulos operativos y gestion completa de Distribucion.

AgroBot esta disponible para los cuatro roles, pero sus respuestas deben respetar los permisos del usuario logueado.

## Reglas funcionales destacadas

- En la consulta de Siembras, Desde/Hasta se ocultan inicialmente y el boton Mas filtros alterna su visibilidad. Ocultarlos conserva el rango aplicado; Limpiar restablece sus valores.

- La tabla de consulta de Siembras muestra Hectareas (CantidadHectareasTrabajadas, en ha) en lugar de Cantidad de Semillas. La cantidad de semillas se conserva en el registro, detalle y persistencia.

- La consulta de Siembras permite filtrar Fecha de inicio con Desde/Hasta inclusivos, combinados con los demas filtros. Cualquiera de los extremos puede dejarse vacio; Limpiar restablece ambos. La productividad promedio se calcula sobre los registros filtrados.

- En resiembra, seleccionar Si en pulverizacion exige al menos un registro en la tabla de agroquimicos para continuar o guardar. Completar el formulario sin agregarlo a la tabla no satisface la condicion; seleccionar No permite continuar sin aplicaciones.

- En Datos generales de resiembra se muestran dos campos: Cultivo afectado, informativo y de solo lectura obtenido de Producto de la siembra original; y Cultivo a resembrar, que conserva el campo tecnico Producto y las reglas de seleccion existentes (parcial conserva el original; total permite cambiarlo). En siembras originales el campo se presenta como Cultivo.

- En Datos generales de Siembras, la seleccion del lote y la referencia a la siembra original se presentan antes de las fechas. La fecha de inicio de resiembra permanece deshabilitada hasta seleccionar un lote con fecha real de fin original disponible, para aplicar los limites correspondientes.

- En resiembras, el paso 2 pregunta mediante radio buttons Si/No integrados como opciones con borde redondeado y seleccion verde si se pulverizo luego de la primera siembra. Por defecto No oculta el apartado de agroquimicos y permite continuar sin aplicaciones; Si lo muestra. Al editar, las aplicaciones existentes mantienen visible el apartado y el selector en Si; para elegir No primero se eliminan explicitamente las aplicaciones. El selector controla la carga opcional y no agrega un campo persistido; en siembras originales el apartado sigue visible.

- Por ahora se permite una sola resiembra por lote y periodo de campaña, sea total o parcial e independientemente de su estado. Se excluyen lotes ya resembrados del selector y se bloquea el duplicado al guardar con HTTP 409 dentro de la transaccion SQL. Editar la resiembra existente excluye el propio registro de la comprobacion.

- La resiembra inicia entre FechaFinReal de su siembra original y cuatro meses calendario despues, inclusive (ajustando al ultimo dia del mes si corresponde). Su fin tentativo no puede ser anterior al inicio ni posterior al 31 de diciembre del año final del periodo de campaña. Frontend y API validan estos limites al crear y editar.

- La tabla principal de Siembras muestra Fecha de fin tomada de FechaFinReal; sin fecha real muestra un guion. La fecha tentativa se conserva en registro, edicion, detalle y modal de finalizacion.

- Registrar resiembra solo permite lotes cuya siembra original tenga EstadoSiembra Finalizado y seguimiento en Estado Finalizado dentro de la misma campaña. La API valida ambos estados, lote y campaña tanto al crear como al editar. El nuevo seguimiento queda asociado al SiembraId de la resiembra; el historial de seguimiento original se conserva en su registro.
- El boton de estado En curso de Siembras abre una ventana modal de finalizacion sobre la consulta. Solicita FechaFinReal y hectareas por hora promedio; conserva la justificacion por desvio mayor a 3 dias. FechaFin se carga al registrar como fecha tentativa, se presenta con ese nombre y no se reemplaza por FechaFinReal al finalizar.

- Solo se permite una siembra original por lote y periodo de campaña, independientemente del grano o estado. Los lotes ya sembrados se excluyen del selector para nuevas siembras; editar excluye el propio registro de la comprobacion. Las resiembras mantienen su flujo asociado a una siembra original. La API rechaza duplicados con HTTP 409 y verifica dentro de una transaccion SQL con bloqueos UPDLOCK/HOLDLOCK para evitar altas simultaneas duplicadas. Mientras se conserve CampaniaNombre como texto, su prefijo de periodo YYYY-YYYY identifica el periodo.

- Las cuentas nuevas quedan en estado pendiente de aprobacion hasta que un Gerente las apruebe y asigne rol.
- El boton Aprobar usuario permanece deshabilitado hasta seleccionar un rol.
- Los lotes no se eliminan una vez creados, por trazabilidad historica.
- Campanias agrupa combinaciones de Lote + Producto durante un periodo productivo.
- El nombre de campania se asigna automaticamente con formato `CAMP - 0001`, `CAMP - 0002`, etc.
- El nombre de siembra se asigna automaticamente con formato `SIEM - 0001`, `SIEM - 0002`, etc.
- El nombre de cosecha se asigna automaticamente con formato `COS - 0001`, `COS - 0002`, etc.
- Una campania pasa a En curso al registrar una siembra.
- Una campania se finaliza cuando corresponde registrar siembra, cosecha y al menos un destino del grano: almacenamiento o distribucion.
- En la pantalla principal, el tramo Destino del Grano agrupa Almacenamiento y Distribucion; no son excluyentes.
- El boton Finalizar actua sobre una combinacion Producto + Lote, no sobre toda la campania.
- Cuando todas las combinaciones de una campania quedan finalizadas, el sistema finaliza automaticamente la campania.
- En Siembras, el estado inicia como Pendiente, pasa a En curso con el primer seguimiento y a Finalizado al finalizar seguimiento.
- Decision vigente de Cosechas: la Tirada de Aros es un control opcional y no gobierna el estado de la cosecha. Al registrar una cosecha queda directamente En curso con fecha de fin tentativa; al finalizar se carga fecha real de finalizacion, resultado de cosecha y, si la fecha real se aleja mas de 3 dias de la tentativa, una justificacion operativa.
- Los controles de Tirada de Aros pueden registrarse mientras la cosecha esta En curso, durante la finalizacion, o luego de finalizada con una advertencia clara para el usuario.
- Almacenamiento registra ingresos y egresos de grano en silos y recalcula stock automaticamente.
- Se generan movimientos automaticos de almacenamiento al crear un silo con grano inicial y al distribuir grano desde un silo.
- Distribucion puede salir directo desde una cosecha o desde un silo.
- ReporterIA debe generar analisis y recomendaciones basadas en datos reales de la operacion, sin inventar informacion.
- AgroBot no guarda historial entre sesiones segun el Manual de Usuario.

- El formulario de registro y edicion de Siembras mantiene cuatro pasos en este orden: 1) Datos generales; 2) Pre-siembra y agroquimicos (muestreo, analisis de suelo, cantidad de muestras, grano antecesor, observaciones y multiples aplicaciones); 3) Detalle de siembra (datos tecnicos del cultivo, superficie, urea, semillas y responsable); 4) Documentacion y revision. Cada paso debe mostrar su contenido y ayuda correspondientes; avanzar desde el indicador de pasos debe respetar las validaciones de los pasos anteriores.

## Calculos funcionales definidos

- Los campos numericos de Detalle de siembra (PMG, densidad, profundidad, hectareas cultivables, urea y cantidad de semillas) bloquean negativos en el formulario y la API los rechaza.
- El historial de cultivos del lote incorpora cultivos operativos solo cuando su cosecha esta Finalizada; crear una campaña o iniciar una siembra/cosecha no los agrega. Se consulta desde Cosechas, agrupado por campaña y cultivo, con fechas de cosecha y orden por finalizacion real descendente. Se conserva el cultivo anterior inicial cargado al registrar el lote como antecedente historico. Cultivo antecesor de Siembras usa este historial, excluyendo cultivos pendientes o en curso.

- En pre-siembra, Cantidad de Muestras admite enteros no negativos y Cantidad Aplicada de agroquimicos debe ser mayor a cero. El formulario bloquea cantidades negativas y la API valida antes de persistir.
- En registro y edicion de Siembras, Cultivo antecesor es de solo lectura y se obtiene del registro mas reciente de HistorialCultivos del lote seleccionado (el historial se entrega del mas reciente al mas antiguo). Si no hay historial se muestra Sin historial y se guarda null. La API obtiene el dato del lote, sin confiar en un valor editable enviado por el cliente; se conserva el nombre tecnico ProductoAntecesor.

- En registro y edicion de Siembras, la fecha de muestreo debe estar entre el 1 de enero del primer año del periodo de campaña y la fecha de inicio de siembra, inclusive. La fecha de analisis no puede ser anterior al muestreo ni posterior al inicio de siembra. Estos limites se validan tanto en frontend como en API.

- Rinde de cosecha: `Rinde (kg/ha) = Cantidad de grano cosechado / Hectareas trabajadas`.
- Perdida de cabezal en Tirada de Aros: `((Granos del Aro Cabezal / 0.25) * PMG) / 100`.
- Perdida de cola en Tirada de Aros: `((Promedio de granos de los 3 Aros Cola / 0.25) * PMG) / 100`.
- Perdida total en Tirada de Aros: `Perdida Cabezal + Perdida Cola`.
- Diferencia de mermas en Distribucion: cantidad despachada total menos cantidad informada por la acopiadora.

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

- Los campos de texto editables del frontend aplican por defecto una mayuscula inicial mediante `onChangeCapture` en `App.jsx`. No se aplica a correos, contrasenias, fechas, numeros, buscadores ni identificadores/codigos con formato propio. Las excepciones se declaran con `data-text-case`: `preserve` conserva el valor y `upper` convierte todo a mayusculas. Variedad de Semilla usa `upper` y la API tambien la persiste en mayusculas.

- El formulario de registro y edicion de Siembras muestra debajo de cada campo una ayuda breve identificada como `Regla`, basada en las validaciones vigentes del frontend y la API. Los textos se centralizan en `SIEMBRA_FIELD_RULES` dentro de `Siembras.jsx` y deben actualizarse junto con cualquier cambio de obligatoriedad, rango, dependencia, calculo o condicion funcional; los errores dinamicos se mantienen separados y en rojo.

- Accesibilidad cambia exclusivamente el tamaño de las fuentes (Chico 100%, Medio 112%, Grande 124%) mediante font-size. No aplicar zoom ni transform de escala al body o contenedores; imagenes, iconos, sidebar y anchos de la estructura mantienen sus dimensiones. El texto puede ocupar mas lineas y aumentar naturalmente la altura del contenido.

- Antes de cambios relevantes, revisar contexto existente, `AGENTS.md` y documentos relacionados con la tarea.
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

- Almacenamiento esta integrado al menu y a la API; genera el ingreso inicial de grano al crear un silo. El script madre incluye su estructura y las bases existentes se actualizan con los dos incrementales de almacenamiento, sin ejecutar scripts de reasignacion de empresas.
- Pendiente de integracion estructural: Almacenamiento conserva Campania/Cosecha como texto libre y no posee EmpresaId ni aislamiento por empresa. Esto no reemplaza la regla objetivo de EmpresaId en tablas operativas; requiere una migracion especifica antes de considerarlo integrado al flujo multiempresa de Campanias/Cosechas.
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
- El flujo de empleados permite registrarse desde `Unirse a grupo` usando ID de grupo de gestion + OTP valida. La solicitud queda pendiente para el gerente; al aprobarla, el gerente puede dar acceso a todas sus empresas con un rol general o a empresas puntuales con roles discriminados por empresa.
- El modulo Cosechas queda implementado inicialmente con consulta, registro, edicion, detalle y documentacion. Mientras Campanias no exista como tabla, conserva `CampaniaNombre` como texto opcional y permite asociar una `SiembraId` existente para arrastrar lote, producto, empresa y hectareas trabajadas.

