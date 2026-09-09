/*
    Siembras: urea por hectarea y unidad de medida de agroquimicos.
    Ejecutar despues de 05_siembras.sql y 06_siembra_insumos_documentos.sql.
*/
IF COL_LENGTH(N'dbo.Siembras', N'UreaKgHa') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD UreaKgHa DECIMAL(18,4) NULL;
END;
GO

IF COL_LENGTH(N'dbo.SiembraInsumos', N'UnidadMedida') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraInsumos ADD UnidadMedida NVARCHAR(10) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_UreaKgHa' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_UreaKgHa CHECK (UreaKgHa IS NULL OR UreaKgHa >= 0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SiembraInsumos_UnidadMedida' AND parent_object_id = OBJECT_ID(N'dbo.SiembraInsumos'))
BEGIN
    ALTER TABLE dbo.SiembraInsumos
    ADD CONSTRAINT CK_SiembraInsumos_UnidadMedida CHECK (UnidadMedida IS NULL OR UnidadMedida IN (N'Litros', N'Kg'));
END;
GO
