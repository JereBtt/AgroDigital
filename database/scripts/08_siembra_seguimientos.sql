/*
    Modulo: Seguimiento de Siembra
    Fuente funcional: Manual de Usuario, seccion "Seguimiento de Siembra" / Historia SIEM-04.

    dbo.SiembraSeguimientos: cada fila es una "recorrida" al lote durante el seguimiento de
    una Siembra (visita con coordenadas del mapa, incidencia detectada, etc.).

    dbo.SeguimientoInsumos y dbo.SeguimientoDocumentos: igual patron que ya usamos en
    Silos (SiloControlIncidencias/Insumos/Documentos) y en Siembras (SiembraInsumos):
    cuelgan de la recorrida puntual (SiembraSeguimientoId), no de la Siembra en general.
    Los campos de Insumos ya nacen opcionales (mismo criterio que el resto del sistema).
*/
IF OBJECT_ID(N'dbo.SiembraSeguimientos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiembraSeguimientos
    (
        SiembraSeguimientoId INT IDENTITY(1,1) NOT NULL,
        SiembraId INT NOT NULL,
        Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_SiembraSeguimientos_Fecha DEFAULT (SYSDATETIME()),
        Longitud DECIMAL(18,10) NULL,
        Latitud DECIMAL(18,10) NULL,
        Incidencia NVARCHAR(30) NULL,
        PerdidaEconomica BIT NULL,
        AplicacionAgroquimicos BIT NULL,
        Observaciones NVARCHAR(500) NOT NULL,

        CONSTRAINT PK_SiembraSeguimientos PRIMARY KEY CLUSTERED (SiembraSeguimientoId),
        CONSTRAINT FK_SiembraSeguimientos_Siembras FOREIGN KEY (SiembraId) REFERENCES dbo.Siembras (SiembraId),
        CONSTRAINT CK_SiembraSeguimientos_Incidencia CHECK (Incidencia IS NULL OR Incidencia IN (N'Plaga', N'Maleza', N'Enfermedad', N'Ninguna'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiembraSeguimientos_SiembraId' AND object_id = OBJECT_ID(N'dbo.SiembraSeguimientos'))
BEGIN
    CREATE INDEX IX_SiembraSeguimientos_SiembraId
    ON dbo.SiembraSeguimientos (SiembraId);
END;
GO

IF OBJECT_ID(N'dbo.SeguimientoInsumos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SeguimientoInsumos
    (
        SeguimientoInsumoId INT IDENTITY(1,1) NOT NULL,
        SiembraSeguimientoId INT NOT NULL,
        FechaAplicacion DATE NULL,
        Marca NVARCHAR(100) NULL,
        Tipo NVARCHAR(100) NULL,
        Variedad NVARCHAR(100) NULL,
        CantidadAplicada DECIMAL(18,4) NULL,

        CONSTRAINT PK_SeguimientoInsumos PRIMARY KEY CLUSTERED (SeguimientoInsumoId),
        CONSTRAINT FK_SeguimientoInsumos_Seguimientos FOREIGN KEY (SiembraSeguimientoId) REFERENCES dbo.SiembraSeguimientos (SiembraSeguimientoId),
        CONSTRAINT CK_SeguimientoInsumos_CantidadAplicada CHECK (CantidadAplicada IS NULL OR CantidadAplicada > 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SeguimientoInsumos_SiembraSeguimientoId' AND object_id = OBJECT_ID(N'dbo.SeguimientoInsumos'))
BEGIN
    CREATE INDEX IX_SeguimientoInsumos_SiembraSeguimientoId
    ON dbo.SeguimientoInsumos (SiembraSeguimientoId);
END;
GO

IF OBJECT_ID(N'dbo.SeguimientoDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SeguimientoDocumentos
    (
        SeguimientoDocumentoId INT IDENTITY(1,1) NOT NULL,
        SiembraSeguimientoId INT NOT NULL,
        NombreArchivo NVARCHAR(260) NOT NULL,
        RutaArchivo NVARCHAR(500) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_SeguimientoDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
        CargadoPorUsuarioId INT NULL,

        CONSTRAINT PK_SeguimientoDocumentos PRIMARY KEY CLUSTERED (SeguimientoDocumentoId),
        CONSTRAINT FK_SeguimientoDocumentos_Seguimientos FOREIGN KEY (SiembraSeguimientoId) REFERENCES dbo.SiembraSeguimientos (SiembraSeguimientoId),
        CONSTRAINT FK_SeguimientoDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SeguimientoDocumentos_SiembraSeguimientoId' AND object_id = OBJECT_ID(N'dbo.SeguimientoDocumentos'))
BEGIN
    CREATE INDEX IX_SeguimientoDocumentos_SiembraSeguimientoId
    ON dbo.SeguimientoDocumentos (SiembraSeguimientoId);
END;
GO
