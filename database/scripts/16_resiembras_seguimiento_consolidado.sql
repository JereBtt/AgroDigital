/*
    Seguimiento consolidado de resiembras.
    Mantiene las recorridas vinculadas a cada siembra y permite identificarlas
    dentro del historial consolidado de la última resiembra.
*/
USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'Cultivo') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos ADD Cultivo NVARCHAR(60) NULL;
END;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'EsResiembra') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos
        ADD EsResiembra BIT NOT NULL
            CONSTRAINT DF_SiembraSeguimientos_EsResiembra DEFAULT (0) WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Siembras_Lote_Campania_Resiembra' AND object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    CREATE INDEX IX_Siembras_Lote_Campania_Resiembra
        ON dbo.Siembras (LoteId, CampaniaNombre, TipoRegistro, SiembraId);
END;
GO
