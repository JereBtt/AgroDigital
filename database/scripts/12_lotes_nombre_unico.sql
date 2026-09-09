/*
    Modulo: Lotes
    Regla: no permitir dos lotes con el mismo nombre dentro de la misma empresa,
    ignorando mayusculas, minusculas, acentos y espacios al inicio/fin.
*/

SET ANSI_NULLS ON;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.Lotes', N'NombreNormalizado') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes
    ADD NombreNormalizado AS LOWER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI PERSISTED;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Lotes_Empresa_NombreNormalizado' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Lotes
        GROUP BY EmpresaId, NombreNormalizado
        HAVING COUNT(*) > 1
    )
    BEGIN
        CREATE UNIQUE INDEX UX_Lotes_Empresa_NombreNormalizado
        ON dbo.Lotes (EmpresaId, NombreNormalizado);
    END
    ELSE
    BEGIN
        PRINT N'No se creo UX_Lotes_Empresa_NombreNormalizado porque existen lotes duplicados. Corregir nombres duplicados y volver a ejecutar.';
    END
END;
GO
