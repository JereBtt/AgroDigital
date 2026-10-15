/*
    Ejecutar una sola vez en bases existentes, después de respaldar los datos.
    Renumera las siembras y resiembras por empresa, según el orden de alta
    (SiembraId). Los vínculos y las claves primarias no se modifican.
*/
USE AgroDigital;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

SELECT s.SiembraId,
       ROW_NUMBER() OVER (PARTITION BY l.EmpresaId ORDER BY s.SiembraId) AS Numero
INTO #NumeracionSiembras
FROM dbo.Siembras AS s WITH (TABLOCKX, HOLDLOCK)
JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
WHERE l.EmpresaId IS NOT NULL;

UPDATE s
SET Nombre = N'SIEM - ' + CASE WHEN n.Numero < 10000
    THEN RIGHT(N'0000' + CONVERT(NVARCHAR(20), n.Numero), 4)
    ELSE CONVERT(NVARCHAR(20), n.Numero) END
FROM dbo.Siembras AS s
JOIN #NumeracionSiembras AS n ON n.SiembraId = s.SiembraId;

COMMIT TRANSACTION;
GO
