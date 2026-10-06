/*
    AgroDigital - Pantalla Principal (Inicio) y Agenda
    Motor objetivo: Microsoft SQL Server 2019

    Fuente funcional: HOME-01 (rediseño) y HOME-03 (Agenda).
    La pantalla principal es SOLO LECTURA: no se crean tablas ni se modifican
    datos. El script agrega dos vistas que reúnen la información de varios
    módulos para que la API no tenga que repetir los mismos JOIN en cada consulta.

      1. dbo.vw_InicioCombinaciones
         Una fila por combinación Lote + Producto de cada campaña, con la etapa
         calculada a partir de los registros reales (Siembra, Cosecha,
         Almacenamiento, Distribución), el último movimiento y los datos que
         alimentan la columna "Atención" de la tabla de lotes.

      2. dbo.vw_InicioAgenda
         Eventos fechados para la agenda: próximos controles de silo, fin
         planificado de siembras y cosechas en curso, inicio planificado de
         combinaciones sin sembrar y camiones de distribución en tránsito.

    Criterios:
      - Siembras y Cosechas se vinculan a la combinación por LoteId + Producto +
        CampaniaNombre (= Campanias.Nombre), igual que SiembraRepository y
        CosechaRepository.
      - La etapa NO se toma de CampaniaCombinaciones.EtapaActual, porque hoy esa
        columna solo pasa por 'Siembra' y 'Finalizada'. Se calcula así:
            4 Finalizado        -> la combinación está en estado Finalizado
            3 Destino del grano -> hay ingreso a silo o distribución de su cosecha
            2 Cosecha           -> hay cosecha registrada
            1 Siembra           -> hay siembra registrada (no resiembra)
            0 Sin iniciar       -> todavía no hay siembra
      - Las resiembras no definen etapa, pero sus seguimientos sí cuentan como
        actividad del lote.
      - Las distribuciones que salen de un silo no se pueden atribuir a un lote
        (el silo mezcla grano), por eso solo cuentan las que salen de una cosecha.

    Ejecución: en una base existente, después de 23_distribucion.sql.
    Es idempotente (CREATE OR ALTER): se puede volver a ejecutar sin problemas.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =====================================================================
   1. vw_InicioCombinaciones
   ===================================================================== */
CREATE OR ALTER VIEW dbo.vw_InicioCombinaciones
AS
SELECT
    cc.CampaniaCombinacionId,
    cc.CampaniaId,
    c.EmpresaId,
    c.Nombre                          AS CampaniaNombre,
    cc.LoteId,
    l.Nombre                          AS LoteNombre,
    l.Ciudad                          AS LoteCiudad,
    l.Hectareas,
    cc.Producto,
    cc.FechaInicio,
    cc.FechaFin,
    cc.Estado,

    -- Siembra principal de la combinación
    s.SiembraId,
    s.Nombre                          AS SiembraNombre,
    s.Estado                          AS SiembraEstado,
    s.FechaInicio                     AS SiembraFechaInicio,
    s.FechaFin                        AS SiembraFechaFin,
    s.CantidadHectareasTrabajadas     AS SiembraHectareas,

    -- Cosecha más reciente de la combinación
    co.CosechaId,
    co.Nombre                         AS CosechaNombre,
    co.Estado                         AS CosechaEstado,
    co.FechaInicio                    AS CosechaFechaInicio,
    co.FechaFin                       AS CosechaFechaFin,
    co.CantidadHectareasTrabajadas    AS CosechaHectareas,
    co.CantidadGranoCosechado         AS CosechaKg,
    co.RindeKgHa,

    -- Destino del grano
    alm.UltimoIngresoSiloFecha,
    dis.UltimaDistribucionFecha,

    -- Datos para la columna "Atención"
    seg.UltimoSeguimientoFecha,
    per.UltimaPerdidaFecha,
    per.UltimaPerdidaMotivo,
    aro.UltimaTiradaFecha,
    aro.UltimaTiradaSeveridad,
    aro.UltimaTiradaPerdidaKgHa,

    -- Etapa calculada (0 a 4, ver encabezado)
    CAST(CASE
        WHEN cc.Estado = N'Finalizado' THEN 4
        WHEN alm.UltimoIngresoSiloFecha IS NOT NULL OR dis.UltimaDistribucionFecha IS NOT NULL THEN 3
        WHEN co.CosechaId IS NOT NULL THEN 2
        WHEN s.SiembraId IS NOT NULL THEN 1
        ELSE 0
    END AS TINYINT)                   AS EtapaCodigo,

    -- Regla HOME-02: Siembra + Cosecha + al menos un destino del grano
    CAST(CASE
        WHEN cc.Estado <> N'Finalizado'
         AND s.SiembraId IS NOT NULL
         AND co.CosechaId IS NOT NULL
         AND (alm.UltimoIngresoSiloFecha IS NOT NULL OR dis.UltimaDistribucionFecha IS NOT NULL)
        THEN 1 ELSE 0
    END AS BIT)                       AS ListoParaFinalizar,

    um.UltimoMovimientoFecha,
    um.UltimoMovimientoDescripcion
FROM dbo.CampaniaCombinaciones AS cc
INNER JOIN dbo.Campanias AS c ON c.CampaniaId = cc.CampaniaId
INNER JOIN dbo.Lotes AS l ON l.LoteId = cc.LoteId
OUTER APPLY (
    SELECT TOP (1) sx.SiembraId, sx.Nombre, sx.Estado, sx.FechaInicio, sx.FechaFin, sx.CantidadHectareasTrabajadas
    FROM dbo.Siembras AS sx
    WHERE sx.LoteId = cc.LoteId
      AND sx.Producto = cc.Producto
      AND sx.CampaniaNombre = c.Nombre
      AND sx.TipoRegistro = N'Siembra'
    ORDER BY sx.FechaInicio DESC, sx.SiembraId DESC
) AS s
OUTER APPLY (
    SELECT TOP (1) cx.CosechaId, cx.Nombre, cx.Estado, cx.FechaInicio, cx.FechaFin,
                   cx.CantidadHectareasTrabajadas, cx.CantidadGranoCosechado, cx.RindeKgHa
    FROM dbo.Cosechas AS cx
    WHERE cx.LoteId = cc.LoteId
      AND cx.Producto = cc.Producto
      AND cx.CampaniaNombre = c.Nombre
    ORDER BY cx.FechaInicio DESC, cx.CosechaId DESC
) AS co
OUTER APPLY (
    SELECT MAX(a.Fecha) AS UltimoIngresoSiloFecha
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Cosechas AS cx ON cx.CosechaId = a.CosechaId
    WHERE cx.LoteId = cc.LoteId
      AND cx.Producto = cc.Producto
      AND cx.CampaniaNombre = c.Nombre
      AND a.TipoMovimiento = N'Ingreso'
) AS alm
OUTER APPLY (
    SELECT MAX(d.FechaSalida) AS UltimaDistribucionFecha
    FROM dbo.Distribuciones AS d
    INNER JOIN dbo.Cosechas AS cx ON cx.CosechaId = d.CosechaId
    WHERE cx.LoteId = cc.LoteId
      AND cx.Producto = cc.Producto
      AND cx.CampaniaNombre = c.Nombre
) AS dis
OUTER APPLY (
    -- Seguimientos de la siembra y de sus resiembras (excluye los automáticos de resiembra)
    SELECT CAST(MAX(ss.Fecha) AS DATE) AS UltimoSeguimientoFecha
    FROM dbo.SiembraSeguimientos AS ss
    INNER JOIN dbo.Siembras AS sx ON sx.SiembraId = ss.SiembraId
    WHERE sx.LoteId = cc.LoteId
      AND sx.CampaniaNombre = c.Nombre
      AND (sx.Producto = cc.Producto OR sx.TipoRegistro = N'Resiembra')
      AND ss.EsResiembra = 0
) AS seg
OUTER APPLY (
    -- Último siniestro o incidencia con pérdida económica
    SELECT TOP (1)
        CAST(ss.Fecha AS DATE) AS UltimaPerdidaFecha,
        COALESCE(ss.Siniestro, ss.Incidencia, N'Pérdida económica') AS UltimaPerdidaMotivo
    FROM dbo.SiembraSeguimientos AS ss
    INNER JOIN dbo.Siembras AS sx ON sx.SiembraId = ss.SiembraId
    WHERE sx.LoteId = cc.LoteId
      AND sx.CampaniaNombre = c.Nombre
      AND (sx.Producto = cc.Producto OR sx.TipoRegistro = N'Resiembra')
      AND ss.EsResiembra = 0
      AND ss.PerdidaEconomica = 1
    ORDER BY ss.Fecha DESC, ss.SiembraSeguimientoId DESC
) AS per
OUTER APPLY (
    SELECT TOP (1)
        t.Fecha            AS UltimaTiradaFecha,
        t.Severidad        AS UltimaTiradaSeveridad,
        t.PerdidaTotalKgHa AS UltimaTiradaPerdidaKgHa
    FROM dbo.CosechaTiradaAros AS t
    WHERE t.CosechaId = co.CosechaId
    ORDER BY t.Fecha DESC, t.CosechaTiradaAroId DESC
) AS aro
OUTER APPLY (
    SELECT TOP (1)
        v.Fecha       AS UltimoMovimientoFecha,
        v.Descripcion AS UltimoMovimientoDescripcion
    FROM (VALUES
        (s.FechaInicio,                 CONCAT(N'Siembra ', s.Nombre)),
        (seg.UltimoSeguimientoFecha,    N'Seguimiento de siembra'),
        (co.FechaInicio,                CONCAT(N'Cosecha ', co.Nombre)),
        (aro.UltimaTiradaFecha,         N'Tirada de aros'),
        (alm.UltimoIngresoSiloFecha,    N'Ingreso a silo'),
        (dis.UltimaDistribucionFecha,   N'Distribución')
    ) AS v (Fecha, Descripcion)
    WHERE v.Fecha IS NOT NULL
    ORDER BY v.Fecha DESC
) AS um;
GO

/* =====================================================================
   2. vw_InicioAgenda
   ---------------------------------------------------------------------
   Columnas:
     EmpresaId, CampaniaId (NULL = no depende de una campaña, ej. silos),
     Fecha, Tipo (Silo | Siembra | Cosecha | Distribucion),
     Subtipo, Titulo, Detalle, Modulo (pantalla a la que lleva "Ver"),
     ReferenciaId (id del registro en ese módulo).
   La API filtra por rango de fechas; los eventos con Fecha anterior a hoy
   se muestran como "Vencidos" (salvo los camiones, que son "En tránsito").
   ===================================================================== */
CREATE OR ALTER VIEW dbo.vw_InicioAgenda
AS
-- 2.1 Próximo control de cada silo con grano (programado por el último control)
SELECT
    si.EmpresaId,
    CAST(NULL AS INT)                         AS CampaniaId,
    uc.FechaProximoControl                    AS Fecha,
    CAST(N'Silo' AS NVARCHAR(20))             AS Tipo,
    CAST(N'ControlSilo' AS NVARCHAR(30))      AS Subtipo,
    CAST(CONCAT(N'Control ', si.Nombre, CASE WHEN si.Producto IS NULL THEN N'' ELSE CONCAT(N' · ', si.Producto) END) AS NVARCHAR(200)) AS Titulo,
    CAST(CONCAT(CASE WHEN si.TipoSilo = N'Bolson' THEN N'Bolsón' ELSE N'Chapa' END,
                N' · último resultado: ',
                CASE uc.Resultado
                    WHEN N'Atencion' THEN N'Atención'
                    WHEN N'Critico'  THEN N'Crítico'
                    WHEN N'Normal'   THEN N'Normal'
                    ELSE N'sin evaluar'
                END) AS NVARCHAR(300)) AS Detalle,
    CAST(N'silos' AS NVARCHAR(30))            AS Modulo,
    si.SiloId                                 AS ReferenciaId
FROM dbo.Silos AS si
CROSS APPLY (
    SELECT TOP (1) sc.FechaProximoControl, sc.Resultado
    FROM dbo.SiloControles AS sc
    WHERE sc.SiloId = si.SiloId
    ORDER BY sc.Fecha DESC, sc.SiloControlId DESC
) AS uc
WHERE si.EmpresaId IS NOT NULL
  AND si.CantidadGranoAlmacenado > 0
  AND si.EstadoOperativo <> N'Dado de baja'
  AND uc.FechaProximoControl IS NOT NULL

UNION ALL

-- 2.2 Fin planificado de siembras que todavía no finalizaron
SELECT
    l.EmpresaId,
    ca.CampaniaId,
    sx.FechaFin,
    N'Siembra',
    N'FinSiembra',
    N'Fin planificado de siembra',
    CONCAT(sx.Nombre, N' · ', l.Nombre, N' · ', sx.Producto,
           CASE WHEN sx.CantidadHectareasTrabajadas IS NULL THEN N''
                ELSE CONCAT(N' (', CAST(CAST(sx.CantidadHectareasTrabajadas AS DECIMAL(12,0)) AS NVARCHAR(20)), N' ha)') END),
    N'siembras',
    sx.SiembraId
FROM dbo.Siembras AS sx
INNER JOIN dbo.Lotes AS l ON l.LoteId = sx.LoteId
LEFT JOIN dbo.Campanias AS ca ON ca.Nombre = sx.CampaniaNombre AND ca.EmpresaId = l.EmpresaId
WHERE l.EmpresaId IS NOT NULL
  AND sx.Estado <> N'Finalizado'
  AND sx.FechaFinReal IS NULL

UNION ALL

-- 2.3 Fin estimado de cosechas que todavía no finalizaron
SELECT
    l.EmpresaId,
    ca.CampaniaId,
    cx.FechaFin,
    N'Cosecha',
    N'FinCosecha',
    N'Fin estimado de cosecha',
    CONCAT(cx.Nombre, N' · ', l.Nombre, N' · ', cx.Producto,
           CASE WHEN cx.CantidadHectareasTrabajadas IS NULL THEN N''
                ELSE CONCAT(N' (', CAST(CAST(cx.CantidadHectareasTrabajadas AS DECIMAL(12,0)) AS NVARCHAR(20)), N' ha)') END),
    N'cosechas',
    cx.CosechaId
FROM dbo.Cosechas AS cx
INNER JOIN dbo.Lotes AS l ON l.LoteId = cx.LoteId
LEFT JOIN dbo.Campanias AS ca ON ca.Nombre = cx.CampaniaNombre AND ca.EmpresaId = l.EmpresaId
WHERE l.EmpresaId IS NOT NULL
  AND cx.Estado <> N'Finalizado'
  AND cx.FechaFinReal IS NULL

UNION ALL

-- 2.4 Inicio planificado de combinaciones que todavía no tienen siembra
SELECT
    c.EmpresaId,
    cc.CampaniaId,
    cc.FechaInicio,
    N'Siembra',
    N'InicioPlanificado',
    N'Inicio planificado de siembra',
    CONCAT(l.Nombre, N' · ', cc.Producto, N' (',
           CAST(CAST(l.Hectareas AS DECIMAL(12,0)) AS NVARCHAR(20)), N' ha)'),
    N'campanias',
    cc.CampaniaCombinacionId
FROM dbo.CampaniaCombinaciones AS cc
INNER JOIN dbo.Campanias AS c ON c.CampaniaId = cc.CampaniaId
INNER JOIN dbo.Lotes AS l ON l.LoteId = cc.LoteId
WHERE c.EmpresaId IS NOT NULL
  AND cc.Estado = N'Pendiente'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Siembras AS sx
      WHERE sx.LoteId = cc.LoteId
        AND sx.Producto = cc.Producto
        AND sx.CampaniaNombre = c.Nombre
        AND sx.TipoRegistro = N'Siembra'
  )

UNION ALL

-- 2.5 Camiones en tránsito (todavía sin llegada registrada)
SELECT
    v.EmpresaId,
    v.CampaniaId,
    v.FechaSalida,
    N'Distribucion',
    N'EnTransito',
    CONCAT(N'Camión ', v.Patente, N' en tránsito'),
    CONCAT(v.Distribucion, N' → ', v.Destino, N' · ',
           CAST(CAST(v.KgDespachados / 1000.0 AS DECIMAL(12,1)) AS NVARCHAR(20)), N' t de ', v.Producto),
    N'distribucion',
    v.DistribucionId
FROM dbo.vw_DistribucionCamiones AS v
WHERE v.Estado = N'En transito';
GO

/*
    Consultas de prueba (descomentar y reemplazar los ids):

    SELECT * FROM dbo.vw_InicioCombinaciones WHERE EmpresaId = 1 AND CampaniaId = 1 ORDER BY EtapaCodigo, LoteNombre;

    SELECT * FROM dbo.vw_InicioAgenda
    WHERE EmpresaId = 1
      AND (CampaniaId IS NULL OR CampaniaId = 1)
      AND Fecha <= DATEADD(DAY, 30, CAST(SYSDATETIME() AS DATE))
    ORDER BY Fecha, Tipo;
*/
