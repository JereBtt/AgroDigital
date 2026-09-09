/*
    Modulo: Campanias
    Fuente funcional: Manual de Usuario, seccion "Modulo Campanias".

    Una campania agrupa una o varias combinaciones Lote + Grano durante un periodo.
    Cada combinacion mantiene su propio estado y etapa para permitir operar procesos
    independientes dentro de una misma campania.
*/
IF OBJECT_ID(N'dbo.Campanias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Campanias
    (
        CampaniaId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NULL,
        Nombre NVARCHAR(30) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        Observaciones NVARCHAR(1000) NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Campanias_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_Campanias PRIMARY KEY CLUSTERED (CampaniaId),
        CONSTRAINT UQ_Campanias_Nombre UNIQUE (Nombre),
        CONSTRAINT FK_Campanias_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_Campanias_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_Campanias_Fechas CHECK (FechaFin >= FechaInicio)
    );
END;
GO

IF COL_LENGTH(N'dbo.Campanias', N'FechaInicio') IS NULL
BEGIN
    ALTER TABLE dbo.Campanias ADD FechaInicio DATE NOT NULL CONSTRAINT DF_Campanias_FechaInicio DEFAULT (CONVERT(date, SYSDATETIME())) WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Campanias', N'FechaFin') IS NULL
BEGIN
    ALTER TABLE dbo.Campanias ADD FechaFin DATE NOT NULL CONSTRAINT DF_Campanias_FechaFin DEFAULT (CONVERT(date, SYSDATETIME())) WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Campanias_Fechas' AND parent_object_id = OBJECT_ID(N'dbo.Campanias'))
BEGIN
    ALTER TABLE dbo.Campanias WITH CHECK ADD CONSTRAINT CK_Campanias_Fechas CHECK (FechaFin >= FechaInicio);
END;
GO

IF OBJECT_ID(N'dbo.CampaniaCombinaciones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CampaniaCombinaciones
    (
        CampaniaCombinacionId INT IDENTITY(1,1) NOT NULL,
        CampaniaId INT NOT NULL,
        LoteId INT NOT NULL,
        Producto NVARCHAR(60) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_CampaniaCombinaciones_Estado DEFAULT (N'Pendiente'),
        EtapaActual NVARCHAR(40) NOT NULL CONSTRAINT DF_CampaniaCombinaciones_Etapa DEFAULT (N'Sin etapa'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CampaniaCombinaciones_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_CampaniaCombinaciones PRIMARY KEY CLUSTERED (CampaniaCombinacionId),
        CONSTRAINT FK_CampaniaCombinaciones_Campanias FOREIGN KEY (CampaniaId) REFERENCES dbo.Campanias (CampaniaId),
        CONSTRAINT FK_CampaniaCombinaciones_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes (LoteId),
        CONSTRAINT CK_CampaniaCombinaciones_Fechas CHECK (FechaFin >= FechaInicio),
        CONSTRAINT CK_CampaniaCombinaciones_Estado CHECK (Estado IN (N'Pendiente', N'En curso', N'Finalizado')),
        CONSTRAINT CK_CampaniaCombinaciones_Etapa CHECK (EtapaActual IN (N'Sin etapa', N'Siembra', N'Cosecha', N'Destino del grano', N'Finalizada'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Campanias_EmpresaId' AND object_id = OBJECT_ID(N'dbo.Campanias'))
BEGIN
    CREATE INDEX IX_Campanias_EmpresaId ON dbo.Campanias (EmpresaId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CampaniaCombinaciones_CampaniaId' AND object_id = OBJECT_ID(N'dbo.CampaniaCombinaciones'))
BEGIN
    CREATE INDEX IX_CampaniaCombinaciones_CampaniaId ON dbo.CampaniaCombinaciones (CampaniaId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CampaniaCombinaciones_LoteProducto' AND object_id = OBJECT_ID(N'dbo.CampaniaCombinaciones'))
BEGIN
    CREATE INDEX IX_CampaniaCombinaciones_LoteProducto ON dbo.CampaniaCombinaciones (LoteId, Producto);
END;
GO
