/*
    Modulo: Lotes - cultivo actual e historial operativo.
    CultivoAnterior sirve como dato inicial para ordenar rotaciones al registrar campanias.
    CultivoActual y EstadoCultivo se actualizan con Campanias, Siembras y Cosechas.
*/
IF COL_LENGTH(N'dbo.Lotes', N'CultivoAnterior') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD CultivoAnterior NVARCHAR(60) NOT NULL CONSTRAINT DF_Lotes_CultivoAnterior DEFAULT (N'Sin dato') WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'CultivoActual') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD CultivoActual NVARCHAR(60) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'CultivoAnteriorCampania') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD CultivoAnteriorCampania NVARCHAR(20) NOT NULL CONSTRAINT DF_Lotes_CultivoAnteriorCampania DEFAULT (N'Sin dato') WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'EstadoCultivo') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD EstadoCultivo NVARCHAR(20) NOT NULL CONSTRAINT DF_Lotes_EstadoCultivo DEFAULT (N'Sin cultivo') WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Lotes_EstadoCultivo' AND parent_object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    ALTER TABLE dbo.Lotes WITH CHECK ADD CONSTRAINT CK_Lotes_EstadoCultivo CHECK (EstadoCultivo IN (N'Sin cultivo', N'Pendiente', N'Cultivado', N'Cosechado'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Lotes_CultivoActual_EstadoCultivo' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    CREATE INDEX IX_Lotes_CultivoActual_EstadoCultivo ON dbo.Lotes (CultivoActual, EstadoCultivo);
END;
GO
