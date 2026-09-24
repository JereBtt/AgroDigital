USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.Siembras', N'CicloCultivo') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD CicloCultivo NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'TipoImplantacion') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD TipoImplantacion NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_CicloCultivo' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_CicloCultivo
        CHECK (CicloCultivo IS NULL OR CicloCultivo IN (N'Corto', N'Largo'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_TipoImplantacion' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_TipoImplantacion
        CHECK (TipoImplantacion IS NULL OR TipoImplantacion IN (N'Primera', N'Segunda', N'Temprano', N'Tardío'));
END;
GO
