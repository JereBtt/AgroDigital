-- Regulariza el cultivo visible de lotes habilitados cuya siembra de Verano
-- fue deshabilitada y que conservan una planificación pendiente de Invierno.
-- No modifica combinaciones, siembras ni motivos de baja. Idempotente.
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE l
SET CultivoActual = invierno.Producto,
    EstadoCultivo = N'Pendiente',
    FechaModificacion = SYSDATETIME()
OUTPUT inserted.LoteId, inserted.Nombre, deleted.CultivoActual AS CultivoAnterior,
       inserted.CultivoActual AS CultivoActual, inserted.EstadoCultivo
FROM dbo.Lotes AS l
CROSS APPLY (
    SELECT TOP (1) ca.Periodo
    FROM dbo.CampaniaCombinaciones AS cc
    JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
    WHERE cc.LoteId = l.LoteId
    ORDER BY ca.Periodo DESC, ca.CampaniaId DESC, cc.CampaniaCombinacionId DESC
) AS ultimaCampania
CROSS APPLY (
    SELECT TOP (1) cc.Producto
    FROM dbo.CampaniaCombinaciones AS cc
    JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
    WHERE cc.LoteId = l.LoteId AND ca.Periodo = ultimaCampania.Periodo
      AND cc.CicloEstacional = N'Invierno' AND cc.Estado = N'Pendiente'
    ORDER BY ca.CampaniaId DESC, cc.CampaniaCombinacionId DESC
) AS invierno
WHERE l.Activo = 1
  AND (ISNULL(l.CultivoActual, N'') <> invierno.Producto OR l.EstadoCultivo <> N'Pendiente')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Siembras AS si
      WHERE si.LoteId = l.LoteId AND si.CicloEstacional = N'Invierno'
        AND si.DeshabilitacionId IS NULL
        AND LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) = ultimaCampania.Periodo
  )
  AND EXISTS (
      SELECT 1 FROM dbo.Siembras AS si
      WHERE si.LoteId = l.LoteId AND si.CicloEstacional = N'Verano'
        AND si.DeshabilitacionId IS NOT NULL
        AND LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) = ultimaCampania.Periodo
  )
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Siembras AS si
      WHERE si.LoteId = l.LoteId AND si.CicloEstacional = N'Verano'
        AND si.DeshabilitacionId IS NULL
        AND LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) = ultimaCampania.Periodo
  )
  AND NOT EXISTS (
      SELECT 1 FROM dbo.CampaniaCombinaciones AS cc
      JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
      WHERE cc.LoteId = l.LoteId AND ca.Periodo = ultimaCampania.Periodo
        AND cc.CicloEstacional = N'Verano'
        AND cc.Estado = N'Pendiente' AND cc.EtapaActual = N'Sin etapa'
  )
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Siembras AS si
      WHERE si.LoteId = l.LoteId AND si.CicloEstacional = N'Invierno'
        AND si.DeshabilitacionId IS NULL
        AND LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) < ultimaCampania.Periodo
        AND si.SiembraId = (
            SELECT MAX(etapa.SiembraId) FROM dbo.Siembras AS etapa
            WHERE etapa.LoteId = l.LoteId AND etapa.CicloEstacional = N'Invierno'
              AND etapa.DeshabilitacionId IS NULL
              AND LEFT(LTRIM(RTRIM(ISNULL(etapa.CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9)
        )
        AND NOT EXISTS (SELECT 1 FROM dbo.Cosechas AS co WHERE co.SiembraId = si.SiembraId AND co.Estado = N'Finalizado')
  );

COMMIT TRANSACTION;
