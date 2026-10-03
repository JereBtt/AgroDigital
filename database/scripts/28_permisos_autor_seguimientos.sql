/*
    AgroDigital - Permisos por rol: autor de los seguimientos de siembra
    Motor objetivo: Microsoft SQL Server 2019

    Matriz de permisos acordada (actualiza la tabla de Roles del Manual de Usuario):
      - Gerente y Encargado: gestión completa de los módulos operativos.
      - Empleado de campo: CARGA de registros de campo (seguimiento de siembra,
        tirada de aros y control de silo). Solo puede editar o eliminar los
        registros que cargó él mismo, y no puede finalizar etapas.
      - Empleado administrativo: gestión de Almacenamiento y Distribución.

    Para la regla "solo los que cargó él mismo" cada registro de campo necesita
    guardar su autor. SiloControles y CosechaTiradaAros ya tienen
    CreadoPorUsuarioId; a SiembraSeguimientos le faltaba.

    Los seguimientos existentes quedan con autor NULL: los puede editar el
    Gerente o el Encargado, pero no un Empleado de campo.

    Ejecución: después de 27_notificaciones_solicitudes.sql. Es idempotente.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'CreadoPorUsuarioId') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos ADD CreadoPorUsuarioId INT NULL;
GO

IF OBJECT_ID(N'dbo.FK_SiembraSeguimientos_CreadoPor', N'F') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos WITH CHECK
        ADD CONSTRAINT FK_SiembraSeguimientos_CreadoPor
        FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId);
GO

/*
    Consulta de prueba:

    SELECT TOP (20) SiembraSeguimientoId, SiembraId, Fecha, TipoRegistro, CreadoPorUsuarioId
    FROM dbo.SiembraSeguimientos
    ORDER BY SiembraSeguimientoId DESC;
*/
