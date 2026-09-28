/*
    Modulo: Silos + Almacenamiento - Rediseno fase 1 (base de datos)
    Fuente funcional: "AgroDigital - Redefinicion de Silos y Almacenamiento"
    (propuesta funcional, secciones Impacto en base de datos y Parametros por grano).

    Decisiones confirmadas:
      - Antiguedad del grano con partidas FIFO completas.
      - Un solo grano por silo (se valida en la API; la base guarda el grano
        de cada partida y del silo).
      - Separacion por empresa: EmpresaId en Silos, Almacenamientos y partidas.

    Compatibilidad con la API actual:
      Todas las columnas nuevas son NULL o tienen DEFAULT, y los CHECK solo se
      AMPLIAN (se agregan valores, no se quitan). La API y el frontend actuales
      siguen funcionando sin cambios hasta la fase 2, que empieza a completar
      EmpresaId, CosechaId, CampaniaId, partidas y estados.

    Convenciones del repo respetadas:
      - Valores persistidos sin tilde (Maiz, Bolson, Vacio, Atencion...). El
        frontend los muestra con tilde.
      - Script idempotente: puede ejecutarse mas de una vez.

    Requisitos previos: Silos (02, 03, 04), Almacenamiento (09_almacenamiento,
    10_almacenamiento_campania_cosecha, 20_almacenamiento_producto), Cosechas (09_cosechas),
    Campanias (10_campanias, 13_campanias_periodo_empresa) y Empresas.

    NO incluido aca (fases siguientes): logica de API, consumo FIFO al registrar
    egresos, transferencias y alertas. Tampoco se reconstruye el historial de
    consumos previo: las partidas migradas quedan con sus kg restantes, pero sin
    el detalle de que egreso consumio cada una.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =========================================================================
   1. Silos: columnas nuevas
   ========================================================================= */

IF COL_LENGTH(N'dbo.Silos', N'EmpresaId') IS NULL
    ALTER TABLE dbo.Silos ADD EmpresaId INT NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'Codigo') IS NULL
    ALTER TABLE dbo.Silos ADD Codigo NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'EstadoOperativo') IS NULL
    ALTER TABLE dbo.Silos ADD EstadoOperativo NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Silos_EstadoOperativo DEFAULT (N'Vacio');
GO
IF COL_LENGTH(N'dbo.Silos', N'Latitud') IS NULL
    ALTER TABLE dbo.Silos ADD Latitud DECIMAL(9,6) NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'Longitud') IS NULL
    ALTER TABLE dbo.Silos ADD Longitud DECIMAL(9,6) NULL;
GO
-- Chapa
IF COL_LENGTH(N'dbo.Silos', N'DiametroM') IS NULL
    ALTER TABLE dbo.Silos ADD DiametroM DECIMAL(8,2) NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'AlturaM') IS NULL
    ALTER TABLE dbo.Silos ADD AlturaM DECIMAL(8,2) NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'TieneAireacion') IS NULL
    ALTER TABLE dbo.Silos ADD TieneAireacion BIT NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'TieneTermometria') IS NULL
    ALTER TABLE dbo.Silos ADD TieneTermometria BIT NULL;
GO
-- Bolson
IF COL_LENGTH(N'dbo.Silos', N'LargoM') IS NULL
    ALTER TABLE dbo.Silos ADD LargoM DECIMAL(8,2) NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'DiametroBolsonPies') IS NULL
    ALTER TABLE dbo.Silos ADD DiametroBolsonPies DECIMAL(5,2) NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'FechaEmbolsado') IS NULL
    ALTER TABLE dbo.Silos ADD FechaEmbolsado DATE NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'FechaVencimientoEstimada') IS NULL
    ALTER TABLE dbo.Silos ADD FechaVencimientoEstimada DATE NULL;
GO
IF COL_LENGTH(N'dbo.Silos', N'IdentificacionEnLote') IS NULL
    ALTER TABLE dbo.Silos ADD IdentificacionEnLote NVARCHAR(120) NULL;
GO

/* =========================================================================
   2. Silos: migracion de datos existentes
   ========================================================================= */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

    -- 2.1 Empresa: se toma del lote donde esta el silo.
    UPDATE s
    SET s.EmpresaId = l.EmpresaId,
        s.FechaModificacion = SYSDATETIME()
    FROM dbo.Silos AS s
    INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
    WHERE s.EmpresaId IS NULL
      AND l.EmpresaId IS NOT NULL;

    -- 2.2 Silos sin lote (plantas de acopio): solo se asignan si existe una
    --     unica empresa activa. Si hay varias, quedan en NULL y se listan en
    --     el reporte final para asignarlos a mano.
    DECLARE @EmpresasActivas INT = (SELECT COUNT(1) FROM dbo.Empresas WHERE Activo = 1);
    IF @EmpresasActivas = 1
    BEGIN
        UPDATE dbo.Silos
        SET EmpresaId = (SELECT TOP (1) EmpresaId FROM dbo.Empresas WHERE Activo = 1),
            FechaModificacion = SYSDATETIME()
        WHERE EmpresaId IS NULL;
    END;

    -- 2.3 Codigo SILO - #### numerado por empresa, en orden de alta.
    ;WITH Numerados AS
    (
        SELECT s.SiloId,
               ROW_NUMBER() OVER (PARTITION BY s.EmpresaId ORDER BY s.SiloId) AS Nro
        FROM dbo.Silos AS s
        WHERE s.EmpresaId IS NOT NULL
    )
    UPDATE s
    SET s.Codigo = CONCAT(N'SILO - ', RIGHT(CONCAT(N'0000', n.Nro), 4))
    FROM dbo.Silos AS s
    INNER JOIN Numerados AS n ON n.SiloId = s.SiloId
    WHERE s.Codigo IS NULL
      -- Solo si la empresa todavia no tiene ningun codigo asignado, para no
      -- renumerar silos ya codificados en una ejecucion anterior.
      AND NOT EXISTS (SELECT 1 FROM dbo.Silos AS x WHERE x.EmpresaId = s.EmpresaId AND x.Codigo IS NOT NULL);

    -- 2.4 Estado operativo inicial.
    UPDATE dbo.Silos
    SET EstadoOperativo = CASE
            WHEN Activo = 0 THEN N'Dado de baja'
            WHEN CantidadGranoAlmacenado > 0 THEN N'Con grano'
            ELSE N'Vacio'
        END
    WHERE EstadoOperativo NOT IN (N'En mantenimiento');

COMMIT TRANSACTION;
GO

/* =========================================================================
   3. Silos: restricciones e indices
   ========================================================================= */

IF OBJECT_ID(N'dbo.FK_Silos_Empresas', N'F') IS NULL
    ALTER TABLE dbo.Silos ADD CONSTRAINT FK_Silos_Empresas
        FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId);
GO
IF OBJECT_ID(N'dbo.CK_Silos_EstadoOperativo', N'C') IS NULL
    ALTER TABLE dbo.Silos ADD CONSTRAINT CK_Silos_EstadoOperativo
        CHECK (EstadoOperativo IN (N'Vacio', N'Con grano', N'En mantenimiento', N'Dado de baja'));
GO
IF OBJECT_ID(N'dbo.CK_Silos_Dimensiones', N'C') IS NULL
    ALTER TABLE dbo.Silos ADD CONSTRAINT CK_Silos_Dimensiones
        CHECK ((DiametroM IS NULL OR DiametroM > 0)
           AND (AlturaM IS NULL OR AlturaM > 0)
           AND (LargoM IS NULL OR LargoM > 0)
           AND (DiametroBolsonPies IS NULL OR DiametroBolsonPies > 0));
GO
IF OBJECT_ID(N'dbo.CK_Silos_Vencimiento', N'C') IS NULL
    ALTER TABLE dbo.Silos ADD CONSTRAINT CK_Silos_Vencimiento
        CHECK (FechaVencimientoEstimada IS NULL OR FechaEmbolsado IS NULL
               OR FechaVencimientoEstimada >= FechaEmbolsado);
GO
IF OBJECT_ID(N'dbo.CK_Silos_Coordenadas', N'C') IS NULL
    ALTER TABLE dbo.Silos ADD CONSTRAINT CK_Silos_Coordenadas
        CHECK ((Latitud IS NULL AND Longitud IS NULL)
            OR (Latitud BETWEEN -90 AND 90 AND Longitud BETWEEN -180 AND 180));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Silos_Empresa_Codigo' AND object_id = OBJECT_ID(N'dbo.Silos'))
    CREATE UNIQUE INDEX UX_Silos_Empresa_Codigo
    ON dbo.Silos (EmpresaId, Codigo)
    WHERE EmpresaId IS NOT NULL AND Codigo IS NOT NULL;
GO

-- Nombre unico por empresa: solo se crea si hoy no hay duplicados. Si los hay,
-- aparecen en el reporte final para renombrarlos y volver a ejecutar.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Silos_Empresa_Nombre' AND object_id = OBJECT_ID(N'dbo.Silos'))
AND NOT EXISTS (
    SELECT 1 FROM dbo.Silos
    WHERE EmpresaId IS NOT NULL
    GROUP BY EmpresaId, Nombre
    HAVING COUNT(1) > 1
)
    CREATE UNIQUE INDEX UX_Silos_Empresa_Nombre
    ON dbo.Silos (EmpresaId, Nombre)
    WHERE EmpresaId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Silos_Empresa_Estado' AND object_id = OBJECT_ID(N'dbo.Silos'))
    CREATE INDEX IX_Silos_Empresa_Estado ON dbo.Silos (EmpresaId, EstadoOperativo);
GO

/* =========================================================================
   4. Almacenamientos: columnas nuevas y CHECK ampliados
   ========================================================================= */

IF COL_LENGTH(N'dbo.Almacenamientos', N'EmpresaId') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD EmpresaId INT NULL;
GO
IF COL_LENGTH(N'dbo.Almacenamientos', N'CosechaId') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CosechaId INT NULL;
GO
IF COL_LENGTH(N'dbo.Almacenamientos', N'CampaniaId') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CampaniaId INT NULL;
GO
IF COL_LENGTH(N'dbo.Almacenamientos', N'Producto') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD Producto NVARCHAR(80) NULL;  -- normalmente ya la crea 20_almacenamiento_producto
GO
IF COL_LENGTH(N'dbo.Almacenamientos', N'HumedadIngreso') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD HumedadIngreso DECIMAL(5,2) NULL;
GO
IF COL_LENGTH(N'dbo.Almacenamientos', N'Impurezas') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD Impurezas DECIMAL(5,2) NULL;
GO
IF COL_LENGTH(N'dbo.Almacenamientos', N'Motivo') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD Motivo NVARCHAR(40) NULL;
GO
-- Egreso + Ingreso de una misma transferencia comparten este identificador.
IF COL_LENGTH(N'dbo.Almacenamientos', N'TransferenciaId') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD TransferenciaId UNIQUEIDENTIFIER NULL;
GO

/*
    Ajustes: se modelan como dos tipos (AjustePositivo / AjusteNegativo) en vez
    de una columna de signo aparte. Asi Cantidad sigue siendo siempre > 0, la API
    actual no necesita enviar ningun campo nuevo y el signo se deriva solo.
*/
IF COL_LENGTH(N'dbo.Almacenamientos', N'Sentido') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD Sentido AS (
        CAST(CASE WHEN TipoMovimiento IN (N'Ingreso', N'AjustePositivo') THEN 1 ELSE -1 END AS SMALLINT)
    ) PERSISTED;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Almacenamientos_TipoMovimiento'
      AND definition NOT LIKE N'%AjusteNegativo%'
)
    ALTER TABLE dbo.Almacenamientos DROP CONSTRAINT CK_Almacenamientos_TipoMovimiento;
GO
IF OBJECT_ID(N'dbo.CK_Almacenamientos_TipoMovimiento', N'C') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT CK_Almacenamientos_TipoMovimiento
        CHECK (TipoMovimiento IN (N'Ingreso', N'Egreso', N'AjustePositivo', N'AjusteNegativo'));
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Almacenamientos_Origen'
      AND definition NOT LIKE N'%Transferencia%'
)
    ALTER TABLE dbo.Almacenamientos DROP CONSTRAINT CK_Almacenamientos_Origen;
GO
IF OBJECT_ID(N'dbo.CK_Almacenamientos_Origen', N'C') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT CK_Almacenamientos_Origen
        CHECK (Origen IN (N'Manual', N'AltaSilo', N'Distribucion', N'Transferencia'));
GO

IF OBJECT_ID(N'dbo.CK_Almacenamientos_Motivo', N'C') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT CK_Almacenamientos_Motivo
        CHECK (Motivo IS NULL OR Motivo IN (
            N'Semilla propia', N'Consumo interno', N'Deterioro',          -- Egreso manual
            N'Merma por secado', N'Diferencia de medicion'               -- Ajustes
        ));
GO
IF OBJECT_ID(N'dbo.CK_Almacenamientos_Calidad', N'C') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT CK_Almacenamientos_Calidad
        CHECK ((HumedadIngreso IS NULL OR HumedadIngreso BETWEEN 0 AND 100)
           AND (Impurezas IS NULL OR Impurezas BETWEEN 0 AND 100));
GO
-- Una transferencia siempre tiene Origen = Transferencia, y viceversa.
IF OBJECT_ID(N'dbo.CK_Almacenamientos_Transferencia', N'C') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT CK_Almacenamientos_Transferencia
        CHECK ((Origen = N'Transferencia' AND TransferenciaId IS NOT NULL AND TipoMovimiento IN (N'Ingreso', N'Egreso'))
            OR (Origen <> N'Transferencia' AND TransferenciaId IS NULL));
GO

IF OBJECT_ID(N'dbo.FK_Almacenamientos_Empresas', N'F') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT FK_Almacenamientos_Empresas
        FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId);
GO
IF OBJECT_ID(N'dbo.FK_Almacenamientos_Cosechas', N'F') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT FK_Almacenamientos_Cosechas
        FOREIGN KEY (CosechaId) REFERENCES dbo.Cosechas (CosechaId);
GO
IF OBJECT_ID(N'dbo.FK_Almacenamientos_Campanias', N'F') IS NULL
    ALTER TABLE dbo.Almacenamientos ADD CONSTRAINT FK_Almacenamientos_Campanias
        FOREIGN KEY (CampaniaId) REFERENCES dbo.Campanias (CampaniaId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Almacenamientos_Empresa_Fecha' AND object_id = OBJECT_ID(N'dbo.Almacenamientos'))
    CREATE INDEX IX_Almacenamientos_Empresa_Fecha ON dbo.Almacenamientos (EmpresaId, Fecha DESC, AlmacenamientoId DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Almacenamientos_CosechaId' AND object_id = OBJECT_ID(N'dbo.Almacenamientos'))
    CREATE INDEX IX_Almacenamientos_CosechaId ON dbo.Almacenamientos (CosechaId) WHERE CosechaId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Almacenamientos_TransferenciaId' AND object_id = OBJECT_ID(N'dbo.Almacenamientos'))
    CREATE INDEX IX_Almacenamientos_TransferenciaId ON dbo.Almacenamientos (TransferenciaId) WHERE TransferenciaId IS NOT NULL;
GO

/* =========================================================================
   5. Almacenamientos: migracion de datos existentes
   ========================================================================= */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

    -- 5.1 Empresa: la del silo.
    UPDATE a
    SET a.EmpresaId = s.EmpresaId
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
    WHERE a.EmpresaId IS NULL
      AND s.EmpresaId IS NOT NULL;

    -- 5.2 Cosecha: se resuelve el texto libre contra Cosechas.Nombre
    --     ("COS - 0001", ignorando espacios y mayusculas). Solo se asigna
    --     cuando hay una unica coincidencia.
    ;WITH Coincidencias AS
    (
        SELECT a.AlmacenamientoId,
               c.CosechaId,
               COUNT(1) OVER (PARTITION BY a.AlmacenamientoId) AS Cantidad
        FROM dbo.Almacenamientos AS a
        INNER JOIN dbo.Cosechas AS c
            ON REPLACE(UPPER(LTRIM(RTRIM(c.Nombre))), N' ', N'') = REPLACE(UPPER(LTRIM(RTRIM(a.Cosecha))), N' ', N'')
        WHERE a.CosechaId IS NULL
          AND a.Cosecha IS NOT NULL
          AND LTRIM(RTRIM(a.Cosecha)) <> N''
    )
    UPDATE a
    SET a.CosechaId = x.CosechaId
    FROM dbo.Almacenamientos AS a
    INNER JOIN Coincidencias AS x ON x.AlmacenamientoId = a.AlmacenamientoId
    WHERE x.Cantidad = 1;

    -- 5.3 Campania: primero desde la cosecha vinculada (Cosechas.CampaniaNombre),
    --     si no, desde el texto libre de Almacenamientos.Campania.
    UPDATE a
    SET a.CampaniaId = cp.CampaniaId
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Cosechas AS c ON c.CosechaId = a.CosechaId
    INNER JOIN dbo.Campanias AS cp ON cp.Nombre = c.CampaniaNombre
    WHERE a.CampaniaId IS NULL;

    UPDATE a
    SET a.CampaniaId = cp.CampaniaId
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Campanias AS cp ON cp.Nombre = LTRIM(RTRIM(a.Campania))
    WHERE a.CampaniaId IS NULL
      AND a.Campania IS NOT NULL;

    -- 5.4 Grano del movimiento: el de la cosecha, o el del silo.
    UPDATE a
    SET a.Producto = COALESCE(c.Producto, s.Producto)
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
    LEFT JOIN dbo.Cosechas AS c ON c.CosechaId = a.CosechaId
    WHERE a.Producto IS NULL;

COMMIT TRANSACTION;
GO

/* =========================================================================
   6. Partidas FIFO
   -------------------------------------------------------------------------
   Cada Ingreso abre una partida. Los egresos (y ajustes negativos) consumen
   primero la partida mas antigua; cada consumo queda registrado en
   AlmacenamientoPartidaConsumos. Una transferencia crea en el silo destino
   una partida nueva que conserva FechaIngreso, cosecha y campania de la
   partida original (PartidaOrigenId), para que la antiguedad no se reinicie.
   ========================================================================= */

IF OBJECT_ID(N'dbo.AlmacenamientoPartidas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlmacenamientoPartidas
    (
        PartidaId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NULL,
        SiloId INT NOT NULL,
        IngresoAlmacenamientoId INT NULL,   -- NULL solo en partidas iniciales migradas
        PartidaOrigenId INT NULL,           -- partida de la que proviene por transferencia
        CosechaId INT NULL,
        CampaniaId INT NULL,
        Producto NVARCHAR(80) NULL,         -- mismo largo que Almacenamientos.Producto
        FechaIngreso DATE NOT NULL,         -- fecha del ingreso ORIGINAL del grano
        KgIniciales DECIMAL(18,4) NOT NULL,
        KgRestantes DECIMAL(18,4) NOT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_AlmacenamientoPartidas_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_AlmacenamientoPartidas PRIMARY KEY CLUSTERED (PartidaId),
        CONSTRAINT FK_AlmacenamientoPartidas_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_AlmacenamientoPartidas_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT FK_AlmacenamientoPartidas_Ingreso FOREIGN KEY (IngresoAlmacenamientoId) REFERENCES dbo.Almacenamientos (AlmacenamientoId),
        CONSTRAINT FK_AlmacenamientoPartidas_Origen FOREIGN KEY (PartidaOrigenId) REFERENCES dbo.AlmacenamientoPartidas (PartidaId),
        CONSTRAINT FK_AlmacenamientoPartidas_Cosechas FOREIGN KEY (CosechaId) REFERENCES dbo.Cosechas (CosechaId),
        CONSTRAINT FK_AlmacenamientoPartidas_Campanias FOREIGN KEY (CampaniaId) REFERENCES dbo.Campanias (CampaniaId),
        CONSTRAINT CK_AlmacenamientoPartidas_Kg CHECK (KgIniciales > 0 AND KgRestantes >= 0 AND KgRestantes <= KgIniciales)
    );
END;
GO

-- Consulta mas frecuente: partidas con saldo de un silo, de la mas vieja a la mas nueva.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AlmacenamientoPartidas_Silo_Fifo' AND object_id = OBJECT_ID(N'dbo.AlmacenamientoPartidas'))
    CREATE INDEX IX_AlmacenamientoPartidas_Silo_Fifo
    ON dbo.AlmacenamientoPartidas (SiloId, FechaIngreso, PartidaId)
    INCLUDE (KgRestantes)
    WHERE KgRestantes > 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AlmacenamientoPartidas_Ingreso' AND object_id = OBJECT_ID(N'dbo.AlmacenamientoPartidas'))
    CREATE UNIQUE INDEX UX_AlmacenamientoPartidas_Ingreso
    ON dbo.AlmacenamientoPartidas (IngresoAlmacenamientoId)
    WHERE IngresoAlmacenamientoId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.AlmacenamientoPartidaConsumos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlmacenamientoPartidaConsumos
    (
        PartidaConsumoId INT IDENTITY(1,1) NOT NULL,
        PartidaId INT NOT NULL,
        AlmacenamientoId INT NOT NULL,      -- Egreso o AjusteNegativo que consumio
        Kg DECIMAL(18,4) NOT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_AlmacenamientoPartidaConsumos_FechaCreacion DEFAULT (SYSDATETIME()),

        CONSTRAINT PK_AlmacenamientoPartidaConsumos PRIMARY KEY CLUSTERED (PartidaConsumoId),
        CONSTRAINT FK_AlmacenamientoPartidaConsumos_Partidas FOREIGN KEY (PartidaId) REFERENCES dbo.AlmacenamientoPartidas (PartidaId),
        CONSTRAINT FK_AlmacenamientoPartidaConsumos_Movimiento FOREIGN KEY (AlmacenamientoId) REFERENCES dbo.Almacenamientos (AlmacenamientoId),
        CONSTRAINT UQ_AlmacenamientoPartidaConsumos UNIQUE (PartidaId, AlmacenamientoId),
        CONSTRAINT CK_AlmacenamientoPartidaConsumos_Kg CHECK (Kg > 0)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AlmacenamientoPartidaConsumos_Movimiento' AND object_id = OBJECT_ID(N'dbo.AlmacenamientoPartidaConsumos'))
    CREATE INDEX IX_AlmacenamientoPartidaConsumos_Movimiento ON dbo.AlmacenamientoPartidaConsumos (AlmacenamientoId);
GO

/*
    6.1 Migracion de partidas (solo si la tabla esta vacia).

    Con FIFO, el stock que queda en un silo corresponde siempre a sus ingresos
    MAS RECIENTES. Por eso alcanza con recorrer los ingresos del mas nuevo al
    mas viejo y asignarles kg restantes hasta cubrir el stock actual del silo
    (Silos.CantidadGranoAlmacenado). Los ingresos mas viejos quedan en 0.

    Si el stock supera la suma de ingresos registrados (grano cargado antes de
    que existiera el ingreso automatico de alta), la diferencia se registra
    como una partida inicial con la fecha de alta del silo.
*/
IF NOT EXISTS (SELECT 1 FROM dbo.AlmacenamientoPartidas)
BEGIN
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    ;WITH Ingresos AS
    (
        SELECT a.AlmacenamientoId,
               a.SiloId,
               a.EmpresaId,
               a.CosechaId,
               a.CampaniaId,
               a.Producto,
               a.Fecha,
               a.Cantidad,
               s.CantidadGranoAlmacenado AS StockSilo,
               SUM(a.Cantidad) OVER (
                   PARTITION BY a.SiloId
                   ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC
                   ROWS UNBOUNDED PRECEDING
               ) AS Acumulado
        FROM dbo.Almacenamientos AS a
        INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
        WHERE a.TipoMovimiento = N'Ingreso'
    )
    INSERT INTO dbo.AlmacenamientoPartidas
        (EmpresaId, SiloId, IngresoAlmacenamientoId, CosechaId, CampaniaId, Producto, FechaIngreso, KgIniciales, KgRestantes)
    SELECT i.EmpresaId, i.SiloId, i.AlmacenamientoId, i.CosechaId, i.CampaniaId, i.Producto, i.Fecha, i.Cantidad,
           CASE
               WHEN i.Acumulado <= i.StockSilo THEN i.Cantidad
               WHEN i.Acumulado - i.Cantidad < i.StockSilo THEN i.StockSilo - (i.Acumulado - i.Cantidad)
               ELSE 0
           END
    FROM Ingresos AS i;

    INSERT INTO dbo.AlmacenamientoPartidas
        (EmpresaId, SiloId, IngresoAlmacenamientoId, Producto, FechaIngreso, KgIniciales, KgRestantes)
    SELECT s.EmpresaId, s.SiloId, NULL, s.Producto, CAST(s.FechaCreacion AS DATE),
           s.CantidadGranoAlmacenado - ISNULL(t.TotalIngresos, 0),
           s.CantidadGranoAlmacenado - ISNULL(t.TotalIngresos, 0)
    FROM dbo.Silos AS s
    LEFT JOIN (
        SELECT SiloId, SUM(Cantidad) AS TotalIngresos
        FROM dbo.Almacenamientos
        WHERE TipoMovimiento = N'Ingreso'
        GROUP BY SiloId
    ) AS t ON t.SiloId = s.SiloId
    WHERE s.CantidadGranoAlmacenado > ISNULL(t.TotalIngresos, 0);

    COMMIT TRANSACTION;
END;
GO

/* =========================================================================
   7. Documentacion por movimiento (tickets de balanza, comprobantes)
   ========================================================================= */

IF OBJECT_ID(N'dbo.AlmacenamientoDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlmacenamientoDocumentos
    (
        AlmacenamientoDocumentoId INT IDENTITY(1,1) NOT NULL,
        AlmacenamientoId INT NOT NULL,
        NombreArchivo NVARCHAR(260) NOT NULL,
        RutaArchivo NVARCHAR(500) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_AlmacenamientoDocumentos_FechaCarga DEFAULT (SYSDATETIME()),
        CargadoPorUsuarioId INT NULL,

        CONSTRAINT PK_AlmacenamientoDocumentos PRIMARY KEY CLUSTERED (AlmacenamientoDocumentoId),
        CONSTRAINT FK_AlmacenamientoDocumentos_Movimiento FOREIGN KEY (AlmacenamientoId) REFERENCES dbo.Almacenamientos (AlmacenamientoId),
        CONSTRAINT FK_AlmacenamientoDocumentos_Usuarios FOREIGN KEY (CargadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AlmacenamientoDocumentos_Movimiento' AND object_id = OBJECT_ID(N'dbo.AlmacenamientoDocumentos'))
    CREATE INDEX IX_AlmacenamientoDocumentos_Movimiento ON dbo.AlmacenamientoDocumentos (AlmacenamientoId);
GO

/* =========================================================================
   8. Control de silo: resultado calculado y proximo control
   ========================================================================= */

IF COL_LENGTH(N'dbo.SiloControles', N'Resultado') IS NULL
    ALTER TABLE dbo.SiloControles ADD Resultado NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.SiloControles', N'FechaProximoControl') IS NULL
    ALTER TABLE dbo.SiloControles ADD FechaProximoControl DATE NULL;
GO
IF OBJECT_ID(N'dbo.CK_SiloControles_Resultado', N'C') IS NULL
    ALTER TABLE dbo.SiloControles ADD CONSTRAINT CK_SiloControles_Resultado
        CHECK (Resultado IS NULL OR Resultado IN (N'Normal', N'Atencion', N'Critico'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiloControles_Silo_Fecha' AND object_id = OBJECT_ID(N'dbo.SiloControles'))
    CREATE INDEX IX_SiloControles_Silo_Fecha ON dbo.SiloControles (SiloId, Fecha DESC);
GO

/* =========================================================================
   9. Parametros por grano
   -------------------------------------------------------------------------
   Dos tablas porque tienen origen y alcance distintos:
     - GranoBasesComercializacion: valor normativo, global, precargado.
     - GranoParametrosAlmacenamiento: criterio agronomico de cada empresa,
       por grano y tipo de silo. No se precarga: lo define el ingeniero.
   ========================================================================= */

IF OBJECT_ID(N'dbo.GranoBasesComercializacion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GranoBasesComercializacion
    (
        Producto NVARCHAR(60) NOT NULL,
        HumedadBase DECIMAL(5,2) NOT NULL,
        FuenteNormativa NVARCHAR(200) NOT NULL,
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_GranoBasesComercializacion PRIMARY KEY CLUSTERED (Producto),
        CONSTRAINT CK_GranoBasesComercializacion_Humedad CHECK (HumedadBase > 0 AND HumedadBase < 100)
    );
END;
GO

INSERT INTO dbo.GranoBasesComercializacion (Producto, HumedadBase, FuenteNormativa)
SELECT f.Producto, f.HumedadBase, f.FuenteNormativa
FROM (VALUES
    (N'Soja',    CAST(13.50 AS DECIMAL(5,2)), N'Res. SAGyP 1075/94, Norma XVII, sustituida por Res. 205/95'),
    (N'Maiz',    CAST(14.50 AS DECIMAL(5,2)), N'Res. SAGyP 1075/94, Norma de calidad para la comercializacion de maiz'),
    (N'Trigo',   CAST(14.00 AS DECIMAL(5,2)), N'Res. SAGyP 1075/94, Norma de calidad para la comercializacion de trigo pan'),
    (N'Girasol', CAST(11.00 AS DECIMAL(5,2)), N'Res. SAGyP 1075/94, Norma de calidad para la comercializacion de girasol')
) AS f(Producto, HumedadBase, FuenteNormativa)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GranoBasesComercializacion AS d WHERE d.Producto = f.Producto);
GO

IF OBJECT_ID(N'dbo.GranoParametrosAlmacenamiento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GranoParametrosAlmacenamiento
    (
        GranoParametroAlmacenamientoId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        Producto NVARCHAR(60) NOT NULL,
        TipoSilo NVARCHAR(20) NOT NULL,
        UmbralHumedad DECIMAL(5,2) NOT NULL,
        MargenTemperaturaC DECIMAL(5,2) NOT NULL,
        FrecuenciaControlDias SMALLINT NOT NULL,
        ModificadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_GranoParametrosAlmacenamiento_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_GranoParametrosAlmacenamiento PRIMARY KEY CLUSTERED (GranoParametroAlmacenamientoId),
        CONSTRAINT UQ_GranoParametrosAlmacenamiento UNIQUE (EmpresaId, Producto, TipoSilo),
        CONSTRAINT FK_GranoParametrosAlmacenamiento_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_GranoParametrosAlmacenamiento_Usuarios FOREIGN KEY (ModificadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_GranoParametrosAlmacenamiento_TipoSilo CHECK (TipoSilo IN (N'Chapa', N'Bolson')),
        CONSTRAINT CK_GranoParametrosAlmacenamiento_Valores CHECK (
            UmbralHumedad > 0 AND UmbralHumedad < 100
            AND MargenTemperaturaC > 0
            AND FrecuenciaControlDias BETWEEN 1 AND 365
        )
    );
END;
GO

/* =========================================================================
   10. Reporte de verificacion (no modifica datos)
   ========================================================================= */

-- Silos sin empresa: asignar EmpresaId a mano.
SELECT N'Silo sin empresa' AS Revisar, SiloId, Nombre, LoteId, Pais, Provincia, Ciudad
FROM dbo.Silos
WHERE EmpresaId IS NULL;

-- Nombres duplicados dentro de una empresa (bloquean UX_Silos_Empresa_Nombre).
SELECT N'Nombre de silo duplicado' AS Revisar, EmpresaId, Nombre, COUNT(1) AS Cantidad
FROM dbo.Silos
WHERE EmpresaId IS NOT NULL
GROUP BY EmpresaId, Nombre
HAVING COUNT(1) > 1;

-- Texto de cosecha que no pudo vincularse.
SELECT N'Cosecha sin vincular' AS Revisar, AlmacenamientoId, SiloId, Fecha, Cosecha, Campania
FROM dbo.Almacenamientos
WHERE CosechaId IS NULL
  AND Cosecha IS NOT NULL
  AND LTRIM(RTRIM(Cosecha)) <> N'';

-- Un grano por silo: silos cuyas partidas con saldo tienen mas de un grano
-- (posible antes de esta regla, porque Producto del movimiento era texto libre).
SELECT N'Silo con granos mezclados' AS Revisar, p.SiloId, s.Nombre,
       COUNT(DISTINCT UPPER(LTRIM(RTRIM(p.Producto)))) AS GranosDistintos
FROM dbo.AlmacenamientoPartidas AS p
INNER JOIN dbo.Silos AS s ON s.SiloId = p.SiloId
WHERE p.KgRestantes > 0 AND p.Producto IS NOT NULL
GROUP BY p.SiloId, s.Nombre
HAVING COUNT(DISTINCT UPPER(LTRIM(RTRIM(p.Producto)))) > 1;

-- Grano del movimiento distinto del de su cosecha vinculada.
SELECT N'Producto distinto de la cosecha' AS Revisar, a.AlmacenamientoId, a.Producto, c.Nombre AS Cosecha, c.Producto AS ProductoCosecha
FROM dbo.Almacenamientos AS a
INNER JOIN dbo.Cosechas AS c ON c.CosechaId = a.CosechaId
WHERE a.Producto IS NOT NULL
  AND UPPER(LTRIM(RTRIM(a.Producto))) <> UPPER(LTRIM(RTRIM(c.Producto)));

-- Stock del silo distinto del ultimo stock resultante registrado.
;WITH Ultimo AS
(
    SELECT SiloId, StockResultante,
           ROW_NUMBER() OVER (PARTITION BY SiloId ORDER BY Fecha DESC, AlmacenamientoId DESC) AS Orden
    FROM dbo.Almacenamientos
)
SELECT N'Stock desfasado' AS Revisar, s.SiloId, s.Nombre,
       s.CantidadGranoAlmacenado AS StockSilo, u.StockResultante AS UltimoStockMovimientos
FROM dbo.Silos AS s
INNER JOIN Ultimo AS u ON u.SiloId = s.SiloId AND u.Orden = 1
WHERE u.StockResultante <> s.CantidadGranoAlmacenado;

-- Partidas: su saldo debe coincidir con el stock de cada silo.
SELECT N'Partidas no cuadran' AS Revisar, s.SiloId, s.Nombre,
       s.CantidadGranoAlmacenado AS StockSilo, ISNULL(p.KgRestantes, 0) AS KgEnPartidas
FROM dbo.Silos AS s
LEFT JOIN (
    SELECT SiloId, SUM(KgRestantes) AS KgRestantes
    FROM dbo.AlmacenamientoPartidas
    GROUP BY SiloId
) AS p ON p.SiloId = s.SiloId
WHERE ISNULL(p.KgRestantes, 0) <> s.CantidadGranoAlmacenado;
GO
