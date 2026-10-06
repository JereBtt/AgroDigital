USE AgroDigital;
GO

-- La siembra queda asociada al ciclo de su planificación. Los registros
-- anteriores corresponden al ciclo de verano, que era el único disponible.
IF COL_LENGTH(N'dbo.Siembras', N'CicloEstacional') IS NULL
    ALTER TABLE dbo.Siembras ADD CicloEstacional NVARCHAR(10) NOT NULL
        CONSTRAINT DF_Siembras_CicloEstacional DEFAULT (N'Verano') WITH VALUES;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_CicloEstacional' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
    ALTER TABLE dbo.Siembras ADD CONSTRAINT CK_Siembras_CicloEstacional
        CHECK (CicloEstacional IN (N'Verano', N'Invierno'));
GO

-- Una baja iniciada desde Siembras puede afectar solo a la cadena de siembra
-- y dejar el lote activo para el cultivo de invierno.
IF COL_LENGTH(N'dbo.LoteDeshabilitaciones', N'AfectoLote') IS NULL
    ALTER TABLE dbo.LoteDeshabilitaciones ADD AfectoLote BIT NOT NULL
        CONSTRAINT DF_LoteDeshabilitaciones_AfectoLote DEFAULT (1) WITH VALUES;
GO
IF COL_LENGTH(N'dbo.LoteDeshabilitaciones', N'CicloEstacional') IS NULL
    ALTER TABLE dbo.LoteDeshabilitaciones ADD CicloEstacional NVARCHAR(10) NULL;
GO
IF COL_LENGTH(N'dbo.LoteDeshabilitaciones', N'CampaniaId') IS NULL
    ALTER TABLE dbo.LoteDeshabilitaciones ADD CampaniaId INT NULL;
GO
IF COL_LENGTH(N'dbo.CampaniaPlanificacionBajas', N'LoteDeshabilitacionId') IS NULL
    ALTER TABLE dbo.CampaniaPlanificacionBajas ADD LoteDeshabilitacionId INT NULL;
GO
