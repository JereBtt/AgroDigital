/*
    AgroDigital - Invitación de Gerentes por correo electrónico
    Motor objetivo: Microsoft SQL Server 2019

    Hasta ahora el Admin creaba el acceso de un Gerente y le tenía que pasar
    a mano el usuario y la contraseña temporal. Con este cambio:

      1. El Admin carga también el correo del Gerente.
      2. El sistema le envía un correo con un enlace de activación de un solo
         uso, que vence junto con el acceso (7 días).
      3. Al abrir el enlace, el Gerente entra directo a completar su registro.
         La contraseña temporal se mantiene como respaldo si el correo no llega.

    Cambios:
      - dbo.AccesosGerenteIniciales: correo invitado, hash del token de
        activación y resumen del último envío (lo que muestra la tabla del Admin).
      - dbo.CorreosEnviados (nueva): registro de cada intento de envío, con su
        resultado. Es genérica para reutilizarla en las próximas notificaciones
        (invitación de empleados, aviso de aprobación o rechazo).

    Seguridad:
      - El token de activación NUNCA se guarda en texto plano: se guarda su
        hash SHA-256 (64 caracteres hexadecimales).
      - Generar un token nuevo (reenvío) reemplaza el hash anterior, así que
        el enlace viejo deja de funcionar.

    Ejecución: en una base existente, después de 24_pantalla_principal.sql.
    Es idempotente: se puede volver a ejecutar sin problemas.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =====================================================================
   1. Columnas nuevas en AccesosGerenteIniciales
   (NULL para los accesos ya existentes, creados sin correo)
   ===================================================================== */

IF COL_LENGTH(N'dbo.AccesosGerenteIniciales', N'CorreoElectronico') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales ADD CorreoElectronico NVARCHAR(160) NULL;
GO

IF COL_LENGTH(N'dbo.AccesosGerenteIniciales', N'TokenActivacionHash') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales ADD TokenActivacionHash CHAR(64) NULL;
GO

IF COL_LENGTH(N'dbo.AccesosGerenteIniciales', N'EstadoEnvio') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales ADD EstadoEnvio NVARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.AccesosGerenteIniciales', N'FechaUltimoEnvio') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales ADD FechaUltimoEnvio DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.AccesosGerenteIniciales', N'CantidadEnvios') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales
        ADD CantidadEnvios INT NOT NULL CONSTRAINT DF_AccesosGerenteIniciales_CantidadEnvios DEFAULT (0) WITH VALUES;
GO

IF OBJECT_ID(N'dbo.CK_AccesosGerenteIniciales_EstadoEnvio', N'C') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales ADD CONSTRAINT CK_AccesosGerenteIniciales_EstadoEnvio
        CHECK (EstadoEnvio IS NULL OR EstadoEnvio IN (N'Pendiente', N'Enviado', N'Error'));
GO

IF OBJECT_ID(N'dbo.CK_AccesosGerenteIniciales_CantidadEnvios', N'C') IS NULL
    ALTER TABLE dbo.AccesosGerenteIniciales ADD CONSTRAINT CK_AccesosGerenteIniciales_CantidadEnvios
        CHECK (CantidadEnvios >= 0);
GO

-- Un token de activación identifica un único acceso.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AccesosGerenteIniciales_TokenActivacion'
               AND object_id = OBJECT_ID(N'dbo.AccesosGerenteIniciales'))
    CREATE UNIQUE INDEX UX_AccesosGerenteIniciales_TokenActivacion
        ON dbo.AccesosGerenteIniciales (TokenActivacionHash)
        WHERE TokenActivacionHash IS NOT NULL;
GO

-- Búsqueda de correos repetidos al crear un acceso.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccesosGerenteIniciales_Correo'
               AND object_id = OBJECT_ID(N'dbo.AccesosGerenteIniciales'))
    CREATE INDEX IX_AccesosGerenteIniciales_Correo
        ON dbo.AccesosGerenteIniciales (CorreoElectronico)
        WHERE CorreoElectronico IS NOT NULL;
GO

/* =====================================================================
   2. CorreosEnviados: un registro por cada intento de envío
   ===================================================================== */

IF OBJECT_ID(N'dbo.CorreosEnviados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CorreosEnviados
    (
        CorreoEnviadoId INT IDENTITY(1,1) NOT NULL,
        Tipo NVARCHAR(40) NOT NULL,                -- InvitacionGerente (y los que se agreguen)
        Destinatario NVARCHAR(160) NOT NULL,
        Asunto NVARCHAR(200) NOT NULL,
        Estado NVARCHAR(20) NOT NULL,              -- Enviado | Error
        Error NVARCHAR(500) NULL,                  -- motivo técnico si falló
        ReferenciaTipo NVARCHAR(40) NULL,          -- tabla de origen, ej. AccesoGerenteInicial
        ReferenciaId INT NULL,                     -- id del registro de origen
        EnviadoPorUsuarioId INT NULL,              -- quién disparó el envío
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CorreosEnviados_FechaCreacion DEFAULT (SYSDATETIME()),

        CONSTRAINT PK_CorreosEnviados PRIMARY KEY CLUSTERED (CorreoEnviadoId),
        CONSTRAINT FK_CorreosEnviados_Usuarios FOREIGN KEY (EnviadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_CorreosEnviados_Tipo CHECK (Tipo IN (N'InvitacionGerente')),
        CONSTRAINT CK_CorreosEnviados_Estado CHECK (Estado IN (N'Enviado', N'Error'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CorreosEnviados_Referencia'
               AND object_id = OBJECT_ID(N'dbo.CorreosEnviados'))
    CREATE INDEX IX_CorreosEnviados_Referencia
        ON dbo.CorreosEnviados (ReferenciaTipo, ReferenciaId, FechaCreacion DESC);
GO

/*
    Consultas de prueba:

    SELECT AccesoGerenteInicialId, ResponsableInicial, CorreoElectronico, Estado,
           EstadoEnvio, FechaUltimoEnvio, CantidadEnvios, FechaVencimiento,
           CASE WHEN TokenActivacionHash IS NULL THEN 'No' ELSE 'Sí' END AS TieneToken
    FROM dbo.AccesosGerenteIniciales
    ORDER BY AccesoGerenteInicialId DESC;

    SELECT TOP (20) * FROM dbo.CorreosEnviados ORDER BY CorreoEnviadoId DESC;
*/
