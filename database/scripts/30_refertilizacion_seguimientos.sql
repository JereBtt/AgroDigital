/*
    Refertilización dentro del historial de Seguimiento de Siembra.
    Ejecutar después de 28_permisos_autor_seguimientos.sql.
    Las hectáreas sembradas se conservan como instantánea del registro de siembra.
*/
USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'HectareasSembradas') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos ADD HectareasSembradas DECIMAL(18,4) NULL;
GO
IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'UreaKgHa') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos ADD UreaKgHa DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'HectareasHora') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos ADD HectareasHora DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'HorasTrabajadas') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos ADD HorasTrabajadas DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.SiembraSeguimientos', N'UreaTotalKg') IS NULL
    ALTER TABLE dbo.SiembraSeguimientos ADD UreaTotalKg DECIMAL(18,2) NULL;
GO

IF OBJECT_ID(N'dbo.CK_SiembraSeguimientos_TipoRegistro', N'C') IS NOT NULL
    ALTER TABLE dbo.SiembraSeguimientos DROP CONSTRAINT CK_SiembraSeguimientos_TipoRegistro;
GO
ALTER TABLE dbo.SiembraSeguimientos WITH CHECK ADD CONSTRAINT CK_SiembraSeguimientos_TipoRegistro
    CHECK (TipoRegistro IN (N'Siniestro', N'Posemergente', N'Refertilizacion'));
GO

IF OBJECT_ID(N'dbo.CK_SiembraSeguimientos_Refertilizacion', N'C') IS NOT NULL
    ALTER TABLE dbo.SiembraSeguimientos DROP CONSTRAINT CK_SiembraSeguimientos_Refertilizacion;
GO
ALTER TABLE dbo.SiembraSeguimientos WITH CHECK ADD CONSTRAINT CK_SiembraSeguimientos_Refertilizacion
    CHECK (TipoRegistro <> N'Refertilizacion' OR
        (HectareasSembradas > 0 AND UreaKgHa BETWEEN 1 AND 500 AND HectareasHora > 0
         AND HorasTrabajadas >= 0 AND UreaTotalKg >= 0));
GO
