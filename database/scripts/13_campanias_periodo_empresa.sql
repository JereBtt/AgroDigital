SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.Campanias', N'Periodo') IS NULL
BEGIN
    ALTER TABLE dbo.Campanias ADD Periodo NVARCHAR(9) NULL;
END;
GO

UPDATE dbo.Campanias
SET Periodo = CONCAT(
    CASE WHEN MONTH(FechaInicio) >= 6 THEN YEAR(FechaInicio) ELSE YEAR(FechaInicio) - 1 END,
    N'-',
    CASE WHEN MONTH(FechaInicio) >= 6 THEN YEAR(FechaInicio) + 1 ELSE YEAR(FechaInicio) END
)
WHERE Periodo IS NULL;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Campanias')
      AND name = N'Periodo'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE dbo.Campanias ALTER COLUMN Periodo NVARCHAR(9) NOT NULL;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Campanias')
      AND name = N'Nombre'
      AND max_length < 240
)
BEGIN
    ALTER TABLE dbo.Campanias ALTER COLUMN Nombre NVARCHAR(120) NOT NULL;
END;
GO

DECLARE @EmpresaPrincipalId INT = (
    SELECT TOP (1) EmpresaId
    FROM dbo.Empresas
    WHERE Nombre = N'ElSauceSA' AND Activo = 1
    ORDER BY EmpresaId
);

IF @EmpresaPrincipalId IS NOT NULL
BEGIN
    UPDATE dbo.Lotes
    SET EmpresaId = @EmpresaPrincipalId,
        FechaModificacion = SYSDATETIME()
    WHERE EmpresaId IS NULL OR EmpresaId <> @EmpresaPrincipalId;

    UPDATE dbo.Campanias
    SET EmpresaId = @EmpresaPrincipalId,
        FechaModificacion = SYSDATETIME()
    WHERE EmpresaId IS NULL OR EmpresaId <> @EmpresaPrincipalId;

    UPDATE dbo.Siembras
    SET Empresa = N'ElSauceSA',
        FechaModificacion = SYSDATETIME()
    WHERE Empresa IS NULL OR LTRIM(RTRIM(Empresa)) = N'' OR Empresa <> N'ElSauceSA';

    UPDATE dbo.Cosechas
    SET Empresa = N'ElSauceSA',
        FechaModificacion = SYSDATETIME()
    WHERE Empresa IS NULL OR LTRIM(RTRIM(Empresa)) = N'' OR Empresa <> N'ElSauceSA';

    UPDATE c
    SET Nombre = CONCAT(c.Periodo, N' ', e.Nombre),
        FechaModificacion = SYSDATETIME()
    FROM dbo.Campanias AS c
    INNER JOIN dbo.Empresas AS e ON e.EmpresaId = c.EmpresaId
    WHERE c.EmpresaId = @EmpresaPrincipalId;

    DECLARE @CampaniaPrincipalNombre NVARCHAR(120) = (
        SELECT TOP (1) Nombre
        FROM dbo.Campanias
        WHERE EmpresaId = @EmpresaPrincipalId
        ORDER BY CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.CampaniaCombinaciones AS cc
            WHERE cc.CampaniaId = dbo.Campanias.CampaniaId
              AND cc.Estado = N'En curso'
        ) THEN 0 ELSE 1 END,
        FechaInicio DESC,
        CampaniaId DESC
    );

    IF @CampaniaPrincipalNombre IS NOT NULL
    BEGIN
        UPDATE dbo.Siembras
        SET CampaniaNombre = @CampaniaPrincipalNombre,
            FechaModificacion = SYSDATETIME()
        WHERE CampaniaNombre IS NULL OR LTRIM(RTRIM(CampaniaNombre)) = N'';

        UPDATE dbo.Cosechas
        SET CampaniaNombre = @CampaniaPrincipalNombre,
            FechaModificacion = SYSDATETIME()
        WHERE CampaniaNombre IS NULL OR LTRIM(RTRIM(CampaniaNombre)) = N'';
    END;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Campanias_Empresa_Periodo' AND object_id = OBJECT_ID(N'dbo.Campanias'))
AND NOT EXISTS (
    SELECT 1
    FROM dbo.Campanias
    WHERE EmpresaId IS NOT NULL
    GROUP BY EmpresaId, Periodo
    HAVING COUNT(1) > 1
)
BEGIN
    CREATE UNIQUE INDEX UX_Campanias_Empresa_Periodo
    ON dbo.Campanias (EmpresaId, Periodo)
    WHERE EmpresaId IS NOT NULL;
END;
GO
