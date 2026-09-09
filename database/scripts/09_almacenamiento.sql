/*
    Modulo: Almacenamiento
    Fuente funcional: Manual de Usuario - Modulo Almacenamiento / Historias ALM-01 a ALM-04.

    dbo.Almacenamientos: movimientos de grano (Ingreso/Egreso) sobre un Silo.
    Cada fila queda com el stock resultante del silo luego de aplicar el
    movimiento, para poder mostrar "Stock existente" en la consulta sin
    tener que recalcular sobre todo el historico.

    Nota de alcance (decision explicita durante el desarrollo, ver AGENTS.md):
    los modulos Campania y Cosecha todavia no existen en este repositorio,
    por lo que el modulo se construye de forma independiente: el alta se
    hace siempre desde el propio modulo de Almacenamiento (no desde una
    Campania). CampaniaId, CosechaId, LoteId y Producto quedan afuera del
    modelo por ahora; cuando esos modulos se incorporen, se agregan como
    columnas NULL + FK en un script de migracion nuevo, sin tocar este.

    ALM-04 (generacion automatica de movimientos):
    - Ingreso automatico al dar de alta un Silo con stock inicial: lo genera
      el backend (SilosController/AlmacenamientoRepository), no un trigger,
      para mantener la logica de negocio en la capa de aplicacion.
    - Egreso automatico cuando Distribucion usa un Silo como origen: queda
      pendiente hasta que exista el modulo Distribucion; el repositorio ya
      expone un metodo generico (RegistrarMovimientoAutomaticoAsync) listo
      para ser reutilizado por ese modulo el dia que se implemente.
*/

USE AgroDigital;
GO

IF OBJECT_ID(N'dbo.Almacenamientos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Almacenamientos
    (
        AlmacenamientoId INT IDENTITY(1,1) NOT NULL,
        SiloId INT NOT NULL,
        Fecha DATE NOT NULL CONSTRAINT DF_Almacenamientos_Fecha DEFAULT (CAST(SYSDATETIME() AS DATE)),
        TipoMovimiento NVARCHAR(20) NOT NULL,
        Cantidad DECIMAL(18,4) NOT NULL,
        StockAnterior DECIMAL(18,4) NOT NULL,
        StockResultante DECIMAL(18,4) NOT NULL,
        Origen NVARCHAR(20) NOT NULL CONSTRAINT DF_Almacenamientos_Origen DEFAULT (N'Manual'),
        Observaciones NVARCHAR(500) NULL,
        CreadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Almacenamientos_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Almacenamientos PRIMARY KEY CLUSTERED (AlmacenamientoId),
        CONSTRAINT FK_Almacenamientos_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT FK_Almacenamientos_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_Almacenamientos_TipoMovimiento CHECK (TipoMovimiento IN (N'Ingreso', N'Egreso')),
        CONSTRAINT CK_Almacenamientos_Origen CHECK (Origen IN (N'Manual', N'AltaSilo', N'Distribucion')),
        CONSTRAINT CK_Almacenamientos_Cantidad CHECK (Cantidad > 0),
        CONSTRAINT CK_Almacenamientos_StockAnterior CHECK (StockAnterior >= 0),
        CONSTRAINT CK_Almacenamientos_StockResultante CHECK (StockResultante >= 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Almacenamientos_SiloId_Fecha' AND object_id = OBJECT_ID(N'dbo.Almacenamientos'))
BEGIN
    CREATE INDEX IX_Almacenamientos_SiloId_Fecha
    ON dbo.Almacenamientos (SiloId, Fecha);
END;
GO
