/*
    Modulo: Distribucion (base de datos)
    Fuente funcional: Manual de Usuario, seccion "Modulo Distribucion", y el
    rediseno acordado (mockup "AgroDigital - Modulo Distribucion").

    Decisiones de modelo:
      - Un envio (Distribuciones) agrupa uno o mas camiones (DistribucionCamiones).
        La merma se registra y concilia POR CAMION / Carta de Porte, no por envio.
      - Ciclo de cada camion: En transito -> Recibido -> Conciliado.
          * En transito: se registro la salida.
          * Recibido:    se cargo fecha de llegada y kg de la balanza de destino.
          * Conciliado:  se cargo el analisis y la liquidacion de la acopiadora.
        El estado del envio se deriva de sus camiones (vista al final).
      - Catalogos por empresa: Transportistas, Choferes, Camiones y Destinos.
        Permiten autocompletar y agrupar estadisticas por transportista y destino.
      - Parametros por empresa y grano (GranoParametrosDistribucion): manipuleo,
        tolerancia de materias extranas y umbrales del semaforo de desvio.
        No se precargan: los define el ingeniero (mismo criterio que
        GranoParametrosAlmacenamiento). La humedad base sale de
        GranoBasesComercializacion (script 21).
      - Al conciliar, la API guarda una FOTO de los parametros aplicados y de la
        merma esperada calculada. Si despues cambian los parametros, los envios
        ya conciliados conservan su resultado historico.
      - Si el grano sale de un silo, cada camion queda vinculado a su movimiento
        de Egreso en Almacenamientos (Origen = Distribucion). Ese egreso consume
        partidas FIFO, lo que da la trazabilidad lote -> silo -> camion.
      - Integridad multiempresa: FK compuestas (Id, EmpresaId) para que un envio
        no pueda usar choferes, camiones, destinos o silos de otra empresa.

    Formulas (las calcula la API al conciliar; aca quedan documentadas):
      Merma esperada (%) = Secado + Manipuleo + Materias extranas sobre tolerancia
        Secado (%)  = (HumedadDestino - HumedadBase) / (100 - HumedadBase) * 100
                      (0 si HumedadDestino <= HumedadBase)
        ME (%)      = MateriasExtranasDestino - ToleranciaME (0 si es menor)
      Merma esperada (kg)     = KgRecibidos * MermaEsperadaPct / 100
      Diferencia de balanza   = KgDespachados - KgRecibidos
      Descuento por calidad   = KgRecibidos - KgNetosLiquidados
      Merma total             = KgDespachados - KgNetosLiquidados
      Merma no justificada    = Merma total - Merma esperada (kg)
      Desvio (pp)             = Merma no justificada / KgDespachados * 100

    Convenciones del repo respetadas:
      - Valores persistidos sin tilde (En transito, Cosecha, Acopiadora...).
      - Script idempotente: puede ejecutarse mas de una vez.

    Requisitos previos: Empresas y Usuarios (00), Silos (02), Cosechas (09_cosechas),
    Campanias (10_campanias, 13), Almacenamiento y partidas (09, 10, 20, 21, 22).
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =========================================================================
   0. Clave alternativa en Silos para la FK compuesta (SiloId, EmpresaId)
   ========================================================================= */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Silos_Id_Empresa' AND object_id = OBJECT_ID(N'dbo.Silos'))
    CREATE UNIQUE INDEX UX_Silos_Id_Empresa ON dbo.Silos (SiloId, EmpresaId);
GO

/* =========================================================================
   1. Catalogos por empresa
   ========================================================================= */

IF OBJECT_ID(N'dbo.Transportistas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Transportistas
    (
        TransportistaId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        RazonSocial NVARCHAR(150) NOT NULL,
        Cuit NVARCHAR(13) NULL,
        Telefono NVARCHAR(30) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Transportistas_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Transportistas_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Transportistas PRIMARY KEY CLUSTERED (TransportistaId),
        CONSTRAINT UQ_Transportistas_Id_Empresa UNIQUE (TransportistaId, EmpresaId),
        CONSTRAINT UQ_Transportistas_Empresa_RazonSocial UNIQUE (EmpresaId, RazonSocial),
        CONSTRAINT FK_Transportistas_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId)
    );
END;
GO

IF OBJECT_ID(N'dbo.Choferes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Choferes
    (
        ChoferId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        TransportistaId INT NULL,
        Nombre NVARCHAR(100) NOT NULL,
        Apellido NVARCHAR(100) NOT NULL,
        Dni NVARCHAR(15) NOT NULL,
        Telefono NVARCHAR(30) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Choferes_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Choferes_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Choferes PRIMARY KEY CLUSTERED (ChoferId),
        CONSTRAINT UQ_Choferes_Id_Empresa UNIQUE (ChoferId, EmpresaId),
        CONSTRAINT UQ_Choferes_Empresa_Dni UNIQUE (EmpresaId, Dni),
        CONSTRAINT FK_Choferes_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_Choferes_Transportistas FOREIGN KEY (TransportistaId, EmpresaId)
            REFERENCES dbo.Transportistas (TransportistaId, EmpresaId)
    );
END;
GO

IF OBJECT_ID(N'dbo.Camiones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Camiones
    (
        CamionId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        TransportistaId INT NULL,
        Patente NVARCHAR(10) NOT NULL,        -- normalizada: mayusculas y sin espacios (AB123CD)
        Marca NVARCHAR(60) NOT NULL,
        Modelo NVARCHAR(60) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Camiones_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Camiones_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Camiones PRIMARY KEY CLUSTERED (CamionId),
        CONSTRAINT UQ_Camiones_Id_Empresa UNIQUE (CamionId, EmpresaId),
        CONSTRAINT UQ_Camiones_Empresa_Patente UNIQUE (EmpresaId, Patente),
        CONSTRAINT FK_Camiones_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_Camiones_Transportistas FOREIGN KEY (TransportistaId, EmpresaId)
            REFERENCES dbo.Transportistas (TransportistaId, EmpresaId),
        CONSTRAINT CK_Camiones_Patente CHECK (Patente NOT LIKE N'% %' AND LEN(Patente) BETWEEN 6 AND 10)
    );
END;
GO

IF OBJECT_ID(N'dbo.DestinosDistribucion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DestinosDistribucion
    (
        DestinoId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        Nombre NVARCHAR(150) NOT NULL,
        TipoDestino NVARCHAR(20) NOT NULL CONSTRAINT DF_DestinosDistribucion_Tipo DEFAULT (N'Acopiadora'),
        Pais NVARCHAR(100) NOT NULL,
        Provincia NVARCHAR(100) NOT NULL,
        Ciudad NVARCHAR(100) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_DestinosDistribucion_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_DestinosDistribucion_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_DestinosDistribucion PRIMARY KEY CLUSTERED (DestinoId),
        CONSTRAINT UQ_DestinosDistribucion_Id_Empresa UNIQUE (DestinoId, EmpresaId),
        CONSTRAINT UQ_DestinosDistribucion_Empresa_Nombre UNIQUE (EmpresaId, Nombre),
        CONSTRAINT FK_DestinosDistribucion_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT CK_DestinosDistribucion_Tipo CHECK (TipoDestino IN (N'Acopiadora', N'Cooperativa', N'Puerto', N'Industria', N'Otro'))
    );
END;
GO

/* =========================================================================
   2. Parametros de distribucion por empresa y grano
   ========================================================================= */

IF OBJECT_ID(N'dbo.GranoParametrosDistribucion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GranoParametrosDistribucion
    (
        GranoParametroDistribucionId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        Producto NVARCHAR(60) NOT NULL,
        ManipuleoPct DECIMAL(5,2) NOT NULL,
        ToleranciaMateriasExtranasPct DECIMAL(5,2) NOT NULL,
        DesvioMedioPp DECIMAL(5,2) NOT NULL CONSTRAINT DF_GranoParametrosDistribucion_Medio DEFAULT (0.50),
        DesvioAltoPp DECIMAL(5,2) NOT NULL CONSTRAINT DF_GranoParametrosDistribucion_Alto DEFAULT (1.50),
        ModificadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_GranoParametrosDistribucion_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_GranoParametrosDistribucion PRIMARY KEY CLUSTERED (GranoParametroDistribucionId),
        CONSTRAINT UQ_GranoParametrosDistribucion UNIQUE (EmpresaId, Producto),
        CONSTRAINT FK_GranoParametrosDistribucion_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_GranoParametrosDistribucion_Usuarios FOREIGN KEY (ModificadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_GranoParametrosDistribucion_Valores CHECK (
            ManipuleoPct >= 0 AND ManipuleoPct < 10
            AND ToleranciaMateriasExtranasPct >= 0 AND ToleranciaMateriasExtranasPct < 100
            AND DesvioMedioPp > 0 AND DesvioAltoPp > DesvioMedioPp
        )
    );
END;
GO

/* =========================================================================
   3. Distribuciones (cabecera del envio)
   ========================================================================= */

IF OBJECT_ID(N'dbo.Distribuciones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Distribuciones
    (
        DistribucionId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        Nombre NVARCHAR(30) NOT NULL,                 -- DIST - 0001, asignado por la API
        CampaniaId INT NULL,
        CosechaId INT NULL,
        Producto NVARCHAR(60) NOT NULL,
        OrigenGrano NVARCHAR(10) NOT NULL,            -- Cosecha | Silo
        SiloId INT NULL,
        FechaSalida DATE NOT NULL,
        ResponsableACargo NVARCHAR(150) NOT NULL,     -- persona del equipo, no el chofer
        Observaciones NVARCHAR(1000) NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Distribuciones_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,
        CreadoPorUsuarioId INT NULL,

        CONSTRAINT PK_Distribuciones PRIMARY KEY CLUSTERED (DistribucionId),
        CONSTRAINT UQ_Distribuciones_Id_Empresa UNIQUE (DistribucionId, EmpresaId),
        CONSTRAINT UQ_Distribuciones_Empresa_Nombre UNIQUE (EmpresaId, Nombre),
        CONSTRAINT FK_Distribuciones_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_Distribuciones_Campanias FOREIGN KEY (CampaniaId) REFERENCES dbo.Campanias (CampaniaId),
        CONSTRAINT FK_Distribuciones_Cosechas FOREIGN KEY (CosechaId) REFERENCES dbo.Cosechas (CosechaId),
        CONSTRAINT FK_Distribuciones_Silos FOREIGN KEY (SiloId, EmpresaId) REFERENCES dbo.Silos (SiloId, EmpresaId),
        CONSTRAINT FK_Distribuciones_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        -- Directo de cosecha: requiere cosecha y no lleva silo. Desde silo: requiere silo.
        CONSTRAINT CK_Distribuciones_Origen CHECK (
               (OrigenGrano = N'Cosecha' AND CosechaId IS NOT NULL AND SiloId IS NULL)
            OR (OrigenGrano = N'Silo' AND SiloId IS NOT NULL)
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Distribuciones_Empresa_Fecha' AND object_id = OBJECT_ID(N'dbo.Distribuciones'))
    CREATE INDEX IX_Distribuciones_Empresa_Fecha ON dbo.Distribuciones (EmpresaId, FechaSalida DESC, DistribucionId DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Distribuciones_CosechaId' AND object_id = OBJECT_ID(N'dbo.Distribuciones'))
    CREATE INDEX IX_Distribuciones_CosechaId ON dbo.Distribuciones (CosechaId) WHERE CosechaId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Distribuciones_CampaniaId' AND object_id = OBJECT_ID(N'dbo.Distribuciones'))
    CREATE INDEX IX_Distribuciones_CampaniaId ON dbo.Distribuciones (CampaniaId) WHERE CampaniaId IS NOT NULL;
GO

/* =========================================================================
   4. DistribucionCamiones (un registro por camion / Carta de Porte)
   ========================================================================= */

IF OBJECT_ID(N'dbo.DistribucionCamiones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DistribucionCamiones
    (
        DistribucionCamionId INT IDENTITY(1,1) NOT NULL,
        DistribucionId INT NOT NULL,
        EmpresaId INT NOT NULL,

        -- Salida
        ChoferId INT NOT NULL,
        CamionId INT NOT NULL,
        TransportistaId INT NULL,                     -- foto del transporte al momento del envio
        DestinoId INT NOT NULL,
        CodigoCpe NVARCHAR(30) NOT NULL,
        NroTicketBalanza NVARCHAR(30) NULL,
        KgDespachados DECIMAL(18,4) NOT NULL,
        AlmacenamientoEgresoId INT NULL,              -- egreso generado si el grano sale de un silo
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_DistribucionCamiones_Estado DEFAULT (N'En transito'),

        -- Recepcion en destino
        FechaLlegada DATE NULL,
        KgRecibidos DECIMAL(18,4) NULL,

        -- Analisis y liquidacion de la acopiadora
        HumedadDestino DECIMAL(5,2) NULL,
        MateriasExtranasDestino DECIMAL(5,2) NULL,
        KgNetosLiquidados DECIMAL(18,4) NULL,
        NroLiquidacion NVARCHAR(40) NULL,
        Observaciones NVARCHAR(1000) NULL,

        -- Foto de parametros y resultado al conciliar (los calcula la API)
        HumedadBaseAplicada DECIMAL(5,2) NULL,
        ManipuleoPctAplicado DECIMAL(5,2) NULL,
        ToleranciaMePctAplicada DECIMAL(5,2) NULL,
        MermaEsperadaPct DECIMAL(7,4) NULL,
        MermaEsperadaKg DECIMAL(18,4) NULL,
        NivelDesvio NVARCHAR(10) NULL,                -- Bajo | Medio | Alto (NULL si no hay parametros)
        FechaConciliacion DATETIME2(0) NULL,
        ConciliadoPorUsuarioId INT NULL,

        -- Derivados (se recalculan solos)
        DiferenciaBalanzaKg AS (KgDespachados - KgRecibidos) PERSISTED,
        DescuentoCalidadKg AS (KgRecibidos - KgNetosLiquidados) PERSISTED,
        MermaTotalKg AS (KgDespachados - KgNetosLiquidados) PERSISTED,
        MermaNoJustificadaKg AS (KgDespachados - KgNetosLiquidados - MermaEsperadaKg) PERSISTED,

        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_DistribucionCamiones_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_DistribucionCamiones PRIMARY KEY CLUSTERED (DistribucionCamionId),
        CONSTRAINT UQ_DistribucionCamiones_Empresa_Cpe UNIQUE (EmpresaId, CodigoCpe),
        CONSTRAINT FK_DistribucionCamiones_Distribuciones FOREIGN KEY (DistribucionId, EmpresaId)
            REFERENCES dbo.Distribuciones (DistribucionId, EmpresaId),
        CONSTRAINT FK_DistribucionCamiones_Choferes FOREIGN KEY (ChoferId, EmpresaId)
            REFERENCES dbo.Choferes (ChoferId, EmpresaId),
        CONSTRAINT FK_DistribucionCamiones_Camiones FOREIGN KEY (CamionId, EmpresaId)
            REFERENCES dbo.Camiones (CamionId, EmpresaId),
        CONSTRAINT FK_DistribucionCamiones_Transportistas FOREIGN KEY (TransportistaId, EmpresaId)
            REFERENCES dbo.Transportistas (TransportistaId, EmpresaId),
        CONSTRAINT FK_DistribucionCamiones_Destinos FOREIGN KEY (DestinoId, EmpresaId)
            REFERENCES dbo.DestinosDistribucion (DestinoId, EmpresaId),
        CONSTRAINT FK_DistribucionCamiones_Egreso FOREIGN KEY (AlmacenamientoEgresoId)
            REFERENCES dbo.Almacenamientos (AlmacenamientoId),
        CONSTRAINT FK_DistribucionCamiones_Usuarios FOREIGN KEY (ConciliadoPorUsuarioId)
            REFERENCES dbo.Usuarios (UsuarioId),

        CONSTRAINT CK_DistribucionCamiones_Estado CHECK (Estado IN (N'En transito', N'Recibido', N'Conciliado')),
        CONSTRAINT CK_DistribucionCamiones_Kg CHECK (
            KgDespachados > 0
            AND (KgRecibidos IS NULL OR KgRecibidos > 0)
            AND (KgNetosLiquidados IS NULL OR KgNetosLiquidados > 0)
        ),
        CONSTRAINT CK_DistribucionCamiones_Calidad CHECK (
            (HumedadDestino IS NULL OR HumedadDestino BETWEEN 0 AND 100)
            AND (MateriasExtranasDestino IS NULL OR MateriasExtranasDestino BETWEEN 0 AND 100)
        ),
        CONSTRAINT CK_DistribucionCamiones_NivelDesvio CHECK (NivelDesvio IS NULL OR NivelDesvio IN (N'Bajo', N'Medio', N'Alto')),
        -- Cada estado exige los datos de su etapa.
        CONSTRAINT CK_DistribucionCamiones_DatosPorEstado CHECK (
               (Estado = N'En transito')
            OR (Estado = N'Recibido' AND FechaLlegada IS NOT NULL AND KgRecibidos IS NOT NULL)
            OR (Estado = N'Conciliado'
                AND FechaLlegada IS NOT NULL AND KgRecibidos IS NOT NULL
                AND HumedadDestino IS NOT NULL AND MateriasExtranasDestino IS NOT NULL
                AND KgNetosLiquidados IS NOT NULL AND FechaConciliacion IS NOT NULL)
        )
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistribucionCamiones_Distribucion' AND object_id = OBJECT_ID(N'dbo.DistribucionCamiones'))
    CREATE INDEX IX_DistribucionCamiones_Distribucion ON dbo.DistribucionCamiones (DistribucionId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistribucionCamiones_Empresa_Estado' AND object_id = OBJECT_ID(N'dbo.DistribucionCamiones'))
    CREATE INDEX IX_DistribucionCamiones_Empresa_Estado ON dbo.DistribucionCamiones (EmpresaId, Estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistribucionCamiones_Destino' AND object_id = OBJECT_ID(N'dbo.DistribucionCamiones'))
    CREATE INDEX IX_DistribucionCamiones_Destino ON dbo.DistribucionCamiones (DestinoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistribucionCamiones_Transportista' AND object_id = OBJECT_ID(N'dbo.DistribucionCamiones'))
    CREATE INDEX IX_DistribucionCamiones_Transportista ON dbo.DistribucionCamiones (TransportistaId) WHERE TransportistaId IS NOT NULL;
GO
-- Un egreso de almacenamiento pertenece a un solo camion.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DistribucionCamiones_Egreso' AND object_id = OBJECT_ID(N'dbo.DistribucionCamiones'))
    CREATE UNIQUE INDEX UX_DistribucionCamiones_Egreso ON dbo.DistribucionCamiones (AlmacenamientoEgresoId)
    WHERE AlmacenamientoEgresoId IS NOT NULL;
GO

/* =========================================================================
   5. Documentacion (del envio o de un camion puntual: CPE, liquidacion...)
   ========================================================================= */

IF OBJECT_ID(N'dbo.DistribucionDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DistribucionDocumentos
    (
        DistribucionDocumentoId INT IDENTITY(1,1) NOT NULL,
        DistribucionId INT NOT NULL,
        DistribucionCamionId INT NULL,                -- NULL = documento del envio completo
        NombreArchivo NVARCHAR(260) NOT NULL,
        RutaArchivo NVARCHAR(500) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_DistribucionDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
        CargadoPorUsuarioId INT NULL,

        CONSTRAINT PK_DistribucionDocumentos PRIMARY KEY CLUSTERED (DistribucionDocumentoId),
        CONSTRAINT FK_DistribucionDocumentos_Distribuciones FOREIGN KEY (DistribucionId) REFERENCES dbo.Distribuciones (DistribucionId),
        CONSTRAINT FK_DistribucionDocumentos_Camiones FOREIGN KEY (DistribucionCamionId) REFERENCES dbo.DistribucionCamiones (DistribucionCamionId),
        CONSTRAINT FK_DistribucionDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistribucionDocumentos_Distribucion' AND object_id = OBJECT_ID(N'dbo.DistribucionDocumentos'))
    CREATE INDEX IX_DistribucionDocumentos_Distribucion ON dbo.DistribucionDocumentos (DistribucionId, DistribucionCamionId);
GO

/* =========================================================================
   6. Vistas de consulta
   ========================================================================= */

-- Una fila por camion, con nombres resueltos y porcentajes listos para la tabla
-- principal, los KPIs del modulo y el futuro dashboard de Estadisticas.
CREATE OR ALTER VIEW dbo.vw_DistribucionCamiones
AS
SELECT
    dc.DistribucionCamionId,
    dc.DistribucionId,
    dc.EmpresaId,
    d.Nombre AS Distribucion,
    d.CampaniaId,
    cp.Nombre AS Campania,
    d.CosechaId,
    co.Nombre AS Cosecha,
    co.LoteId,
    d.Producto,
    d.OrigenGrano,
    d.SiloId,
    s.Nombre AS Silo,
    d.FechaSalida,
    d.ResponsableACargo,
    dc.CodigoCpe,
    dc.ChoferId,
    ch.Nombre + N' ' + ch.Apellido AS Chofer,
    dc.TransportistaId,
    t.RazonSocial AS Transportista,
    dc.CamionId,
    ca.Patente,
    dc.DestinoId,
    de.Nombre AS Destino,
    dc.Estado,
    dc.FechaLlegada,
    DATEDIFF(DAY, dc.FechaLlegada, CONVERT(date, SYSDATETIME())) AS DiasSinConciliar,
    dc.KgDespachados,
    dc.KgRecibidos,
    dc.KgNetosLiquidados,
    dc.HumedadDestino,
    dc.MateriasExtranasDestino,
    dc.DiferenciaBalanzaKg,
    dc.DescuentoCalidadKg,
    dc.MermaTotalKg,
    dc.MermaEsperadaKg,
    dc.MermaEsperadaPct,
    dc.MermaNoJustificadaKg,
    CAST(dc.DiferenciaBalanzaKg * 100.0 / dc.KgDespachados AS DECIMAL(9,4)) AS DiferenciaBalanzaPct,
    CAST(dc.MermaTotalKg * 100.0 / dc.KgDespachados AS DECIMAL(9,4)) AS MermaTotalPct,
    CAST(dc.MermaNoJustificadaKg * 100.0 / dc.KgDespachados AS DECIMAL(9,4)) AS DesvioPp,
    dc.NivelDesvio,
    dc.AlmacenamientoEgresoId
FROM dbo.DistribucionCamiones AS dc
INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = dc.DistribucionId
INNER JOIN dbo.Choferes AS ch ON ch.ChoferId = dc.ChoferId
INNER JOIN dbo.Camiones AS ca ON ca.CamionId = dc.CamionId
INNER JOIN dbo.DestinosDistribucion AS de ON de.DestinoId = dc.DestinoId
LEFT JOIN dbo.Transportistas AS t ON t.TransportistaId = dc.TransportistaId
LEFT JOIN dbo.Campanias AS cp ON cp.CampaniaId = d.CampaniaId
LEFT JOIN dbo.Cosechas AS co ON co.CosechaId = d.CosechaId
LEFT JOIN dbo.Silos AS s ON s.SiloId = d.SiloId;
GO

-- Estado del envio derivado de sus camiones:
--   Conciliado si todos lo estan; En transito si ninguno llego; si no, Recibido.
CREATE OR ALTER VIEW dbo.vw_DistribucionesResumen
AS
SELECT
    d.DistribucionId,
    d.EmpresaId,
    d.Nombre,
    d.CampaniaId,
    d.CosechaId,
    d.Producto,
    d.OrigenGrano,
    d.SiloId,
    d.FechaSalida,
    d.ResponsableACargo,
    COUNT(dc.DistribucionCamionId) AS CantidadCamiones,
    SUM(dc.KgDespachados) AS KgDespachados,
    SUM(dc.KgNetosLiquidados) AS KgNetosLiquidados,
    CASE
        WHEN COUNT(dc.DistribucionCamionId) = 0 THEN N'En transito'
        WHEN SUM(CASE WHEN dc.Estado = N'Conciliado' THEN 1 ELSE 0 END) = COUNT(dc.DistribucionCamionId) THEN N'Conciliado'
        WHEN SUM(CASE WHEN dc.Estado = N'En transito' THEN 1 ELSE 0 END) = COUNT(dc.DistribucionCamionId) THEN N'En transito'
        ELSE N'Recibido'
    END AS Estado
FROM dbo.Distribuciones AS d
LEFT JOIN dbo.DistribucionCamiones AS dc ON dc.DistribucionId = d.DistribucionId
GROUP BY d.DistribucionId, d.EmpresaId, d.Nombre, d.CampaniaId, d.CosechaId, d.Producto,
         d.OrigenGrano, d.SiloId, d.FechaSalida, d.ResponsableACargo;
GO

/* =========================================================================
   7. Reporte de verificacion (no modifica datos)
   ========================================================================= */

-- Silos sin empresa: no pueden usarse como origen (FK compuesta con EmpresaId).
SELECT N'Silo sin empresa: no podra usarse como origen de distribucion' AS Revisar, SiloId, Nombre
FROM dbo.Silos
WHERE EmpresaId IS NULL;

-- Granos con humedad base pero sin parametros de distribucion en alguna empresa.
SELECT N'Empresa sin parametros de distribucion para este grano' AS Revisar, e.EmpresaId, e.Nombre AS Empresa, b.Producto
FROM dbo.Empresas AS e
CROSS JOIN dbo.GranoBasesComercializacion AS b
WHERE e.Activo = 1
  AND NOT EXISTS (
        SELECT 1 FROM dbo.GranoParametrosDistribucion AS p
        WHERE p.EmpresaId = e.EmpresaId AND p.Producto = b.Producto
  );
GO
