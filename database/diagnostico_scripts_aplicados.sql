/*
    Diagnostico: que scripts incrementales ya estan aplicados en tu base local.
    Solo consulta, no modifica nada. Ejecutar en SSMS contra AgroDigital.
    Cada fila revisa un objeto que el script crea; "Pendiente" = hay que correrlo.
*/
USE AgroDigital;
GO

SELECT Script, CASE WHEN Aplicado = 1 THEN N'Aplicado' ELSE N'Pendiente' END AS Estado
FROM (VALUES
    (N'09_almacenamiento',                         CASE WHEN OBJECT_ID(N'dbo.Almacenamientos', N'U') IS NOT NULL THEN 1 ELSE 0 END),
    (N'09_cosechas',                               CASE WHEN COL_LENGTH(N'dbo.Cosechas', N'JustificacionDesvioFin') IS NOT NULL THEN 1 ELSE 0 END),
    (N'10_almacenamiento_campania_cosecha',        CASE WHEN COL_LENGTH(N'dbo.Almacenamientos', N'Cosecha') IS NOT NULL THEN 1 ELSE 0 END),
    (N'10_campanias',                              CASE WHEN OBJECT_ID(N'dbo.CampaniaCombinaciones', N'U') IS NOT NULL THEN 1 ELSE 0 END),
    (N'11_lotes_cultivos',                         CASE WHEN COL_LENGTH(N'dbo.Lotes', N'CultivoAnteriorCampania') IS NOT NULL THEN 1 ELSE 0 END),
    (N'12_lotes_nombre_unico',                     CASE WHEN COL_LENGTH(N'dbo.Lotes', N'NombreNormalizado') IS NOT NULL THEN 1 ELSE 0 END),
    (N'13_campanias_periodo_empresa (ver aviso)',  CASE WHEN COL_LENGTH(N'dbo.Campanias', N'Periodo') IS NOT NULL THEN 1 ELSE 0 END),
    (N'14_siembra_urea_unidad_agroquimicos',       CASE WHEN COL_LENGTH(N'dbo.Siembras', N'UreaKgHa') IS NOT NULL THEN 1 ELSE 0 END),
    (N'15_seguimientos_siniestros_posemergentes',  CASE WHEN COL_LENGTH(N'dbo.SiembraSeguimientos', N'Alcance') IS NOT NULL THEN 1 ELSE 0 END),
    (N'16_resiembras_seguimiento_consolidado',     CASE WHEN COL_LENGTH(N'dbo.SiembraSeguimientos', N'EsResiembra') IS NOT NULL THEN 1 ELSE 0 END),
    (N'17_siembra_barbechos_preemergentes',        CASE WHEN COL_LENGTH(N'dbo.SiembraInsumos', N'MotivoAplicacion') IS NOT NULL THEN 1 ELSE 0 END),
    (N'18_catalogos_agricolas',                    CASE WHEN OBJECT_ID(N'dbo.CatalogoValores', N'U') IS NOT NULL THEN 1 ELSE 0 END),
    (N'19_siembra_detalle_agronomico',             CASE WHEN COL_LENGTH(N'dbo.Siembras', N'CicloCultivo') IS NOT NULL THEN 1 ELSE 0 END),
    (N'20_almacenamiento_producto (tuyo)',          CASE WHEN COL_LENGTH(N'dbo.Almacenamientos', N'Producto') IS NOT NULL THEN 1 ELSE 0 END),
    (N'21_silos_almacenamiento_rediseno (nuevo)',  CASE WHEN COL_LENGTH(N'dbo.Silos', N'EstadoOperativo') IS NOT NULL THEN 1 ELSE 0 END)
) AS v(Script, Aplicado);
GO
