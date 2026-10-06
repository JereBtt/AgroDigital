/*
    Regulariza CultivoActual y EstadoCultivo de lotes ya registrados.
    Ejecutar una vez en la base AgroDigital despues de desplegar la API actualizada.
    Usa la campaña más reciente del lote y su última siembra/ resiembra.
    Una cosecha solo cuenta si está finalizada y vinculada a esa última siembra.
*/
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE l
SET CultivoActual = COALESCE(s.Producto, campania.Producto),
    EstadoCultivo = CASE
        WHEN s.SiembraId IS NOT NULL AND EXISTS (
            SELECT 1
            FROM dbo.Cosechas AS co
            WHERE co.SiembraId = s.SiembraId
              AND co.LoteId = l.LoteId
              AND co.Estado = N'Finalizado'
              AND LEFT(LTRIM(RTRIM(ISNULL(co.CampaniaNombre, N''))), 9) = campania.Periodo
        ) THEN N'Cosechado'
        WHEN s.EstadoSiembra = N'Finalizado' THEN N'Cultivado'
        ELSE N'Pendiente'
    END,
    FechaModificacion = SYSDATETIME()
FROM dbo.Lotes AS l
OUTER APPLY (
    SELECT TOP (1) ca.Periodo, cc.Producto
    FROM dbo.CampaniaCombinaciones AS cc
    INNER JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
    WHERE cc.LoteId = l.LoteId
    ORDER BY ca.Periodo DESC, ca.CampaniaId DESC, cc.CampaniaCombinacionId DESC
) AS campania
OUTER APPLY (
    SELECT TOP (1) si.SiembraId, si.Producto, si.EstadoSiembra
    FROM dbo.Siembras AS si
    WHERE si.LoteId = l.LoteId
      AND (campania.Periodo IS NULL OR
           LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) = campania.Periodo)
    ORDER BY si.SiembraId DESC
) AS s
WHERE campania.Periodo IS NOT NULL OR s.SiembraId IS NOT NULL;

SELECT @@ROWCOUNT AS LotesRecalculados;
COMMIT TRANSACTION;
