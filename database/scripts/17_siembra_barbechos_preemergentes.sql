/*
    Agrupa los agroquimicos de pre-siembra por la fecha y el motivo de cada
    pulverizacion. Cada fila conserva una droga, marca, cantidad y unidad.
*/
USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.SiembraInsumos', N'MotivoAplicacion') IS NULL
BEGIN
    ALTER TABLE dbo.SiembraInsumos ADD MotivoAplicacion NVARCHAR(40) NULL;
END;
GO
