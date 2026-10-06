/*
    AgroDigital - Notificaciones por correo de las solicitudes de acceso
    Motor objetivo: Microsoft SQL Server 2019

    Nuevos avisos por correo:
      - NuevaSolicitud      -> al Gerente, cuando un empleado envía su solicitud.
      - SolicitudAprobada   -> al empleado, con su rol en cada empresa.
      - SolicitudRechazada  -> al empleado, cuando el Gerente la rechaza.
        (Las solicitudes "Descartadas" no se notifican: se usan para pedidos
         que el Gerente no reconoce.)

    Cada envío queda registrado en dbo.CorreosEnviados con
    ReferenciaTipo = 'SolicitudUsuario' y ReferenciaId = SolicitudUsuarioId.

    Este script solo amplía los tipos permitidos en CorreosEnviados.
    Ejecución: después de 26_invitaciones_empleado_correo.sql. Es idempotente.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_CorreosEnviados_Tipo'
      AND parent_object_id = OBJECT_ID(N'dbo.CorreosEnviados')
      AND definition NOT LIKE N'%SolicitudRechazada%')
BEGIN
    ALTER TABLE dbo.CorreosEnviados DROP CONSTRAINT CK_CorreosEnviados_Tipo;
END;
GO

IF OBJECT_ID(N'dbo.CK_CorreosEnviados_Tipo', N'C') IS NULL
    ALTER TABLE dbo.CorreosEnviados ADD CONSTRAINT CK_CorreosEnviados_Tipo
        CHECK (Tipo IN (
            N'InvitacionGerente',
            N'InvitacionEmpleado',
            N'NuevaSolicitud',
            N'SolicitudAprobada',
            N'SolicitudRechazada'));
GO

/*
    Consulta de prueba:

    SELECT TOP (20) CorreoEnviadoId, Tipo, Destinatario, Asunto, Estado, Error, ReferenciaTipo, ReferenciaId, FechaCreacion
    FROM dbo.CorreosEnviados
    ORDER BY CorreoEnviadoId DESC;
*/
