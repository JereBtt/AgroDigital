/*
    Ejecutar en bases que ya aplicaron 31 y 32. Renumera siembras, resiembras
    y cosechas desde 0001 por empresa y campaña, conservando sus IDs y vínculos.
*/
USE AgroDigital;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    SELECT s.SiembraId,
           l.EmpresaId,
           s.CampaniaNombre,
           ROW_NUMBER() OVER (
               PARTITION BY l.EmpresaId, s.CampaniaNombre
               ORDER BY s.SiembraId
           ) AS Numero
    INTO #NumeracionSiembras
    FROM dbo.Siembras AS s WITH (TABLOCKX, HOLDLOCK)
    JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId;

    IF EXISTS (SELECT 1 FROM #NumeracionSiembras
               WHERE EmpresaId IS NULL OR NULLIF(LTRIM(RTRIM(CampaniaNombre)), N'') IS NULL)
        THROW 50001, N'Hay siembras sin empresa o campaña; completalas antes de renumerar.', 1;

    UPDATE s
    SET Nombre = N'SIEM - ' + CASE WHEN n.Numero < 10000
        THEN RIGHT(N'0000' + CONVERT(NVARCHAR(20), n.Numero), 4)
        ELSE CONVERT(NVARCHAR(20), n.Numero) END
    FROM dbo.Siembras AS s
    JOIN #NumeracionSiembras AS n ON n.SiembraId = s.SiembraId;

    SELECT c.CosechaId,
           COALESCE(c.EmpresaId, l.EmpresaId) AS EmpresaId,
           c.CampaniaNombre,
           c.Nombre AS NombreAnterior,
           ROW_NUMBER() OVER (
               PARTITION BY COALESCE(c.EmpresaId, l.EmpresaId), c.CampaniaNombre
               ORDER BY c.CosechaId
           ) AS Numero
    INTO #NumeracionCosechas
    FROM dbo.Cosechas AS c WITH (TABLOCKX, HOLDLOCK)
    JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId;

    IF EXISTS (SELECT 1 FROM #NumeracionCosechas
               WHERE EmpresaId IS NULL OR NULLIF(LTRIM(RTRIM(CampaniaNombre)), N'') IS NULL)
        THROW 50001, N'Hay cosechas sin empresa o campaña; completalas antes de renumerar.', 1;

    ALTER TABLE #NumeracionCosechas ADD NombreNuevo NVARCHAR(30) NULL;
    UPDATE #NumeracionCosechas
    SET NombreNuevo = N'COS - ' + CASE WHEN Numero < 10000
        THEN RIGHT(N'0000' + CONVERT(NVARCHAR(20), Numero), 4)
        ELSE CONVERT(NVARCHAR(20), Numero) END;

    -- Almacenamiento conserva una copia textual; priorizar el vínculo por ID.
    UPDATE a
    SET Cosecha = n.NombreNuevo
    FROM dbo.Almacenamientos AS a
    JOIN #NumeracionCosechas AS n ON n.CosechaId = a.CosechaId
    WHERE a.Cosecha = n.NombreAnterior;

    -- Para cargas antiguas sin ID, corregir solo nombres anteriores inequívocos.
    ;WITH NombresUnicos AS (
        SELECT EmpresaId, NombreAnterior
        FROM #NumeracionCosechas
        GROUP BY EmpresaId, NombreAnterior
        HAVING COUNT(*) = 1
    )
    UPDATE a
    SET Cosecha = n.NombreNuevo
    FROM dbo.Almacenamientos AS a
    JOIN dbo.Silos AS si ON si.SiloId = a.SiloId
    JOIN #NumeracionCosechas AS n
      ON n.NombreAnterior = a.Cosecha
     AND n.EmpresaId = COALESCE(a.EmpresaId, si.EmpresaId)
    JOIN NombresUnicos AS u
      ON u.EmpresaId = n.EmpresaId AND u.NombreAnterior = n.NombreAnterior
    WHERE a.CosechaId IS NULL;

    IF EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID(N'dbo.Cosechas')
                 AND name = N'UX_Cosechas_EmpresaId_Nombre')
        DROP INDEX UX_Cosechas_EmpresaId_Nombre ON dbo.Cosechas;

    UPDATE c
    SET c.EmpresaId = n.EmpresaId,
        c.Nombre = n.NombreNuevo
    FROM dbo.Cosechas AS c
    JOIN #NumeracionCosechas AS n ON n.CosechaId = c.CosechaId;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID(N'dbo.Cosechas')
                     AND name = N'UX_Cosechas_EmpresaId_CampaniaNombre_Nombre')
        CREATE UNIQUE INDEX UX_Cosechas_EmpresaId_CampaniaNombre_Nombre
        ON dbo.Cosechas (EmpresaId, CampaniaNombre, Nombre)
        WHERE EmpresaId IS NOT NULL AND CampaniaNombre IS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
