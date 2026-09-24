/* Catálogos simples reutilizados por Siembras y Seguimientos. */
IF OBJECT_ID(N'dbo.CatalogoValores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CatalogoValores
    (
        CatalogoValorId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Tipo NVARCHAR(40) NOT NULL,
        Grano NVARCHAR(60) NOT NULL CONSTRAINT DF_CatalogoValores_Grano DEFAULT (N''),
        Nombre NVARCHAR(100) NOT NULL,
        FechaCreacion DATETIME2 NOT NULL CONSTRAINT DF_CatalogoValores_FechaCreacion DEFAULT (SYSDATETIME()),
        CONSTRAINT UQ_CatalogoValores_Tipo_Grano_Nombre UNIQUE (Tipo, Grano, Nombre)
    );
END;

INSERT INTO dbo.CatalogoValores (Tipo, Grano, Nombre)
SELECT Fuente.Tipo, Fuente.Grano, Fuente.Nombre
FROM (VALUES
    (N'VariedadSemilla', N'Soja', N'46I20'),
    (N'VariedadSemilla', N'Soja', N'50I17'),
    (N'VariedadSemilla', N'Maiz', N'ACA473'),
    (N'VariedadSemilla', N'Maiz', N'DOW226')
) AS Fuente(Tipo, Grano, Nombre)
WHERE NOT EXISTS
(
    SELECT 1 FROM dbo.CatalogoValores Destino
    WHERE Destino.Tipo = Fuente.Tipo AND Destino.Grano = Fuente.Grano AND Destino.Nombre = Fuente.Nombre
);
