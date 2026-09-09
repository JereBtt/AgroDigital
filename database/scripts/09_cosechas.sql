/*
    Modulo: Cosechas
    Fuente funcional: Manual de Usuario, seccion "Modulo Cosechas".

    Flujo vigente:
    - Al registrar una cosecha se cargan los datos iniciales y queda En curso.
    - FechaFin representa la fecha tentativa.
    - FechaFinReal se carga al finalizar la cosecha junto con el resultado.
    - La Tirada de Aros es un control opcional e independiente del estado de cosecha.
*/
USE AgroDigital;
GO

IF OBJECT_ID(N'dbo.Cosechas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Cosechas
    (
        CosechaId INT IDENTITY(1,1) NOT NULL,
        Nombre NVARCHAR(30) NOT NULL,
        SiembraId INT NULL,
        LoteId INT NOT NULL,
        CampaniaNombre NVARCHAR(150) NULL,
        Producto NVARCHAR(60) NOT NULL,
        Empresa NVARCHAR(150) NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        FechaFinReal DATE NULL,
        JustificacionDesvioFin NVARCHAR(1000) NULL,
        CantidadGranoCosechado DECIMAL(18,4) NULL,
        CantidadHectareasTrabajadas DECIMAL(18,4) NULL,
        HumedadGrano DECIMAL(10,2) NULL,
        Impurezas DECIMAL(10,2) NULL,
        ResponsableACargo NVARCHAR(150) NULL,
        RindeKgHa DECIMAL(18,4) NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_Cosechas_Estado DEFAULT (N'En curso'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Cosechas_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_Cosechas PRIMARY KEY CLUSTERED (CosechaId),
        CONSTRAINT FK_Cosechas_Siembras FOREIGN KEY (SiembraId) REFERENCES dbo.Siembras (SiembraId),
        CONSTRAINT FK_Cosechas_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes (LoteId),
        CONSTRAINT FK_Cosechas_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_Cosechas_Estado CHECK (Estado IN (N'Pendiente', N'En curso', N'Finalizado')),
        CONSTRAINT CK_Cosechas_Grano CHECK (CantidadGranoCosechado IS NULL OR CantidadGranoCosechado > 0),
        CONSTRAINT CK_Cosechas_Hectareas CHECK (CantidadHectareasTrabajadas IS NULL OR CantidadHectareasTrabajadas > 0),
        CONSTRAINT CK_Cosechas_Rinde CHECK (RindeKgHa IS NULL OR RindeKgHa > 0)
    );
END;
GO

IF COL_LENGTH(N'dbo.Cosechas', N'FechaFinReal') IS NULL
BEGIN
    ALTER TABLE dbo.Cosechas ADD FechaFinReal DATE NULL;
END;
GO

IF COL_LENGTH(N'dbo.Cosechas', N'JustificacionDesvioFin') IS NULL
BEGIN
    ALTER TABLE dbo.Cosechas ADD JustificacionDesvioFin NVARCHAR(1000) NULL;
END;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Cosechas_Grano' AND parent_object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    ALTER TABLE dbo.Cosechas DROP CONSTRAINT CK_Cosechas_Grano;
END;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Cosechas_Hectareas' AND parent_object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    ALTER TABLE dbo.Cosechas DROP CONSTRAINT CK_Cosechas_Hectareas;
END;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Cosechas_Rinde' AND parent_object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    ALTER TABLE dbo.Cosechas DROP CONSTRAINT CK_Cosechas_Rinde;
END;
GO

ALTER TABLE dbo.Cosechas ALTER COLUMN CantidadGranoCosechado DECIMAL(18,4) NULL;
GO

ALTER TABLE dbo.Cosechas ALTER COLUMN CantidadHectareasTrabajadas DECIMAL(18,4) NULL;
GO

ALTER TABLE dbo.Cosechas ALTER COLUMN RindeKgHa DECIMAL(18,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Cosechas_Grano' AND parent_object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_Grano CHECK (CantidadGranoCosechado IS NULL OR CantidadGranoCosechado > 0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Cosechas_Hectareas' AND parent_object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_Hectareas CHECK (CantidadHectareasTrabajadas IS NULL OR CantidadHectareasTrabajadas > 0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Cosechas_Rinde' AND parent_object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_Rinde CHECK (RindeKgHa IS NULL OR RindeKgHa > 0);
END;
GO

DECLARE @DefaultEstado NVARCHAR(128);
DECLARE @DropDefaultEstadoSql NVARCHAR(MAX);
SELECT @DefaultEstado = dc.name
FROM sys.default_constraints AS dc
INNER JOIN sys.columns AS c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Cosechas') AND c.name = N'Estado';

IF @DefaultEstado IS NOT NULL
BEGIN
    SET @DropDefaultEstadoSql = N'ALTER TABLE dbo.Cosechas DROP CONSTRAINT ' + QUOTENAME(@DefaultEstado);
    EXEC sp_executesql @DropDefaultEstadoSql;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints AS dc
    INNER JOIN sys.columns AS c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Cosechas') AND c.name = N'Estado'
)
BEGIN
    ALTER TABLE dbo.Cosechas ADD CONSTRAINT DF_Cosechas_Estado DEFAULT (N'En curso') FOR Estado;
END;
GO

UPDATE dbo.Cosechas
SET Estado = N'En curso'
WHERE Estado = N'Pendiente';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cosechas_LoteId' AND object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    CREATE INDEX IX_Cosechas_LoteId
    ON dbo.Cosechas (LoteId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cosechas_SiembraId' AND object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    CREATE INDEX IX_Cosechas_SiembraId
    ON dbo.Cosechas (SiembraId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cosechas_Nombre' AND object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    CREATE INDEX IX_Cosechas_Nombre
    ON dbo.Cosechas (Nombre);
END;
GO

IF OBJECT_ID(N'dbo.CosechaTiradaAros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CosechaTiradaAros
    (
        CosechaTiradaAroId INT IDENTITY(1,1) NOT NULL,
        CosechaId INT NOT NULL,
        Fecha DATE NOT NULL,
        Latitud DECIMAL(9,6) NULL,
        Longitud DECIMAL(9,6) NULL,
        AroCabezal INT NOT NULL,
        AroCola1 INT NOT NULL,
        AroCola2 INT NOT NULL,
        AroCola3 INT NOT NULL,
        PMG DECIMAL(10,2) NOT NULL,
        PerdidaCabezalKgHa DECIMAL(18,4) NOT NULL,
        PerdidaColaKgHa DECIMAL(18,4) NOT NULL,
        PerdidaTotalKgHa DECIMAL(18,4) NOT NULL,
        Severidad NVARCHAR(20) NOT NULL,
        AjustoMaquinaria BIT NOT NULL CONSTRAINT DF_CosechaTiradaAros_Ajusto DEFAULT (0),
        Observaciones NVARCHAR(1000) NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CosechaTiradaAros_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_CosechaTiradaAros PRIMARY KEY CLUSTERED (CosechaTiradaAroId),
        CONSTRAINT FK_CosechaTiradaAros_Cosechas FOREIGN KEY (CosechaId) REFERENCES dbo.Cosechas (CosechaId),
        CONSTRAINT FK_CosechaTiradaAros_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_CosechaTiradaAros_Granos CHECK (AroCabezal >= 0 AND AroCola1 >= 0 AND AroCola2 >= 0 AND AroCola3 >= 0),
        CONSTRAINT CK_CosechaTiradaAros_PMG CHECK (PMG > 0),
        CONSTRAINT CK_CosechaTiradaAros_Perdidas CHECK (PerdidaCabezalKgHa >= 0 AND PerdidaColaKgHa >= 0 AND PerdidaTotalKgHa >= 0),
        CONSTRAINT CK_CosechaTiradaAros_Severidad CHECK (Severidad IN (N'Baja', N'Media', N'Alta'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CosechaTiradaAros_CosechaId' AND object_id = OBJECT_ID(N'dbo.CosechaTiradaAros'))
BEGIN
    CREATE INDEX IX_CosechaTiradaAros_CosechaId
    ON dbo.CosechaTiradaAros (CosechaId, Fecha DESC);
END;
GO

IF OBJECT_ID(N'dbo.CosechaDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CosechaDocumentos
    (
        CosechaDocumentoId INT IDENTITY(1,1) NOT NULL,
        CosechaId INT NOT NULL,
        NombreArchivo NVARCHAR(260) NOT NULL,
        RutaArchivo NVARCHAR(500) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_CosechaDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
        CargadoPorUsuarioId INT NULL,

        CONSTRAINT PK_CosechaDocumentos PRIMARY KEY CLUSTERED (CosechaDocumentoId),
        CONSTRAINT FK_CosechaDocumentos_Cosechas FOREIGN KEY (CosechaId) REFERENCES dbo.Cosechas (CosechaId),
        CONSTRAINT FK_CosechaDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CosechaDocumentos_CosechaId' AND object_id = OBJECT_ID(N'dbo.CosechaDocumentos'))
BEGIN
    CREATE INDEX IX_CosechaDocumentos_CosechaId
    ON dbo.CosechaDocumentos (CosechaId);
END;
GO
