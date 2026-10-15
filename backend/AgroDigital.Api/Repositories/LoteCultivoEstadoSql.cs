namespace AgroDigital.Api.Repositories;

// Una siembra de invierno anterior aún sin cosecha conserva el estado visible del lote
// aunque ya exista una planificación para la campaña siguiente.
internal static class LoteCultivoEstadoSql
{
    internal const string Recalcular = """
        UPDATE l
        SET CultivoActual = COALESCE(inviernoAnterior.Producto, inviernoPendiente.Producto, s.Producto, campania.Producto),
            EstadoCultivo = CASE
                WHEN inviernoAnterior.SiembraId IS NOT NULL THEN
                    CASE WHEN inviernoAnterior.EstadoSiembra = N'Finalizado' THEN N'Cultivado' ELSE N'Pendiente' END
                WHEN inviernoPendiente.Producto IS NOT NULL THEN N'Pendiente'
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
            SELECT TOP (1) si.SiembraId, si.Producto, si.EstadoSiembra, si.CicloEstacional
            FROM dbo.Siembras AS si
            WHERE si.LoteId = l.LoteId
              AND si.DeshabilitacionId IS NULL
              AND (campania.Periodo IS NULL OR
                   LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) = campania.Periodo)
            ORDER BY si.SiembraId DESC
        ) AS s
        OUTER APPLY (
            SELECT TOP (1) cc.Producto
            FROM dbo.CampaniaCombinaciones AS cc
            INNER JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
            WHERE cc.LoteId = l.LoteId
              AND ca.Periodo = campania.Periodo
              AND cc.CicloEstacional = N'Invierno'
              AND cc.Estado = N'Pendiente'
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.Siembras AS invierno
                  WHERE invierno.LoteId = l.LoteId
                    AND invierno.CicloEstacional = N'Invierno'
                    AND invierno.DeshabilitacionId IS NULL
                    AND LEFT(LTRIM(RTRIM(ISNULL(invierno.CampaniaNombre, N''))), 9) = campania.Periodo
              )
              AND (
                  NOT EXISTS (
                      SELECT 1 FROM dbo.CampaniaCombinaciones AS verano
                      INNER JOIN dbo.Campanias AS cv ON cv.CampaniaId = verano.CampaniaId
                      WHERE verano.LoteId = l.LoteId AND cv.Periodo = campania.Periodo
                        AND verano.CicloEstacional = N'Verano'
                  )
                  OR (s.CicloEstacional = N'Verano' AND EXISTS (
                      SELECT 1 FROM dbo.Cosechas AS co
                      WHERE co.SiembraId = s.SiembraId AND co.Estado = N'Finalizado'
                  ))
              )
            ORDER BY ca.CampaniaId DESC, cc.CampaniaCombinacionId DESC
        ) AS inviernoPendiente
        OUTER APPLY (
            SELECT TOP (1) si.SiembraId, si.Producto, si.EstadoSiembra
            FROM dbo.Siembras AS si
            WHERE si.LoteId = l.LoteId
              AND si.CicloEstacional = N'Invierno'
              AND si.DeshabilitacionId IS NULL
              AND campania.Periodo IS NOT NULL
              AND LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9) < campania.Periodo
              AND si.SiembraId = (
                  SELECT MAX(etapa.SiembraId)
                  FROM dbo.Siembras AS etapa
                  WHERE etapa.LoteId = l.LoteId AND etapa.CicloEstacional = N'Invierno'
                    AND etapa.DeshabilitacionId IS NULL
                    AND LEFT(LTRIM(RTRIM(ISNULL(etapa.CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(si.CampaniaNombre, N''))), 9)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.Cosechas AS co
                  WHERE co.SiembraId = si.SiembraId AND co.Estado = N'Finalizado'
              )
            ORDER BY si.CampaniaNombre DESC, si.SiembraId DESC
        ) AS inviernoAnterior
        WHERE l.LoteId = @LoteId
          AND (campania.Periodo IS NOT NULL OR s.SiembraId IS NOT NULL);
        """;
}
