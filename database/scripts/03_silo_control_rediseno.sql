/*
    Modulo: Silos - Rediseno de pantalla "Control de Silo"
    Fuente funcional: prototipo compartido por la usuaria (Control Silo).

    Cambios respecto a 02_silos.sql:

    1) dbo.SiloControlIncidencias (NUEVA): la "Presencia de plagas" deja de ser
       un campo unico dentro de un control (PresenciaPlagas/TipoPlaga en
       dbo.SiloControles) y pasa a ser una tabla repetible, igual que ya
       funciona dbo.SiloControlInsumos: se puede cargar mas de una incidencia
       por control, con su propio Tipo de Plaga y Observaciones.

    2) dbo.SiloControles: se eliminan las columnas PresenciaPlagas y TipoPlaga
       (ahora viven en SiloControlIncidencias). El resto de los campos
       (Humedad, Temperatura, Estado del grano, Rotura de Bolsa) se mantienen
       igual. La columna Fecha se mantiene con su DEFAULT (SYSDATETIME()) para
       no romper inserts existentes, pero ahora la aplicacion puede enviar un
       valor propio si el usuario corrige la fecha en el formulario.

    3) dbo.SiloControlInsumos: se elimina la columna Variedad, que no forma
       parte del formulario rediseniado.

    Ejecutar este script UNA SOLA VEZ despues de 02_silos.sql (ya idempotente,
    se puede correr de nuevo sin romper nada si ya se aplico).
*/
USE AgroDigital;
GO

-- 1) Nueva tabla de Incidencias (plagas) por Silo
IF OBJECT_ID(N'dbo.SiloControlIncidencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiloControlIncidencias
    (
        SiloControlIncidenciaId INT IDENTITY(1,1) NOT NULL,
        SiloId INT NOT NULL,
        Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_SiloControlIncidencias_Fecha DEFAULT (SYSDATETIME()),
        TipoPlaga NVARCHAR(50) NOT NULL,
        Observaciones NVARCHAR(500) NOT NULL,

        CONSTRAINT PK_SiloControlIncidencias PRIMARY KEY CLUSTERED (SiloControlIncidenciaId),
        CONSTRAINT FK_SiloControlIncidencias_Silos FOREIGN KEY (SiloId) REFERENCES dbo.Silos (SiloId),
        CONSTRAINT CK_SiloControlIncidencias_TipoPlaga CHECK (TipoPlaga IN (N'Roedores', N'Insectos', N'Hongos'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SiloControlIncidencias_SiloId' AND object_id = OBJECT_ID(N'dbo.SiloControlIncidencias'))
BEGIN
    CREATE INDEX IX_SiloControlIncidencias_SiloId
    ON dbo.SiloControlIncidencias (SiloId);
END;
GO

-- 2) dbo.SiloControles: sacar PresenciaPlagas y TipoPlaga (ahora en la tabla nueva)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.SiloControles') AND name = N'PresenciaPlagas')
BEGIN
    ALTER TABLE dbo.SiloControles DROP COLUMN PresenciaPlagas;
END;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.SiloControles') AND name = N'TipoPlaga')
BEGIN
    ALTER TABLE dbo.SiloControles DROP COLUMN TipoPlaga;
END;
GO

-- 3) dbo.SiloControlInsumos: sacar Variedad (no va mas en el formulario)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.SiloControlInsumos') AND name = N'Variedad')
BEGIN
    ALTER TABLE dbo.SiloControlInsumos DROP COLUMN Variedad;
END;
GO
