-- Completa el alcance de los siniestros automáticos creados antes de que se guardara como Total.
-- La observación fija identifica los registros automáticos, incluidos los anteriores
-- a la columna SeguimientoAutomaticoId de LoteDeshabilitaciones.
UPDATE seguimiento
SET Alcance = N'Total'
FROM dbo.SiembraSeguimientos AS seguimiento
WHERE seguimiento.TipoRegistro = N'Siniestro'
  AND seguimiento.Observaciones = N'Registro automático por deshabilitación del lote.'
  AND (seguimiento.Alcance IS NULL OR LTRIM(RTRIM(seguimiento.Alcance)) = N'');
