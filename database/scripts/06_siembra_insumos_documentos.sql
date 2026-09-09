/*
    Modulo: Siembras (fase 2 - Registrar Siembra)
    Fuente funcional: Manual de Usuario / Historia SIEM-01.

    Requiere que dbo.Siembras ya exista (correr 05_siembras.sql antes que este script).

    dbo.SiembraInsumos: plan de fertilizacion/insumos cargado al registrar la siembra
    (tabla dinamica, se puede agregar mas de un insumo por siembra).

    dbo.SiembraDocumentos: archivos adjuntos a la siembra (mismo patron que
    dbo.SiloDocumentos: el archivo se guarda en disco, aca solo se registra la ruta).
*/
IF OBJECT_ID(N'dbo.SiembraInsumos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiembraInsumos
    (
        SiembraInsumoId INT IDENTITY(1,1) NOT NULL,
        SiembraId INT NOT NULL,
        FechaAplicacion DATE NOT NULL,
        Marca NVARCHAR(100) NOT NULL,
        Tipo NVARCHAR(100) NOT NULL,
        Variedad NVARCHAR(100) NULL,
        CantidadAplicada DECIMAL(18,4) NOT NULL,
        UnidadMedida NVARCHAR(10) NOT NULL,

        CONSTRAINT PK_SiembraInsumos PRIMARY KEY CLUSTERED (SiembraInsumoId),
        CONSTRAINT FK_SiembraInsumos_Siembras FOREIGN KEY (SiembraId) REFERENCES dbo.Siembras (SiembraId),
        CONSTRAINT CK_SiembraInsumos_CantidadAplicada CHECK (CantidadAplicada > 0)
    );
END;
GO

IF COL_LENGTH(N'dbo.SiembraInsumos', N'UnidadMedida') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraInsumos ADD UnidadMedida NVARCHAR(10) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiembraInsumos_SiembraId' AND object_id = OBJECT_ID(N'dbo.SiembraInsumos'))
BEGIN
    CREATE INDEX IX_SiembraInsumos_SiembraId
    ON dbo.SiembraInsumos (SiembraId);
END;
GO

IF OBJECT_ID(N'dbo.SiembraDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiembraDocumentos
    (
        SiembraDocumentoId INT IDENTITY(1,1) NOT NULL,
        SiembraId INT NOT NULL,
        NombreArchivo NVARCHAR(260) NOT NULL,
        RutaArchivo NVARCHAR(500) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_SiembraDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
        CargadoPorUsuarioId INT NULL,

        CONSTRAINT PK_SiembraDocumentos PRIMARY KEY CLUSTERED (SiembraDocumentoId),
        CONSTRAINT FK_SiembraDocumentos_Siembras FOREIGN KEY (SiembraId) REFERENCES dbo.Siembras (SiembraId),
        CONSTRAINT FK_SiembraDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiembraDocumentos_SiembraId' AND object_id = OBJECT_ID(N'dbo.SiembraDocumentos'))
BEGIN
    CREATE INDEX IX_SiembraDocumentos_SiembraId
    ON dbo.SiembraDocumentos (SiembraId);
END;
GO
