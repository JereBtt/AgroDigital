/*
    Modulo: Silos - Incidencias/Insumos/Documentos por Control (no por Silo)

    Hasta ahora dbo.SiloControlIncidencias, dbo.SiloControlInsumos y
    dbo.SiloDocumentos colgaban directo de SiloId: todo lo cargado se veia
    mezclado para el silo entero, sin importar en que control se habia
    cargado.

    La pantalla de Historial (prototipo) muestra que cada CONTROL puntual
    tiene sus propias incidencias, insumos y documentos. Este script recrea
    esas 3 tablas para que cuelguen de SiloControlId en vez de SiloId.

    IMPORTANTE: esto ELIMINA los datos que hubiera en esas 3 tablas (no toca
    dbo.Silos ni dbo.SiloControles). Como es una base de desarrollo/pruebas,
    se resuelve con DROP + CREATE en vez de una migracion de datos.

    Correr DESPUES de 03_silo_control_rediseno.sql (que ya debe estar
    aplicado: PresenciaPlagas/TipoPlaga sacados de SiloControles).
*/
USE AgroDigital;
GO

-- 1) Incidencias: ahora cuelgan del Control, no del Silo
IF OBJECT_ID(N'dbo.SiloControlIncidencias', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.SiloControlIncidencias;
END;
GO

CREATE TABLE dbo.SiloControlIncidencias
(
    SiloControlIncidenciaId INT IDENTITY(1,1) NOT NULL,
    SiloControlId INT NOT NULL,
    Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_SiloControlIncidencias_Fecha DEFAULT (SYSDATETIME()),
    TipoPlaga NVARCHAR(50) NOT NULL,
    Observaciones NVARCHAR(500) NOT NULL,

    CONSTRAINT PK_SiloControlIncidencias PRIMARY KEY CLUSTERED (SiloControlIncidenciaId),
    CONSTRAINT FK_SiloControlIncidencias_SiloControles FOREIGN KEY (SiloControlId) REFERENCES dbo.SiloControles (SiloControlId),
    CONSTRAINT CK_SiloControlIncidencias_TipoPlaga CHECK (TipoPlaga IN (N'Roedores', N'Insectos', N'Hongos'))
);
GO

CREATE INDEX IX_SiloControlIncidencias_SiloControlId
ON dbo.SiloControlIncidencias (SiloControlId);
GO

-- 2) Insumos: ahora cuelgan del Control, no del Silo
IF OBJECT_ID(N'dbo.SiloControlInsumos', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.SiloControlInsumos;
END;
GO

CREATE TABLE dbo.SiloControlInsumos
(
    SiloControlInsumoId INT IDENTITY(1,1) NOT NULL,
    SiloControlId INT NOT NULL,
    FechaAplicacion DATE NOT NULL,
    Marca NVARCHAR(100) NOT NULL,
    Tipo NVARCHAR(100) NOT NULL,
    CantidadAplicada DECIMAL(18,4) NOT NULL,

    CONSTRAINT PK_SiloControlInsumos PRIMARY KEY CLUSTERED (SiloControlInsumoId),
    CONSTRAINT FK_SiloControlInsumos_SiloControles FOREIGN KEY (SiloControlId) REFERENCES dbo.SiloControles (SiloControlId),
    CONSTRAINT CK_SiloControlInsumos_CantidadAplicada CHECK (CantidadAplicada > 0)
);
GO

CREATE INDEX IX_SiloControlInsumos_SiloControlId
ON dbo.SiloControlInsumos (SiloControlId);
GO

-- 3) Documentos: ahora cuelgan del Control, no del Silo
IF OBJECT_ID(N'dbo.SiloDocumentos', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.SiloDocumentos;
END;
GO

CREATE TABLE dbo.SiloDocumentos
(
    SiloDocumentoId INT IDENTITY(1,1) NOT NULL,
    SiloControlId INT NOT NULL,
    NombreArchivo NVARCHAR(260) NOT NULL,
    RutaArchivo NVARCHAR(500) NOT NULL,
    FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_SiloDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
    CargadoPorUsuarioId INT NULL,

    CONSTRAINT PK_SiloDocumentos PRIMARY KEY CLUSTERED (SiloDocumentoId),
    CONSTRAINT FK_SiloDocumentos_SiloControles FOREIGN KEY (SiloControlId) REFERENCES dbo.SiloControles (SiloControlId),
    CONSTRAINT FK_SiloDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
);
GO

CREATE INDEX IX_SiloDocumentos_SiloControlId
ON dbo.SiloDocumentos (SiloControlId);
GO
