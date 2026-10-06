-- Motivos por los que un lote habilitado con cultivo de invierno no tiene planificación de verano.
IF OBJECT_ID(N'dbo.CampaniaVeranoOmisiones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CampaniaVeranoOmisiones
    (
        CampaniaVeranoOmisionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CampaniaId INT NOT NULL,
        LoteId INT NOT NULL,
        Motivo NVARCHAR(500) NOT NULL,
        Detalle NVARCHAR(500) NULL,
        Siniestro NVARCHAR(180) NULL,
        FechaSiniestro DATE NULL,
        Vigente BIT NOT NULL CONSTRAINT DF_CampaniaVeranoOmisiones_Vigente DEFAULT (1),
        RegistradaEnBajaPlanificacion BIT NOT NULL CONSTRAINT DF_CampaniaVeranoOmisiones_RegistradaEnBaja DEFAULT (0),
        UsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CampaniaVeranoOmisiones_FechaCreacion DEFAULT (SYSDATETIME()),
        CONSTRAINT FK_CampaniaVeranoOmisiones_Campanias FOREIGN KEY (CampaniaId) REFERENCES dbo.Campanias(CampaniaId),
        CONSTRAINT FK_CampaniaVeranoOmisiones_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes(LoteId),
        CONSTRAINT FK_CampaniaVeranoOmisiones_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(UsuarioId),
        CONSTRAINT CK_CampaniaVeranoOmisiones_Motivo CHECK (NULLIF(LTRIM(RTRIM(Motivo)), N'') IS NOT NULL)
    );
END;
GO

IF COL_LENGTH(N'dbo.CampaniaVeranoOmisiones', N'RegistradaEnBajaPlanificacion') IS NULL
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD RegistradaEnBajaPlanificacion BIT NOT NULL
        CONSTRAINT DF_CampaniaVeranoOmisiones_RegistradaEnBaja DEFAULT (0) WITH VALUES;
GO

IF COL_LENGTH(N'dbo.CampaniaVeranoOmisiones', N'Detalle') IS NULL
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD Detalle NVARCHAR(500) NULL;
IF COL_LENGTH(N'dbo.CampaniaVeranoOmisiones', N'Siniestro') IS NULL
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD Siniestro NVARCHAR(180) NULL;
IF COL_LENGTH(N'dbo.CampaniaVeranoOmisiones', N'FechaSiniestro') IS NULL
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD FechaSiniestro DATE NULL;
GO

-- Los motivos de texto libre anteriores se conservan como detalle de Otro motivo.
UPDATE dbo.CampaniaVeranoOmisiones
SET Detalle = Motivo, Motivo = N'Otro motivo'
WHERE Motivo NOT IN (N'Fin de alquiler', N'Siniestro', N'Otro motivo');
UPDATE dbo.CampaniaVeranoOmisiones
SET Detalle = N'Sin detalle histórico'
WHERE Motivo = N'Otro motivo' AND NULLIF(LTRIM(RTRIM(Detalle)), N'') IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CampaniaVeranoOmisiones_MotivoCatalogo' AND parent_object_id = OBJECT_ID(N'dbo.CampaniaVeranoOmisiones'))
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD CONSTRAINT CK_CampaniaVeranoOmisiones_MotivoCatalogo
    CHECK (Motivo IN (N'Fin de alquiler', N'Siniestro', N'Otro motivo'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CampaniaVeranoOmisiones_Detalle' AND parent_object_id = OBJECT_ID(N'dbo.CampaniaVeranoOmisiones'))
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD CONSTRAINT CK_CampaniaVeranoOmisiones_Detalle
    CHECK ((Motivo = N'Otro motivo' AND NULLIF(LTRIM(RTRIM(Detalle)), N'') IS NOT NULL) OR (Motivo <> N'Otro motivo' AND Detalle IS NULL));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CampaniaVeranoOmisiones_Siniestro' AND parent_object_id = OBJECT_ID(N'dbo.CampaniaVeranoOmisiones'))
    ALTER TABLE dbo.CampaniaVeranoOmisiones ADD CONSTRAINT CK_CampaniaVeranoOmisiones_Siniestro
    CHECK ((Motivo = N'Siniestro' AND Siniestro IS NOT NULL AND FechaSiniestro IS NOT NULL) OR (Motivo <> N'Siniestro' AND Siniestro IS NULL AND FechaSiniestro IS NULL));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CampaniaVeranoOmisiones_Campania_Lote' AND object_id = OBJECT_ID(N'dbo.CampaniaVeranoOmisiones'))
    CREATE INDEX IX_CampaniaVeranoOmisiones_Campania_Lote
    ON dbo.CampaniaVeranoOmisiones(CampaniaId, LoteId, CampaniaVeranoOmisionId DESC);
GO
