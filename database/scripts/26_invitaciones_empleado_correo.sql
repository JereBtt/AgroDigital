/*
    AgroDigital - Invitación de empleados por correo electrónico
    Motor objetivo: Microsoft SQL Server 2019

    Hasta ahora el Gerente generaba una OTP y se la tenía que pasar a mano al
    empleado, junto con el código del grupo. La OTP no estaba asociada a nadie:
    cualquiera que la consiguiera podía usarla. Con este cambio:

      1. El Gerente carga el correo (y opcionalmente el nombre) del empleado.
      2. El sistema genera una OTP asociada a ese correo y le envía un correo
         con el código del grupo, la OTP y un enlace a "Solicitar acceso"
         con los datos precargados.
      3. Al solicitar el acceso se valida que el correo coincida con el de la
         invitación.

    La OTP manual (sin correo) se mantiene como respaldo: en esas filas las
    columnas nuevas quedan en NULL y funcionan como hasta ahora.

    Cambios:
      - dbo.GrupoGestionOtps: correo y nombre del invitado y resumen del envío.
        Reenviar una invitación reemplaza el hash de la OTP en la misma fila,
        así la OTP anterior deja de funcionar.
        Estados de una invitación (se deducen, no se guardan):
          Pendiente  -> Activo = 1, Usado = 0, no vencida
          Vencida    -> Activo = 1, Usado = 0, FechaVencimiento pasada
          Usada      -> Usado = 1 (el empleado envió su solicitud)
          Cancelada  -> Activo = 0, Usado = 0
      - dbo.CorreosEnviados: se habilita el tipo 'InvitacionEmpleado'.

    Ejecución: en una base existente, después de 25_invitaciones_gerente_correo.sql.
    Es idempotente: se puede volver a ejecutar sin problemas.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =====================================================================
   1. Columnas nuevas en GrupoGestionOtps
   ===================================================================== */

IF COL_LENGTH(N'dbo.GrupoGestionOtps', N'CorreoInvitado') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD CorreoInvitado NVARCHAR(160) NULL;
GO

IF COL_LENGTH(N'dbo.GrupoGestionOtps', N'NombreInvitado') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD NombreInvitado NVARCHAR(150) NULL;
GO

IF COL_LENGTH(N'dbo.GrupoGestionOtps', N'EstadoEnvio') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD EstadoEnvio NVARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.GrupoGestionOtps', N'FechaUltimoEnvio') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD FechaUltimoEnvio DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.GrupoGestionOtps', N'CantidadEnvios') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps
        ADD CantidadEnvios INT NOT NULL CONSTRAINT DF_GrupoGestionOtps_CantidadEnvios DEFAULT (0) WITH VALUES;
GO

IF OBJECT_ID(N'dbo.CK_GrupoGestionOtps_EstadoEnvio', N'C') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD CONSTRAINT CK_GrupoGestionOtps_EstadoEnvio
        CHECK (EstadoEnvio IS NULL OR EstadoEnvio IN (N'Pendiente', N'Enviado', N'Error'));
GO

IF OBJECT_ID(N'dbo.CK_GrupoGestionOtps_CantidadEnvios', N'C') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD CONSTRAINT CK_GrupoGestionOtps_CantidadEnvios
        CHECK (CantidadEnvios >= 0);
GO

-- Invitaciones de un grupo por correo (lista del Gerente y control de duplicados).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GrupoGestionOtps_Grupo_Correo'
               AND object_id = OBJECT_ID(N'dbo.GrupoGestionOtps'))
    CREATE INDEX IX_GrupoGestionOtps_Grupo_Correo
        ON dbo.GrupoGestionOtps (GrupoGestionId, CorreoInvitado)
        INCLUDE (Activo, Usado, FechaVencimiento)
        WHERE CorreoInvitado IS NOT NULL;
GO

/* =====================================================================
   2. CorreosEnviados: nuevo tipo de correo
   ===================================================================== */

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_CorreosEnviados_Tipo'
      AND parent_object_id = OBJECT_ID(N'dbo.CorreosEnviados')
      AND definition NOT LIKE N'%InvitacionEmpleado%')
BEGIN
    ALTER TABLE dbo.CorreosEnviados DROP CONSTRAINT CK_CorreosEnviados_Tipo;
END;
GO

IF OBJECT_ID(N'dbo.CK_CorreosEnviados_Tipo', N'C') IS NULL
    ALTER TABLE dbo.CorreosEnviados ADD CONSTRAINT CK_CorreosEnviados_Tipo
        CHECK (Tipo IN (N'InvitacionGerente', N'InvitacionEmpleado'));
GO

/*
    Consultas de prueba:

    SELECT GrupoGestionOtpId, GrupoGestionId, CorreoInvitado, NombreInvitado,
           Activo, Usado, FechaVencimiento, EstadoEnvio, FechaUltimoEnvio, CantidadEnvios
    FROM dbo.GrupoGestionOtps
    ORDER BY GrupoGestionOtpId DESC;

    SELECT TOP (20) * FROM dbo.CorreosEnviados ORDER BY CorreoEnviadoId DESC;
*/
