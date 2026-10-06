-- Conserva los motivos al retirar una o ambas planificaciones de un lote.
IF OBJECT_ID(N'dbo.CampaniaPlanificacionBajas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CampaniaPlanificacionBajas
    (
        CampaniaPlanificacionBajaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CampaniaId INT NOT NULL,
        LoteId INT NOT NULL,
        Producto NVARCHAR(60) NOT NULL,
        CicloEstacional NVARCHAR(10) NOT NULL,
        Motivo NVARCHAR(40) NOT NULL,
        Detalle NVARCHAR(500) NULL,
        Siniestro NVARCHAR(180) NULL,
        FechaSiniestro DATE NULL,
        LoteDeshabilitado BIT NOT NULL,
        LoteDeshabilitacionId INT NULL,
        UsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CampaniaPlanificacionBajas_FechaCreacion DEFAULT (SYSDATETIME()),
        CONSTRAINT FK_CampaniaPlanificacionBajas_Campanias FOREIGN KEY (CampaniaId) REFERENCES dbo.Campanias(CampaniaId),
        CONSTRAINT FK_CampaniaPlanificacionBajas_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes(LoteId),
        CONSTRAINT FK_CampaniaPlanificacionBajas_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(UsuarioId),
        CONSTRAINT CK_CampaniaPlanificacionBajas_Ciclo CHECK (CicloEstacional IN (N'Verano', N'Invierno')),
        CONSTRAINT CK_CampaniaPlanificacionBajas_Motivo CHECK (Motivo IN (N'Fin de alquiler', N'Siniestro', N'Otro motivo')),
        CONSTRAINT CK_CampaniaPlanificacionBajas_Detalle CHECK ((Motivo = N'Otro motivo' AND NULLIF(LTRIM(RTRIM(Detalle)), N'') IS NOT NULL) OR (Motivo <> N'Otro motivo' AND Detalle IS NULL)),
        CONSTRAINT CK_CampaniaPlanificacionBajas_Siniestro CHECK ((Motivo = N'Siniestro' AND Siniestro IS NOT NULL AND FechaSiniestro IS NOT NULL) OR (Motivo <> N'Siniestro' AND Siniestro IS NULL AND FechaSiniestro IS NULL))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CampaniaPlanificacionBajas_Campania_Lote' AND object_id = OBJECT_ID(N'dbo.CampaniaPlanificacionBajas'))
    CREATE INDEX IX_CampaniaPlanificacionBajas_Campania_Lote
    ON dbo.CampaniaPlanificacionBajas(CampaniaId, LoteId, FechaCreacion DESC);
GO
