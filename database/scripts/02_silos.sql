/*
    Modulo: Silos
    Fuente funcional: Manual de Usuario - Modulo Silos / Historias SILO-01 a SILO-06.

    dbo.Silos: instalaciones de almacenamiento (Chapa o Bolson). Pueden estar
    alojados dentro de un Lote existente (Ubicacion heredada) o ser independientes
    (Ubicacion cargada a mano, ej. planta de acopio propia).

    dbo.SiloControles: controles periodicos de humedad/temperatura/estado/plagas
    sobre el grano almacenado.

    dbo.SiloControlInsumos: insumos/agroquimicos aplicados como correctivo ante
    un problema detectado en un control.

    dbo.SiloDocumentos: metadatos de archivos adjuntos (el archivo en si se guarda
    en disco, en una carpeta local del servidor; aca solo se registra la ruta).
*/

USE AgroDigital;
GO

IF OBJECT_ID(N'dbo.Silos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Silos
    (
        SiloId INT IDENTITY(1,1) NOT NULL,
        LoteId INT NULL,
        Nombre NVARCHAR(100) NOT NULL,
        TipoSilo NVARCHAR(20) NOT NULL,
        CapacidadMax DECIMAL(18,4) NOT NULL,
        Producto NVARCHAR(60) NULL,
        CantidadGranoAlmacenado DECIMAL(18,4) NOT NULL CONSTRAINT DF_Silos_CantidadGranoAlmacenado DEFAULT (0),
        Pais NVARCHAR(100) NOT NULL,
        Provincia NVARCHAR(100) NOT NULL,
        Ciudad NVARCHAR(100) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Silos_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Silos_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Silos PRIMARY KEY CLUSTERED (SiloId),
        CONSTRAINT FK_Silos_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes (LoteId),
        CONSTRAINT CK_Silos_TipoSilo CHECK (TipoSilo IN (N'Chapa', N'Bolson')),
        CONSTRAINT CK_Silos_CapacidadMax CHECK (CapacidadMax > 0),
        CONSTRAINT CK_Silos_CantidadGranoAlmacenado CHECK (CantidadGranoAlmacenado >= 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Silos_LoteId' AND object_id = OBJECT_ID(N'dbo.Silos'))
BEGIN
    CREATE INDEX IX_Silos_LoteId
    ON dbo.Silos (LoteId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Silos_Nombre' AND object_id = OBJECT_ID(N'dbo.Silos'))
BEGIN
    CREATE INDEX IX_Silos_Nombre
    ON dbo.Silos (Nombre);
END;
GO

IF OBJECT_ID(N'dbo.SiloControles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiloControles
    (
        SiloControlId INT IDENTITY(1,1) NOT NULL,
        SiloId INT NOT NULL,
        Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_SiloControles_Fecha DEFAULT (SYSDATETIME()),
        HumedadGrano DECIMAL(5,2) NOT NULL,
        Temperatura DECIMAL(5,2) NOT NULL,
        EstadoGrano NVARCHAR(20) NOT NULL,
        PresenciaPlagas BIT NOT NULL,
        TipoPlaga NVARCHAR(100) NULL,
        RoturaBolsa BIT NULL,
        Observaciones NVARCHAR(500) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_SiloControles PRIMARY KEY CLUSTERED (SiloControlId),
        CONSTRAINT FK_SiloControles_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT FK_SiloControles_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_SiloControles_EstadoGrano CHECK (EstadoGrano IN (N'Bueno', N'Regular', N'Deteriorado'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiloControles_SiloId_Fecha' AND object_id = OBJECT_ID(N'dbo.SiloControles'))
BEGIN
    CREATE INDEX IX_SiloControles_SiloId_Fecha
    ON dbo.SiloControles (SiloId, Fecha);
END;
GO

IF OBJECT_ID(N'dbo.SiloControlInsumos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiloControlInsumos
    (
        SiloControlInsumoId INT IDENTITY(1,1) NOT NULL,
        SiloId INT NOT NULL,
        FechaAplicacion DATE NOT NULL,
        Marca NVARCHAR(100) NOT NULL,
        Tipo NVARCHAR(100) NOT NULL,
        Variedad NVARCHAR(100) NOT NULL,
        CantidadAplicada DECIMAL(18,4) NOT NULL,

        CONSTRAINT PK_SiloControlInsumos PRIMARY KEY CLUSTERED (SiloControlInsumoId),
        CONSTRAINT FK_SiloControlInsumos_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT CK_SiloControlInsumos_CantidadAplicada CHECK (CantidadAplicada > 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiloControlInsumos_SiloId' AND object_id = OBJECT_ID(N'dbo.SiloControlInsumos'))
BEGIN
    CREATE INDEX IX_SiloControlInsumos_SiloId
    ON dbo.SiloControlInsumos (SiloId);
END;
GO

IF OBJECT_ID(N'dbo.SiloDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiloDocumentos
    (
        SiloDocumentoId INT IDENTITY(1,1) NOT NULL,
        SiloId INT NOT NULL,
        NombreArchivo NVARCHAR(260) NOT NULL,
        RutaArchivo NVARCHAR(500) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_SiloDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
        CargadoPorUsuarioId INT NULL,

        CONSTRAINT PK_SiloDocumentos PRIMARY KEY CLUSTERED (SiloDocumentoId),
        CONSTRAINT FK_SiloDocumentos_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT FK_SiloDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiloDocumentos_SiloId' AND object_id = OBJECT_ID(N'dbo.SiloDocumentos'))
BEGIN
    CREATE INDEX IX_SiloDocumentos_SiloId
    ON dbo.SiloDocumentos (SiloId);
END;
GO
