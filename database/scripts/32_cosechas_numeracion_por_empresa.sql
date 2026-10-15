/*
    Ejecutar una sola vez en bases existentes, después de respaldar los datos.
    Renumera las cosechas por empresa en orden de alta (CosechaId).
    Los IDs y los vínculos de siembra, partes, silos y distribución no cambian.
    Requiere el rediseño de Cosechas y Almacenamiento con EmpresaId/CosechaId.
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

    SELECT c.CosechaId,
           COALESCE(c.EmpresaId, l.EmpresaId) AS EmpresaId,
           c.Nombre AS NombreAnterior,
           ROW_NUMBER() OVER (
               PARTITION BY COALESCE(c.EmpresaId, l.EmpresaId)
               ORDER BY c.CosechaId
           ) AS Numero
    INTO #NumeracionCosechas
    FROM dbo.Cosechas AS c WITH (TABLOCKX, HOLDLOCK)
    INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId;

    IF EXISTS (SELECT 1 FROM #NumeracionCosechas WHERE EmpresaId IS NULL)
        THROW 50001, N'Hay cosechas sin empresa. Corregí esos lotes antes de renumerar.', 1;

    ALTER TABLE #NumeracionCosechas ADD NombreNuevo NVARCHAR(30) NULL;
    UPDATE #NumeracionCosechas
    SET NombreNuevo = N'COS - ' + CASE WHEN Numero < 10000
        THEN RIGHT(N'0000' + CONVERT(NVARCHAR(20), Numero), 4)
        ELSE CONVERT(NVARCHAR(20), Numero) END;

    -- Almacenamiento conserva además del ID una copia textual del nombre.
    UPDATE a
    SET Cosecha = n.NombreNuevo
    FROM dbo.Almacenamientos AS a
    INNER JOIN #NumeracionCosechas AS n ON n.CosechaId = a.CosechaId
    WHERE a.Cosecha = n.NombreAnterior;

    -- Las cargas antiguas sin CosechaId se corrigen solo si empresa y nombre
    -- anterior identifican una única cosecha.
    ;WITH NombresUnicos AS (
        SELECT NombreAnterior
        FROM #NumeracionCosechas
        GROUP BY NombreAnterior
        HAVING COUNT(*) = 1
    )
    UPDATE a
    SET Cosecha = n.NombreNuevo
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Silos AS si ON si.SiloId = a.SiloId
    INNER JOIN #NumeracionCosechas AS n
        ON n.NombreAnterior = a.Cosecha
       AND n.EmpresaId = COALESCE(a.EmpresaId, si.EmpresaId)
    INNER JOIN NombresUnicos AS u ON u.NombreAnterior = n.NombreAnterior
    WHERE a.CosechaId IS NULL;

    UPDATE c
    SET c.EmpresaId = n.EmpresaId,
        c.Nombre = n.NombreNuevo
    FROM dbo.Cosechas AS c
    INNER JOIN #NumeracionCosechas AS n ON n.CosechaId = c.CosechaId;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_Cosechas_EmpresaId_Nombre'
          AND object_id = OBJECT_ID(N'dbo.Cosechas')
    )
        CREATE UNIQUE INDEX UX_Cosechas_EmpresaId_Nombre
        ON dbo.Cosechas (EmpresaId, Nombre)
        WHERE EmpresaId IS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
