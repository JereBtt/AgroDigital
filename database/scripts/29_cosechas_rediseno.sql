/*
    AgroDigital - Rediseño del modulo Cosechas
    Motor objetivo: Microsoft SQL Server 2019

    Que agrega este script:

      1. dbo.Cosechas
         - EmpresaId (relacional, completado desde el Lote) para aislar por empresa.
         - HectareasHora: productividad informada al finalizar (igual que Siembras).
         - EstadoControl: estado del control de perdidas (Tirada de Aros), separado
           del estado de la cosecha, como el seguimiento en Siembras:
             Sin controles -> En curso (primera tirada) -> Finalizado (Finalizar control).
         - Maquinaria: TipoServicio (Propia / Contratada), Contratista, Cosechadora,
           AnchoCabezalM.
         - HumedadBaseAplicada y RindeSecoKgHa: foto del calculo de rinde seco
           al finalizar (la humedad base sale de dbo.GranoBasesComercializacion).
         - Indice unico filtrado: una sola cosecha por siembra.

      2. dbo.GranoToleranciasCosecha (global, solo lectura)
         Tolerancias de perdida por cosechadora de referencia INTA PRECOP y
         PMG de referencia (equivalencia de granos cada 10 g). Mismo criterio que
         dbo.GranoBasesComercializacion.

      3. dbo.GranoParametrosCosecha (por empresa, opcional)
         Permite que cada empresa ajuste la tolerancia y el factor de severidad.
         Si no hay fila para la empresa, se usa la referencia global.
         Severidad: Baja <= Tolerancia; Media <= Tolerancia * FactorAlta; Alta > eso.

      4. dbo.CosechaTiradaAros
         - GranosPrecosecha y PerdidaPrecosechaKgHa: el metodo PRECOP descuenta
           los granos que ya estaban en el suelo antes del paso de la maquina.
         - ToleranciaAplicadaKgHa y FactorAltaAplicado: foto de los parametros con
           los que se clasifico cada tirada (cambiar parametros no reclasifica el
           historial, igual que la conciliacion de Distribucion).
         - PmgOrigen: de donde salio el PMG (Siembra, Referencia o Manual).

      5. dbo.CosechaPartes
         Partes diarios de avance: hectareas, kg, humedad y destino del grano.
         Si el destino es un silo, el ingreso en Almacenamiento lo genera la API
         y queda vinculado en AlmacenamientoId (Origen = N'Cosecha').

      6. dbo.vw_CosechasAvance
         Acumulados de partes por cosecha para la consulta y el modal de cierre.

    Datos existentes:
      - EmpresaId se completa desde dbo.Lotes.
      - EstadoControl se deriva de las tiradas ya cargadas.
      - Las tiradas existentes conservan su severidad; sus columnas de foto
        quedan en NULL (se clasificaron con los umbrales fijos anteriores).
      - Si hay mas de una cosecha para la misma siembra, el indice unico NO se
        crea y el script lista los casos para corregirlos a mano.

    Ejecucion: despues de 28_permisos_autor_seguimientos.sql.
    Requiere 09_cosechas.sql, 21_silos_almacenamiento_rediseno.sql y Empresas.
    Es idempotente: puede ejecutarse mas de una vez.
*/

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_PADDING ON;
GO

/* =========================================================================
   1. dbo.Cosechas
   ========================================================================= */

IF COL_LENGTH(N'dbo.Cosechas', N'EmpresaId') IS NULL
    ALTER TABLE dbo.Cosechas ADD EmpresaId INT NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'HectareasHora') IS NULL
    ALTER TABLE dbo.Cosechas ADD HectareasHora DECIMAL(10,2) NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'EstadoControl') IS NULL
    ALTER TABLE dbo.Cosechas ADD EstadoControl NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Cosechas_EstadoControl DEFAULT (N'Sin controles');
GO
IF COL_LENGTH(N'dbo.Cosechas', N'TipoServicio') IS NULL
    ALTER TABLE dbo.Cosechas ADD TipoServicio NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'Contratista') IS NULL
    ALTER TABLE dbo.Cosechas ADD Contratista NVARCHAR(150) NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'Cosechadora') IS NULL
    ALTER TABLE dbo.Cosechas ADD Cosechadora NVARCHAR(150) NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'AnchoCabezalM') IS NULL
    ALTER TABLE dbo.Cosechas ADD AnchoCabezalM DECIMAL(5,2) NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'HumedadBaseAplicada') IS NULL
    ALTER TABLE dbo.Cosechas ADD HumedadBaseAplicada DECIMAL(5,2) NULL;
GO
IF COL_LENGTH(N'dbo.Cosechas', N'RindeSecoKgHa') IS NULL
    ALTER TABLE dbo.Cosechas ADD RindeSecoKgHa DECIMAL(18,4) NULL;
GO

-- EmpresaId desde el lote
UPDATE c
SET EmpresaId = l.EmpresaId
FROM dbo.Cosechas AS c
INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
WHERE c.EmpresaId IS NULL
  AND l.EmpresaId IS NOT NULL;
GO

-- EstadoControl a partir de las tiradas existentes
UPDATE c
SET EstadoControl = CASE WHEN c.Estado = N'Finalizado' THEN N'Finalizado' ELSE N'En curso' END
FROM dbo.Cosechas AS c
WHERE c.EstadoControl = N'Sin controles'
  AND EXISTS (SELECT 1 FROM dbo.CosechaTiradaAros AS t WHERE t.CosechaId = c.CosechaId);
GO

IF OBJECT_ID(N'dbo.FK_Cosechas_Empresas', N'F') IS NULL
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT FK_Cosechas_Empresas
        FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId);
GO
IF OBJECT_ID(N'dbo.CK_Cosechas_EstadoControl', N'C') IS NULL
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_EstadoControl
        CHECK (EstadoControl IN (N'Sin controles', N'En curso', N'Finalizado'));
GO
IF OBJECT_ID(N'dbo.CK_Cosechas_HectareasHora', N'C') IS NULL
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_HectareasHora
        CHECK (HectareasHora IS NULL OR HectareasHora > 0);
GO
IF OBJECT_ID(N'dbo.CK_Cosechas_TipoServicio', N'C') IS NULL
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_TipoServicio
        CHECK (TipoServicio IS NULL OR TipoServicio IN (N'Propia', N'Contratada'));
GO
IF OBJECT_ID(N'dbo.CK_Cosechas_AnchoCabezal', N'C') IS NULL
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_AnchoCabezal
        CHECK (AnchoCabezalM IS NULL OR AnchoCabezalM > 0);
GO
IF OBJECT_ID(N'dbo.CK_Cosechas_RindeSeco', N'C') IS NULL
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_RindeSeco
        CHECK ((RindeSecoKgHa IS NULL OR RindeSecoKgHa > 0)
           AND (HumedadBaseAplicada IS NULL OR (HumedadBaseAplicada > 0 AND HumedadBaseAplicada < 100)));
GO
-- La fecha real solo puede existir en una cosecha finalizada
IF OBJECT_ID(N'dbo.CK_Cosechas_FechaFinRealSoloFinalizada', N'C') IS NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.Cosechas WHERE FechaFinReal IS NOT NULL AND Estado <> N'Finalizado')
    ALTER TABLE dbo.Cosechas WITH CHECK ADD CONSTRAINT CK_Cosechas_FechaFinRealSoloFinalizada
        CHECK (FechaFinReal IS NULL OR Estado = N'Finalizado');
ELSE IF OBJECT_ID(N'dbo.CK_Cosechas_FechaFinRealSoloFinalizada', N'C') IS NULL
    PRINT N'AVISO: hay cosechas En curso con FechaFinReal cargada. Revisarlas y volver a ejecutar para crear CK_Cosechas_FechaFinRealSoloFinalizada.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Cosechas_EmpresaId' AND object_id = OBJECT_ID(N'dbo.Cosechas'))
    CREATE INDEX IX_Cosechas_EmpresaId ON dbo.Cosechas (EmpresaId, FechaInicio DESC);
GO

-- Una sola cosecha por siembra
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Cosechas_SiembraId' AND object_id = OBJECT_ID(N'dbo.Cosechas'))
BEGIN
    IF EXISTS (
        SELECT SiembraId FROM dbo.Cosechas
        WHERE SiembraId IS NOT NULL
        GROUP BY SiembraId HAVING COUNT(1) > 1
    )
    BEGIN
        PRINT N'AVISO: hay siembras con mas de una cosecha. No se creo UX_Cosechas_SiembraId.';
        SELECT c.SiembraId, c.CosechaId, c.Nombre, c.Estado, c.FechaInicio
        FROM dbo.Cosechas AS c
        WHERE c.SiembraId IN (
            SELECT SiembraId FROM dbo.Cosechas
            WHERE SiembraId IS NOT NULL
            GROUP BY SiembraId HAVING COUNT(1) > 1)
        ORDER BY c.SiembraId, c.CosechaId;
    END
    ELSE
        CREATE UNIQUE INDEX UX_Cosechas_SiembraId ON dbo.Cosechas (SiembraId) WHERE SiembraId IS NOT NULL;
END;
GO

/* =========================================================================
   2. dbo.GranoToleranciasCosecha (referencia global)
   ========================================================================= */

IF OBJECT_ID(N'dbo.GranoToleranciasCosecha', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GranoToleranciasCosecha
    (
        Producto NVARCHAR(60) NOT NULL,
        ToleranciaKgHa DECIMAL(8,2) NOT NULL,
        PmgReferenciaG DECIMAL(10,2) NOT NULL,
        FuenteReferencia NVARCHAR(300) NOT NULL,

        CONSTRAINT PK_GranoToleranciasCosecha PRIMARY KEY CLUSTERED (Producto),
        CONSTRAINT CK_GranoToleranciasCosecha_Valores CHECK (ToleranciaKgHa > 0 AND PmgReferenciaG > 0)
    );
END;
GO

-- Mismos nombres de grano que dbo.GranoBasesComercializacion (sin tilde).
INSERT INTO dbo.GranoToleranciasCosecha (Producto, ToleranciaKgHa, PmgReferenciaG, FuenteReferencia)
SELECT v.Producto, v.ToleranciaKgHa, v.PmgReferenciaG, v.FuenteReferencia
FROM (VALUES
    (N'Soja',     90.00, 167.00, N'INTA PRECOP 2007: 90 kg/ha por cosechadora, independiente del rendimiento. PMG: 60 granos cada 10 g.'),
    (N'Maiz',    210.00, 303.00, N'INTA PRECOP (EEA Manfredi): 210 kg/ha, independiente del rendimiento. PMG: 33 granos cada 10 g.'),
    (N'Sorgo',   180.00,  35.00, N'INTA PRECOP (EEA Manfredi): 180 kg/ha. PMG: 285 granos cada 10 g.'),
    (N'Trigo',    80.00,  30.00, N'INTA PRECOP (relevamientos 2007): 80 kg/ha. Otras publicaciones usan 90 kg/ha. PMG: 333 granos cada 10 g.'),
    (N'Girasol',  70.00,  71.00, N'INTA PRECOP: 70 kg/ha. PMG: 140 granos medianos cada 10 g.')
) AS v(Producto, ToleranciaKgHa, PmgReferenciaG, FuenteReferencia)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GranoToleranciasCosecha AS g WHERE g.Producto = v.Producto);
GO

/* =========================================================================
   3. dbo.GranoParametrosCosecha (ajuste por empresa)
   ========================================================================= */

IF OBJECT_ID(N'dbo.GranoParametrosCosecha', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GranoParametrosCosecha
    (
        GranoParametroCosechaId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NOT NULL,
        Producto NVARCHAR(60) NOT NULL,
        ToleranciaKgHa DECIMAL(8,2) NOT NULL,
        FactorAlta DECIMAL(4,2) NOT NULL CONSTRAINT DF_GranoParametrosCosecha_FactorAlta DEFAULT (1.50),
        ModificadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_GranoParametrosCosecha_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_GranoParametrosCosecha PRIMARY KEY CLUSTERED (GranoParametroCosechaId),
        CONSTRAINT UQ_GranoParametrosCosecha UNIQUE (EmpresaId, Producto),
        CONSTRAINT FK_GranoParametrosCosecha_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT FK_GranoParametrosCosecha_Usuarios FOREIGN KEY (ModificadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_GranoParametrosCosecha_Valores CHECK (ToleranciaKgHa > 0 AND FactorAlta > 1 AND FactorAlta <= 5)
    );
END;
GO

/* =========================================================================
   4. dbo.CosechaTiradaAros
   ========================================================================= */

IF COL_LENGTH(N'dbo.CosechaTiradaAros', N'GranosPrecosecha') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros ADD GranosPrecosecha DECIMAL(8,2) NULL;
GO
IF COL_LENGTH(N'dbo.CosechaTiradaAros', N'PerdidaPrecosechaKgHa') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros ADD PerdidaPrecosechaKgHa DECIMAL(18,4) NULL;
GO
IF COL_LENGTH(N'dbo.CosechaTiradaAros', N'ToleranciaAplicadaKgHa') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros ADD ToleranciaAplicadaKgHa DECIMAL(8,2) NULL;
GO
IF COL_LENGTH(N'dbo.CosechaTiradaAros', N'FactorAltaAplicado') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros ADD FactorAltaAplicado DECIMAL(4,2) NULL;
GO
IF COL_LENGTH(N'dbo.CosechaTiradaAros', N'PmgOrigen') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros ADD PmgOrigen NVARCHAR(20) NULL;
GO

IF OBJECT_ID(N'dbo.CK_CosechaTiradaAros_Precosecha', N'C') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros WITH CHECK ADD CONSTRAINT CK_CosechaTiradaAros_Precosecha
        CHECK ((GranosPrecosecha IS NULL OR GranosPrecosecha >= 0)
           AND (PerdidaPrecosechaKgHa IS NULL OR PerdidaPrecosechaKgHa >= 0));
GO
IF OBJECT_ID(N'dbo.CK_CosechaTiradaAros_ParametrosAplicados', N'C') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros WITH CHECK ADD CONSTRAINT CK_CosechaTiradaAros_ParametrosAplicados
        CHECK ((ToleranciaAplicadaKgHa IS NULL OR ToleranciaAplicadaKgHa > 0)
           AND (FactorAltaAplicado IS NULL OR FactorAltaAplicado > 1));
GO
IF OBJECT_ID(N'dbo.CK_CosechaTiradaAros_PmgOrigen', N'C') IS NULL
    ALTER TABLE dbo.CosechaTiradaAros WITH CHECK ADD CONSTRAINT CK_CosechaTiradaAros_PmgOrigen
        CHECK (PmgOrigen IS NULL OR PmgOrigen IN (N'Siembra', N'Referencia', N'Manual'));
GO

/* =========================================================================
   5. dbo.CosechaPartes y origen Cosecha en Almacenamiento
   ========================================================================= */

-- Nuevo origen de movimiento: ingreso a silo generado por un parte de cosecha.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Almacenamientos_Origen'
      AND parent_object_id = OBJECT_ID(N'dbo.Almacenamientos')
      AND definition NOT LIKE N'%Cosecha%'
)
    ALTER TABLE dbo.Almacenamientos DROP CONSTRAINT CK_Almacenamientos_Origen;
GO
IF OBJECT_ID(N'dbo.CK_Almacenamientos_Origen', N'C') IS NULL
    ALTER TABLE dbo.Almacenamientos WITH CHECK ADD CONSTRAINT CK_Almacenamientos_Origen
        CHECK (Origen IN (N'Manual', N'AltaSilo', N'Distribucion', N'Transferencia', N'Cosecha'));
GO

IF OBJECT_ID(N'dbo.CosechaPartes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CosechaPartes
    (
        CosechaParteId INT IDENTITY(1,1) NOT NULL,
        CosechaId INT NOT NULL,
        Fecha DATE NOT NULL,
        Hectareas DECIMAL(12,4) NOT NULL,
        KgCosechados DECIMAL(18,4) NOT NULL,
        HumedadPct DECIMAL(5,2) NOT NULL,
        Destino NVARCHAR(30) NOT NULL,
        SiloId INT NULL,
        AlmacenamientoId INT NULL,
        Observaciones NVARCHAR(1000) NULL,
        CreadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CosechaPartes_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_CosechaPartes PRIMARY KEY CLUSTERED (CosechaParteId),
        CONSTRAINT FK_CosechaPartes_Cosechas FOREIGN KEY (CosechaId) REFERENCES dbo.Cosechas (CosechaId),
        CONSTRAINT FK_CosechaPartes_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT FK_CosechaPartes_Almacenamientos FOREIGN KEY (AlmacenamientoId) REFERENCES dbo.Almacenamientos (AlmacenamientoId),
        CONSTRAINT FK_CosechaPartes_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_CosechaPartes_Valores CHECK (Hectareas > 0 AND KgCosechados > 0 AND HumedadPct >= 0 AND HumedadPct < 100),
        CONSTRAINT CK_CosechaPartes_Destino CHECK (Destino IN (N'Silo', N'Distribucion directa', N'Pendiente')),
        CONSTRAINT CK_CosechaPartes_SiloSegunDestino CHECK (
            (Destino = N'Silo' AND SiloId IS NOT NULL)
            OR (Destino <> N'Silo' AND SiloId IS NULL AND AlmacenamientoId IS NULL))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CosechaPartes_CosechaId' AND object_id = OBJECT_ID(N'dbo.CosechaPartes'))
    CREATE INDEX IX_CosechaPartes_CosechaId ON dbo.CosechaPartes (CosechaId, Fecha DESC);
GO

/* =========================================================================
   6. dbo.vw_CosechasAvance
   ========================================================================= */

CREATE OR ALTER VIEW dbo.vw_CosechasAvance
AS
SELECT
    c.CosechaId,
    COUNT(p.CosechaParteId) AS CantidadPartes,
    ISNULL(SUM(p.Hectareas), 0) AS HectareasCosechadas,
    ISNULL(SUM(p.KgCosechados), 0) AS KgAcumulados,
    CASE WHEN SUM(p.KgCosechados) > 0
         THEN SUM(p.KgCosechados * p.HumedadPct) / SUM(p.KgCosechados)
    END AS HumedadPromedioPct,           -- ponderada por kg
    ISNULL(SUM(CASE WHEN p.Destino = N'Silo' THEN p.KgCosechados END), 0) AS KgASilo,
    ISNULL(SUM(CASE WHEN p.Destino = N'Distribucion directa' THEN p.KgCosechados END), 0) AS KgDistribucionDirecta,
    ISNULL(SUM(CASE WHEN p.Destino = N'Pendiente' THEN p.KgCosechados END), 0) AS KgPendientes,
    MAX(p.Fecha) AS FechaUltimoParte
FROM dbo.Cosechas AS c
LEFT JOIN dbo.CosechaPartes AS p ON p.CosechaId = c.CosechaId
GROUP BY c.CosechaId;
GO

/* Verificacion rapida (opcional):
SELECT CosechaId, Nombre, EmpresaId, Estado, EstadoControl, HectareasHora FROM dbo.Cosechas;
SELECT * FROM dbo.GranoToleranciasCosecha;
SELECT * FROM dbo.vw_CosechasAvance;
*/
