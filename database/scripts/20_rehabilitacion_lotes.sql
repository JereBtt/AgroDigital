USE AgroDigital;
GO

-- Una baja conserva las siembras históricas sin impedir una nueva siembra original.
IF COL_LENGTH(N'dbo.Siembras', N'DeshabilitacionId') IS NULL
    ALTER TABLE dbo.Siembras ADD DeshabilitacionId INT NULL;
GO
IF COL_LENGTH(N'dbo.LoteDeshabilitaciones', N'EstadoSeguimientoAnterior') IS NULL
    ALTER TABLE dbo.LoteDeshabilitaciones ADD EstadoSeguimientoAnterior NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.LoteDeshabilitaciones', N'SeguimientoAutomaticoId') IS NULL
    ALTER TABLE dbo.LoteDeshabilitaciones ADD SeguimientoAutomaticoId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Siembras_Deshabilitaciones')
    ALTER TABLE dbo.Siembras ADD CONSTRAINT FK_Siembras_Deshabilitaciones
        FOREIGN KEY (DeshabilitacionId) REFERENCES dbo.LoteDeshabilitaciones(LoteDeshabilitacionId);
GO
