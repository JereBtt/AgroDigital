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
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        VariedadSemilla NVARCHAR(100) NULL,
        PMG DECIMAL(10,2) NULL,
        DensidadSiembra DECIMAL(10,2) NULL,
        Profundidad DECIMAL(10,2) NULL,
        CantidadHectareasTrabajadas DECIMAL(18,4) NULL,
        CantidadSemillas DECIMAL(18,4) NULL,
        ResponsableACargo NVARCHAR(150) NULL,
        FechaMuestreo DATE NULL,
        FechaAnalisis DATE NULL,
        CantidadMuestras INT NULL,
        ProductoAntecesor NVARCHAR(100) NULL,
        ObservacionesPreSiembra NVARCHAR(1000) NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_Siembras_Estado DEFAULT (N'Pendiente'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Siembras_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_Siembras PRIMARY KEY CLUSTERED (SiembraId),
        CONSTRAINT FK_Siembras_Lotes FOREIGN KEY (LoteId) REFERENCES dbo.Lotes (LoteId),
        CONSTRAINT FK_Siembras_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_Siembras_Estado CHECK (Estado IN (N'Pendiente', N'En curso', N'Finalizado'))
    );
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
