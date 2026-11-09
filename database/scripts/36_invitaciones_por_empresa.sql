/*
    AgroDigital - Invitaciones y solicitudes de acceso por empresa
    Motor objetivo: Microsoft SQL Server 2019

    Hasta ahora las invitaciones (OTP manual o por correo) y las solicitudes de
    acceso pertenecian solo al grupo de gestion. Si el Gerente tenia varias
    empresas no podia indicar para cual invitaba: la empresa se elegia recien
    al aprobar la solicitud.

    Con este cambio la invitacion guarda la empresa elegida por el Gerente en
    la pantalla Usuarios, la solicitud la hereda al usar la OTP y, al aprobarla,
    esa empresa aparece preseleccionada.

    Cambios:
      - dbo.GrupoGestionOtps.EmpresaId (NULL = invitacion sin empresa, como antes).
      - dbo.SolicitudesUsuario.EmpresaId (NULL = solicitud sin empresa, como antes).

    Las filas existentes quedan con EmpresaId en NULL y siguen funcionando igual.

    Ejecucion: en una base existente, despues de 35_lotes_invierno_tras_baja_verano.sql.
    Es idempotente: se puede volver a ejecutar sin problemas.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =====================================================================
   1. GrupoGestionOtps: empresa para la que se invita
   ===================================================================== */

IF COL_LENGTH(N'dbo.GrupoGestionOtps', N'EmpresaId') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD EmpresaId INT NULL;
GO

IF OBJECT_ID(N'dbo.FK_GrupoGestionOtps_Empresas', N'F') IS NULL
    ALTER TABLE dbo.GrupoGestionOtps ADD CONSTRAINT FK_GrupoGestionOtps_Empresas
        FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId);
GO

/* =====================================================================
   2. SolicitudesUsuario: empresa heredada de la invitacion
   ===================================================================== */

IF COL_LENGTH(N'dbo.SolicitudesUsuario', N'EmpresaId') IS NULL
    ALTER TABLE dbo.SolicitudesUsuario ADD EmpresaId INT NULL;
GO

IF OBJECT_ID(N'dbo.FK_SolicitudesUsuario_Empresas', N'F') IS NULL
    ALTER TABLE dbo.SolicitudesUsuario ADD CONSTRAINT FK_SolicitudesUsuario_Empresas
        FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId);
GO

/*
    Consultas de prueba:

    SELECT GrupoGestionOtpId, GrupoGestionId, EmpresaId, CorreoInvitado, Activo, Usado, FechaVencimiento
    FROM dbo.GrupoGestionOtps
    ORDER BY GrupoGestionOtpId DESC;

    SELECT SolicitudUsuarioId, GrupoGestionId, EmpresaId, CorreoElectronico, Estado
    FROM dbo.SolicitudesUsuario
    ORDER BY SolicitudUsuarioId DESC;
*/
