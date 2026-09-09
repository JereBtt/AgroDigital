/*
    Modulo: Siembras (fase 1 - pantalla de Consulta)
    Fuente funcional: Manual de Usuario, seccion "Modulo Siembras" / Historias SIEM-01 a SIEM-06.

    Decision de alcance (conversacion con la usuaria): el modulo Campanias todavia no esta
    construido, y se decidio que Siembras puede existir de forma standalone (sin depender de
    Campania). Por eso, en vez de una FK real a una tabla Campanias, por ahora se guarda
    CampaniaNombre como texto libre opcional. Cuando se construya el modulo Campanias, esta
    columna debera migrarse a una FK real (CampaniaId).

    Esta primera etapa crea la tabla base de Siembras con todos los campos que va a necesitar
    el formulario de alta (para no tener que migrar de nuevo), pero el foco inmediato es dejar
    andando la pantalla de Consulta. Insumos/Agroquimicos, Documentacion y Seguimiento de
    Siembra se agregan en una etapa posterior (tablas propias, siguiendo el mismo patron ya
    usado en Silos: sub-tablas con FK a SiembraId).
*/

use AgroDigital
go

IF OBJECT_ID(N'dbo.Siembras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Siembras
    (
        SiembraId INT IDENTITY(1,1) NOT NULL,
        Nombre NVARCHAR(30) NOT NULL,
        LoteId INT NOT NULL,
        CampaniaNombre NVARCHAR(150) NULL,
        Producto NVARCHAR(60) NOT NULL,
        Empresa NVARCHAR(150) NULL,
        TipoRegistro NVARCHAR(20) NOT NULL CONSTRAINT DF_Siembras_TipoRegistro DEFAULT (N'Siembra'),
        SiembraOriginalId INT NULL,
        TipoResiembra NVARCHAR(20) NULL,
        Siniestro NVARCHAR(180) NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        FechaFinReal DATE NULL,
        JustificacionDesvioFin NVARCHAR(1000) NULL,
        HectareasHora DECIMAL(18,4) NULL,
        VariedadSemilla NVARCHAR(100) NULL,
        PMG DECIMAL(10,2) NULL,
        DensidadSiembra DECIMAL(10,2) NULL,
        Profundidad DECIMAL(10,2) NULL,
        CantidadHectareasTrabajadas DECIMAL(18,4) NULL,
        UreaKgHa DECIMAL(18,4) NULL,
        CantidadSemillas DECIMAL(18,4) NULL,
        ResponsableACargo NVARCHAR(150) NULL,
        FechaMuestreo DATE NULL,
        FechaAnalisis DATE NULL,
        CantidadMuestras INT NULL,
        ProductoAntecesor NVARCHAR(100) NULL,
        ObservacionesPreSiembra NVARCHAR(1000) NULL,
        EstadoSiembra NVARCHAR(20) NOT NULL CONSTRAINT DF_Siembras_EstadoSiembra DEFAULT (N'En curso'),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_Siembras_Estado DEFAULT (N'Pendiente'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Siembras_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_Siembras PRIMARY KEY CLUSTERED (SiembraId),
        CONSTRAINT FK_Siembras_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes (LoteId),
        CONSTRAINT FK_Siembras_SiembraOriginal FOREIGN KEY (SiembraOriginalId) REFERENCES dbo.Siembras (SiembraId),
        CONSTRAINT FK_Siembras_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_Siembras_Estado CHECK (Estado IN (N'Pendiente', N'En curso', N'Finalizado')),
        CONSTRAINT CK_Siembras_EstadoSiembra CHECK (EstadoSiembra IN (N'En curso', N'Finalizado')),
        CONSTRAINT CK_Siembras_TipoRegistro CHECK (TipoRegistro IN (N'Siembra', N'Resiembra')),
        CONSTRAINT CK_Siembras_TipoResiembra CHECK (TipoResiembra IS NULL OR TipoResiembra IN (N'Total', N'Parcial')),
        CONSTRAINT CK_Siembras_HectareasHora CHECK (HectareasHora IS NULL OR HectareasHora >= 0)
    );
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'FechaFinReal') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD FechaFinReal DATE NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'JustificacionDesvioFin') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD JustificacionDesvioFin NVARCHAR(1000) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'HectareasHora') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD HectareasHora DECIMAL(18,4) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'UreaKgHa') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD UreaKgHa DECIMAL(18,4) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'EstadoSiembra') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras
    ADD EstadoSiembra NVARCHAR(20) NOT NULL CONSTRAINT DF_Siembras_EstadoSiembra DEFAULT (N'En curso') WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'TipoRegistro') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras
    ADD TipoRegistro NVARCHAR(20) NOT NULL CONSTRAINT DF_Siembras_TipoRegistro DEFAULT (N'Siembra') WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'SiembraOriginalId') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD SiembraOriginalId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'TipoResiembra') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD TipoResiembra NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Siembras', N'Siniestro') IS NULL
BEGIN
    ALTER TABLE dbo.Siembras ADD Siniestro NVARCHAR(180) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Siembras_SiembraOriginal' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT FK_Siembras_SiembraOriginal FOREIGN KEY (SiembraOriginalId) REFERENCES dbo.Siembras (SiembraId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_TipoRegistro' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_TipoRegistro CHECK (TipoRegistro IN (N'Siembra', N'Resiembra'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_EstadoSiembra' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_EstadoSiembra CHECK (EstadoSiembra IN (N'En curso', N'Finalizado'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_TipoResiembra' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_TipoResiembra CHECK (TipoResiembra IS NULL OR TipoResiembra IN (N'Total', N'Parcial'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_HectareasHora' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    ALTER TABLE dbo.Siembras
    ADD CONSTRAINT CK_Siembras_HectareasHora CHECK (HectareasHora IS NULL OR HectareasHora >= 0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Siembras_LoteId' AND object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    CREATE INDEX IX_Siembras_LoteId
    ON dbo.Siembras (LoteId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Siembras_Nombre' AND object_id = OBJECT_ID(N'dbo.Siembras'))
BEGIN
    CREATE INDEX IX_Siembras_Nombre
    ON dbo.Siembras (Nombre);
END;
GO
