/*
    Evolución del Seguimiento de Siembra.
    Conserva las recorridas existentes como posemergentes y separa los nuevos
    registros en Siniestros y Posemergentes sin perder su georreferenciación.
*/

USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'TipoRegistro') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos
    ADD TipoRegistro NVARCHAR(20) NOT NULL
        CONSTRAINT DF_SiembraSeguimientos_TipoRegistro DEFAULT (N'Posemergente');
END;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'Siniestro') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos ADD Siniestro NVARCHAR(80) NULL;
END;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'Alcance') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos ADD Alcance NVARCHAR(10) NULL;
END;
GO

IF COL_LENGTH(N'dbo.SeguimientoInsumos', N'UnidadMedida') IS NULL
BEGIN
    ALTER TABLE dbo.SeguimientoInsumos ADD UnidadMedida NVARCHAR(10) NULL;
END;
GO

UPDATE dbo.SiembraSeguimientos
SET TipoRegistro = N'Posemergente'
WHERE TipoRegistro IS NULL OR TipoRegistro NOT IN (N'Siniestro', N'Posemergente');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SiembraSeguimientos_TipoRegistro')
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos WITH CHECK ADD CONSTRAINT CK_SiembraSeguimientos_TipoRegistro
        CHECK (TipoRegistro IN (N'Siniestro', N'Posemergente'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SiembraSeguimientos_Alcance')
BEGIN
    ALTER TABLE dbo.SiembraSeguimientos WITH CHECK ADD CONSTRAINT CK_SiembraSeguimientos_Alcance
        CHECK (Alcance IS NULL OR Alcance IN (N'Parcial', N'Total'));
END;
GO
