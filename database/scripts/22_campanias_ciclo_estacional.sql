-- Permite planificar cada lote una vez por ciclo estacional dentro de una campaña.
-- Las combinaciones anteriores se consideran de verano para conservar su historial.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
    SELECT 1 FROM dbo.CampaniaCombinaciones
    GROUP BY CampaniaId, LoteId
    HAVING COUNT(*) > 1
) AND COL_LENGTH(N'dbo.CampaniaCombinaciones', N'CicloEstacional') IS NULL
    THROW 51022, 'Hay lotes repetidos en una campaña. Revisar el ciclo de cada combinación antes de migrar.', 1;

IF COL_LENGTH(N'dbo.CampaniaCombinaciones', N'CicloEstacional') IS NULL
    ALTER TABLE dbo.CampaniaCombinaciones
    ADD CicloEstacional NVARCHAR(10) NOT NULL
        CONSTRAINT DF_CampaniaCombinaciones_CicloEstacional DEFAULT (N'Verano') WITH VALUES;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_CampaniaCombinaciones_CicloEstacional'
      AND parent_object_id = OBJECT_ID(N'dbo.CampaniaCombinaciones')
)
    ALTER TABLE dbo.CampaniaCombinaciones WITH CHECK
    ADD CONSTRAINT CK_CampaniaCombinaciones_CicloEstacional
    CHECK (CicloEstacional IN (N'Verano', N'Invierno'));

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_CampaniaCombinaciones_Campania_Lote_Ciclo'
      AND object_id = OBJECT_ID(N'dbo.CampaniaCombinaciones')
)
    CREATE UNIQUE INDEX UX_CampaniaCombinaciones_Campania_Lote_Ciclo
    ON dbo.CampaniaCombinaciones (CampaniaId, LoteId, CicloEstacional);

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Campanias_DuracionMinima'
      AND parent_object_id = OBJECT_ID(N'dbo.Campanias')
)
    ALTER TABLE dbo.Campanias WITH CHECK
    ADD CONSTRAINT CK_Campanias_DuracionMinima
    CHECK (FechaFin >= DATEADD(MONTH, 4, FechaInicio));

COMMIT TRANSACTION;
