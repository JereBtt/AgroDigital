USE AgroDigital;
GO

IF OBJECT_ID(N'dbo.LoteDeshabilitaciones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.LoteDeshabilitaciones
    (
        LoteDeshabilitacionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LoteId INT NOT NULL,
        SiembraId INT NULL,
        Motivo NVARCHAR(40) NOT NULL,
        Detalle NVARCHAR(500) NULL,
        Siniestro NVARCHAR(180) NULL,
        FechaSiniestro DATE NULL,
        EstadoSeguimientoAnterior NVARCHAR(20) NULL,
        SeguimientoAutomaticoId INT NULL,
        UsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_LoteDeshabilitaciones_FechaCreacion DEFAULT (SYSDATETIME()),
        CONSTRAINT FK_LoteDeshabilitaciones_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes(LoteId),
        CONSTRAINT FK_LoteDeshabilitaciones_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(UsuarioId),
        CONSTRAINT CK_LoteDeshabilitaciones_Motivo CHECK (Motivo IN (N'Alquilado recientemente', N'Fin de alquiler', N'Siniestro', N'Otro motivo')),
        CONSTRAINT CK_LoteDeshabilitaciones_Detalle CHECK ((Motivo = N'Otro motivo' AND NULLIF(LTRIM(RTRIM(Detalle)), N'') IS NOT NULL) OR (Motivo <> N'Otro motivo' AND Detalle IS NULL)),
        CONSTRAINT CK_LoteDeshabilitaciones_Siniestro CHECK ((Motivo = N'Siniestro' AND Siniestro IS NOT NULL AND FechaSiniestro IS NOT NULL) OR (Motivo <> N'Siniestro' AND Siniestro IS NULL AND FechaSiniestro IS NULL))
    );
END;
GO

IF OBJECT_ID(N'dbo.Siembras', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_LoteDeshabilitaciones_Siembras')
    ALTER TABLE dbo.LoteDeshabilitaciones ADD CONSTRAINT FK_LoteDeshabilitaciones_Siembras FOREIGN KEY (SiembraId) REFERENCES dbo.Siembras(SiembraId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LoteDeshabilitaciones_Lote_Fecha' AND object_id = OBJECT_ID(N'dbo.LoteDeshabilitaciones'))
    CREATE INDEX IX_LoteDeshabilitaciones_Lote_Fecha ON dbo.LoteDeshabilitaciones(LoteId, FechaCreacion DESC, LoteDeshabilitacionId DESC);
GO
