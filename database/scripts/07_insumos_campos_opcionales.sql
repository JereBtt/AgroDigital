/*
    Hace opcionales los campos del formulario de Insumos/Agroquimicos, tanto en
    Silos (dbo.SiloControlInsumos) como en Siembras (dbo.SiembraInsumos). Hasta ahora
    Fecha de aplicacion, Marca, Tipo y Cantidad Aplicada eran obligatorios (NOT NULL,
    con un CHECK de Cantidad > 0), lo que bloqueaba guardar si faltaba completar
    alguno de esos campos al cargar un insumo.
*/
USE AgroDigital;
GO

-- dbo.SiloControlInsumos
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SiloControlInsumos_CantidadAplicada')
BEGIN
    ALTER TABLE dbo.SiloControlInsumos DROP CONSTRAINT CK_SiloControlInsumos_CantidadAplicada;
END;
GO

ALTER TABLE dbo.SiloControlInsumos ALTER COLUMN FechaAplicacion DATE NULL;
GO
ALTER TABLE dbo.SiloControlInsumos ALTER COLUMN Marca NVARCHAR(100) NULL;
GO
ALTER TABLE dbo.SiloControlInsumos ALTER COLUMN Tipo NVARCHAR(100) NULL;
GO
ALTER TABLE dbo.SiloControlInsumos ALTER COLUMN CantidadAplicada DECIMAL(18,4) NULL;
GO

ALTER TABLE dbo.SiloControlInsumos
    ADD CONSTRAINT CK_SiloControlInsumos_CantidadAplicada CHECK (CantidadAplicada IS NULL OR CantidadAplicada > 0);
GO

-- dbo.SiembraInsumos
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SiembraInsumos_CantidadAplicada')
BEGIN
    ALTER TABLE dbo.SiembraInsumos DROP CONSTRAINT CK_SiembraInsumos_CantidadAplicada;
END;
GO

ALTER TABLE dbo.SiembraInsumos ALTER COLUMN FechaAplicacion DATE NULL;
GO
ALTER TABLE dbo.SiembraInsumos ALTER COLUMN Marca NVARCHAR(100) NULL;
GO
ALTER TABLE dbo.SiembraInsumos ALTER COLUMN Tipo NVARCHAR(100) NULL;
GO
ALTER TABLE dbo.SiembraInsumos ALTER COLUMN CantidadAplicada DECIMAL(18,4) NULL;
GO

ALTER TABLE dbo.SiembraInsumos
    ADD CONSTRAINT CK_SiembraInsumos_CantidadAplicada CHECK (CantidadAplicada IS NULL OR CantidadAplicada > 0);
GO
