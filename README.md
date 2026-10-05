# Base de datos - AgroDigital

Esta carpeta contiene los scripts y notas de la base de datos relacional de AgroDigital.

## Script madre

- `scripts/00_master_create_database.sql`

Este archivo debe conservar la creacion completa de la base de datos. A medida que se agreguen nuevos modulos, el script madre debe actualizarse para poder reconstruir la estructura completa desde cero.

## Actualizacion incremental de Almacenamiento

En una base existente, ejecutar `scripts/09_almacenamiento.sql` y luego
`scripts/10_almacenamiento_campania_cosecha.sql`, una vez disponibles Silos y Usuarios.
Ambos agregan estructura sin reasignar empresas ni modificar los registros operativos existentes.
El script madre tambien incluye esta estructura para instalaciones nuevas.

Los prefijos 09 y 10 estan compartidos con Cosechas y Campanias: usar el nombre
completo del archivo, no solo su numero. No ejecutar todos los scripts automaticamente;
`13_campanias_periodo_empresa.sql` contiene una reasignacion especifica a ElSauceSA.

Almacenamiento conserva por ahora referencias textuales a campaña/cosecha y esta
pendiente su migracion a relaciones y separacion por empresa.

## Rediseño de Cosechas

En una base existente, ejecutar `scripts/29_cosechas_rediseno.sql` despues de
`28_permisos_autor_seguimientos.sql`. Es idempotente y no borra datos. Agrega:

- En `dbo.Cosechas`: `EmpresaId` (completado desde el lote), `HectareasHora`,
  `EstadoControl` (control de perdidas separado del estado de la cosecha),
  datos de maquinaria y la foto del rinde seco al finalizar.
- Indice unico filtrado `UX_Cosechas_SiembraId`: una cosecha por siembra. Si ya
  hay duplicados, el script no lo crea y lista los casos a corregir.
- `dbo.GranoToleranciasCosecha`: tolerancias de perdida de referencia INTA PRECOP
  y PMG de referencia por grano (global, solo lectura).
- `dbo.GranoParametrosCosecha`: ajuste opcional de tolerancia y factor de
  severidad por empresa. Sin fila para la empresa se usa la referencia global.
- En `dbo.CosechaTiradaAros`: perdida de precosecha y foto de los parametros
  con los que se clasifico cada tirada.
- `dbo.CosechaPartes` y la vista `dbo.vw_CosechasAvance`: partes diarios de
  avance. El origen `Cosecha` se suma a `CK_Almacenamientos_Origen` para los
  ingresos a silo generados por un parte.

El script madre todavia no incluye Siembras ni Cosechas: en una instalacion
nueva, ejecutar los incrementales de esos modulos en orden.

## Alcance inicial de Lotes

El primer modulo modelado es Lotes, tomando como referencia funcional el Manual de Usuario:

- Nombre.
- Pais.
- Provincia.
- Ciudad.
- Condicion: Propio o Alquilado.
- Hectareas.
- Superficie total.
- Coordenadas de las esquinas del lote marcadas en el mapa.
