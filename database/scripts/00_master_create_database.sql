/*
    AgroDigital - Script madre de creacion de base de datos
    Motor objetivo: Microsoft SQL Server 2019
    Instancia local: configurar segun el equipo de desarrollo

    Este script debe mantenerse como fuente completa para reconstruir
    la base de datos a medida que se agreguen nuevos modulos.
*/

IF DB_ID(N'AgroDigital') IS NULL
BEGIN
    CREATE DATABASE AgroDigital;
END;
GO

USE AgroDigital;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
    Tabla: Usuarios
    Fuente funcional: Login, panel admin y gestion de usuarios.

    Se usa una tabla unica para todas las identidades del sistema:
    administradores internos de AgroDigital, gerentes, encargados y empleados.
    Los permisos finos por empresa/equipo se resolveran con tablas relacionales
    asociadas en siguientes iteraciones. La contrasenia se guarda hasheada, nunca
    en texto plano.
*/
IF OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuarios
    (
        UsuarioId INT IDENTITY(1,1) NOT NULL,
        Usuario NVARCHAR(80) NOT NULL,
        PasswordHash NVARCHAR(300) NOT NULL,
        Rol NVARCHAR(40) NOT NULL,
        Nombre NVARCHAR(100) NOT NULL,
        Apellido NVARCHAR(100) NULL,
        Telefono NVARCHAR(30) NULL,
        CorreoElectronico NVARCHAR(160) NULL,
        EmpresaPrincipalId INT NULL,
        DebeCambiarPassword BIT NOT NULL CONSTRAINT DF_Usuarios_DebeCambiarPassword DEFAULT (0),
        Activo BIT NOT NULL CONSTRAINT DF_Usuarios_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Usuarios PRIMARY KEY CLUSTERED (UsuarioId),
        CONSTRAINT UQ_Usuarios_Usuario UNIQUE (Usuario),
        CONSTRAINT CK_Usuarios_Rol CHECK (Rol IN (N'Admin', N'Gerente', N'Encargado', N'EmpleadoCampo', N'EmpleadoAdministrativo'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE Usuario = N'admin')
BEGIN
    /*
        Cuenta interna inicial de AgroDigital.
        El usuario queda fijo para facilitar la puesta en marcha del sistema,
        pero la contrasenia no se guarda ni documenta en texto plano: este valor
        es un hash PBKDF2-SHA256 precalculado.
    */
    INSERT INTO dbo.Usuarios (Usuario, PasswordHash, Rol, Nombre, Apellido, DebeCambiarPassword, Activo)
    VALUES
    (
        N'admin',
        N'PBKDF2-SHA256$100000$3f2ebeovsgzzFdgqLJFd/A==$PtO2rKGT4epldxeA2sfXSzjALzcQ9Jm1oCOIeKCh2wE=',
        N'Admin',
        N'Admin',
        N'AgroDigital',
        0,
        1
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Usuarios_Rol_Activo' AND object_id = OBJECT_ID(N'dbo.Usuarios'))
BEGIN
    CREATE INDEX IX_Usuarios_Rol_Activo
    ON dbo.Usuarios (Rol, Activo);
END;
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_Usuarios_CorreoElectronico' AND parent_object_id = OBJECT_ID(N'dbo.Usuarios'))
BEGIN
    ALTER TABLE dbo.Usuarios DROP CONSTRAINT UQ_Usuarios_CorreoElectronico;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Usuarios_CorreoElectronico_NotNull' AND object_id = OBJECT_ID(N'dbo.Usuarios'))
BEGIN
    CREATE UNIQUE INDEX UX_Usuarios_CorreoElectronico_NotNull
    ON dbo.Usuarios (CorreoElectronico)
    WHERE CorreoElectronico IS NOT NULL;
END;
GO

/*
    Tabla: AccesosGerenteIniciales
    Fuente funcional: Panel admin interno.

    Registra la trazabilidad de las credenciales iniciales generadas para
    responsables/gerentes. La contrasenia temporal nunca se almacena en texto
    plano: se guarda solo su hash en dbo.Usuarios.PasswordHash y se muestra una
    unica vez al administrador cuando la credencial se crea o se regenera.
*/
IF OBJECT_ID(N'dbo.AccesosGerenteIniciales', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AccesosGerenteIniciales
    (
        AccesoGerenteInicialId INT IDENTITY(1,1) NOT NULL,
        UsuarioId INT NOT NULL,
        ResponsableInicial NVARCHAR(150) NOT NULL,
        Estado NVARCHAR(40) NOT NULL CONSTRAINT DF_AccesosGerenteIniciales_Estado DEFAULT (N'Pendiente de primer ingreso'),
        GrupoGestion NVARCHAR(80) NOT NULL CONSTRAINT DF_AccesosGerenteIniciales_GrupoGestion DEFAULT (N'Se genera al completar registro'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_AccesosGerenteIniciales_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaVencimiento DATETIME2(0) NULL,
        FechaUso DATETIME2(0) NULL,
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_AccesosGerenteIniciales PRIMARY KEY CLUSTERED (AccesoGerenteInicialId),
        CONSTRAINT FK_AccesosGerenteIniciales_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_AccesosGerenteIniciales_Estado CHECK (Estado IN (N'Pendiente de primer ingreso', N'Usado', N'Vencido', N'Deshabilitado'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AccesosGerenteIniciales_Estado' AND object_id = OBJECT_ID(N'dbo.AccesosGerenteIniciales'))
BEGIN
    CREATE INDEX IX_AccesosGerenteIniciales_Estado
    ON dbo.AccesosGerenteIniciales (Estado, FechaVencimiento);
END;
GO

/*
    Tabla: GruposGestion
    Fuente funcional: Registro inicial del gerente.

    Representa el panel/grupo padre de gestion de un gerente. Desde este grupo
    se administran una o varias empresas/equipos y sus usuarios asociados.
*/
IF OBJECT_ID(N'dbo.GruposGestion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GruposGestion
    (
        GrupoGestionId INT IDENTITY(1,1) NOT NULL,
        Codigo NVARCHAR(40) NOT NULL,
        GerenteUsuarioId INT NOT NULL,
        Nombre NVARCHAR(180) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_GruposGestion_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_GruposGestion_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_GruposGestion PRIMARY KEY CLUSTERED (GrupoGestionId),
        CONSTRAINT UQ_GruposGestion_Codigo UNIQUE (Codigo),
        CONSTRAINT FK_GruposGestion_Usuarios FOREIGN KEY (GerenteUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO

/*
    Tabla: Empresas
    Fuente funcional: Empresas/equipos iniciales del gerente.

    Cada empresa pertenece a un grupo de gestion. No se elimina fisicamente;
    se deshabilita para conservar trazabilidad.
*/
IF OBJECT_ID(N'dbo.Empresas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Empresas
    (
        EmpresaId INT IDENTITY(1,1) NOT NULL,
        GrupoGestionId INT NOT NULL,
        Nombre NVARCHAR(180) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Empresas_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Empresas_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Empresas PRIMARY KEY CLUSTERED (EmpresaId),
        CONSTRAINT FK_Empresas_GruposGestion FOREIGN KEY (GrupoGestionId) REFERENCES dbo.GruposGestion (GrupoGestionId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Empresas_GrupoGestion_Activo' AND object_id = OBJECT_ID(N'dbo.Empresas'))
BEGIN
    CREATE INDEX IX_Empresas_GrupoGestion_Activo
    ON dbo.Empresas (GrupoGestionId, Activo);
END;
GO

/*
    Tabla: UsuarioEmpresas
    Fuente funcional: Roles discriminados por empresa/equipo.

    Permite que un usuario pertenezca a varias empresas con roles distintos.
*/
IF OBJECT_ID(N'dbo.UsuarioEmpresas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UsuarioEmpresas
    (
        UsuarioEmpresaId INT IDENTITY(1,1) NOT NULL,
        UsuarioId INT NOT NULL,
        EmpresaId INT NOT NULL,
        Rol NVARCHAR(40) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_UsuarioEmpresas_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_UsuarioEmpresas_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_UsuarioEmpresas PRIMARY KEY CLUSTERED (UsuarioEmpresaId),
        CONSTRAINT UQ_UsuarioEmpresas_Usuario_Empresa UNIQUE (UsuarioId, EmpresaId),
        CONSTRAINT FK_UsuarioEmpresas_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT FK_UsuarioEmpresas_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT CK_UsuarioEmpresas_Rol CHECK (Rol IN (N'Gerente', N'Encargado', N'EmpleadoCampo', N'EmpleadoAdministrativo'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UsuarioEmpresas_Empresa_Rol_Activo' AND object_id = OBJECT_ID(N'dbo.UsuarioEmpresas'))
BEGIN
    CREATE INDEX IX_UsuarioEmpresas_Empresa_Rol_Activo
    ON dbo.UsuarioEmpresas (EmpresaId, Rol, Activo);
END;
GO

/*
    Tabla: GrupoGestionOtps
    Fuente funcional: Invitaciones seguras para unir empleados al grupo de gestion.

    Cada OTP es de un solo uso, vence a los 7 dias y se guarda hasheada.
*/
IF OBJECT_ID(N'dbo.GrupoGestionOtps', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GrupoGestionOtps
    (
        GrupoGestionOtpId INT IDENTITY(1,1) NOT NULL,
        GrupoGestionId INT NOT NULL,
        GeneradoPorUsuarioId INT NOT NULL,
        CodigoOtpHash NVARCHAR(260) NOT NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_GrupoGestionOtps_FechaCreacion DEFAULT (SYSUTCDATETIME()),
        FechaVencimiento DATETIME2(0) NOT NULL,
        Usado BIT NOT NULL CONSTRAINT DF_GrupoGestionOtps_Usado DEFAULT (0),
        FechaUso DATETIME2(0) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_GrupoGestionOtps_Activo DEFAULT (1),

        CONSTRAINT PK_GrupoGestionOtps PRIMARY KEY CLUSTERED (GrupoGestionOtpId),
        CONSTRAINT FK_GrupoGestionOtps_GruposGestion FOREIGN KEY (GrupoGestionId) REFERENCES dbo.GruposGestion (GrupoGestionId),
        CONSTRAINT FK_GrupoGestionOtps_Usuarios FOREIGN KEY (GeneradoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GrupoGestionOtps_Grupo_Activo' AND object_id = OBJECT_ID(N'dbo.GrupoGestionOtps'))
BEGIN
    CREATE INDEX IX_GrupoGestionOtps_Grupo_Activo
    ON dbo.GrupoGestionOtps (GrupoGestionId, Activo, Usado, FechaVencimiento);
END;
GO

/*
    Tabla: SolicitudesUsuario
    Fuente funcional: Registro de empleados mediante ID de grupo + OTP.

    Guarda las solicitudes pendientes, aprobadas, rechazadas o descartadas por el gerente.
*/
IF OBJECT_ID(N'dbo.SolicitudesUsuario', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SolicitudesUsuario
    (
        SolicitudUsuarioId INT IDENTITY(1,1) NOT NULL,
        GrupoGestionId INT NOT NULL,
        UsuarioId INT NULL,
        Nombre NVARCHAR(120) NOT NULL,
        Apellido NVARCHAR(120) NOT NULL,
        Telefono NVARCHAR(40) NOT NULL,
        CorreoElectronico NVARCHAR(180) NOT NULL,
        Estado NVARCHAR(30) NOT NULL CONSTRAINT DF_SolicitudesUsuario_Estado DEFAULT (N'Pendiente'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_SolicitudesUsuario_FechaCreacion DEFAULT (SYSUTCDATETIME()),
        FechaResolucion DATETIME2(0) NULL,
        ResueltoPorUsuarioId INT NULL,

        CONSTRAINT PK_SolicitudesUsuario PRIMARY KEY CLUSTERED (SolicitudUsuarioId),
        CONSTRAINT FK_SolicitudesUsuario_GruposGestion FOREIGN KEY (GrupoGestionId) REFERENCES dbo.GruposGestion (GrupoGestionId),
        CONSTRAINT FK_SolicitudesUsuario_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT FK_SolicitudesUsuario_ResueltoPor FOREIGN KEY (ResueltoPorUsuarioId) REFERENCES dbo.Usuarios (UsuarioId),
        CONSTRAINT CK_SolicitudesUsuario_Estado CHECK (Estado IN (N'Pendiente', N'Aprobada', N'Rechazada', N'Descartada'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SolicitudesUsuario_Grupo_Estado' AND object_id = OBJECT_ID(N'dbo.SolicitudesUsuario'))
BEGIN
    CREATE INDEX IX_SolicitudesUsuario_Grupo_Estado
    ON dbo.SolicitudesUsuario (GrupoGestionId, Estado, FechaCreacion);
END;
GO
/*
    Tabla: Lotes
    Fuente funcional: Manual de Usuario - Modulo Lotes.

    Los lotes no se eliminan fisicamente porque forman parte de la
    trazabilidad historica de las campanias. Se deja Activo para una
    baja logica futura si el negocio lo necesita.
*/
IF OBJECT_ID(N'dbo.Lotes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Lotes
    (
        LoteId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NULL,
        Nombre NVARCHAR(100) NOT NULL,
        NombreNormalizado AS LOWER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI PERSISTED,
        Pais NVARCHAR(100) NOT NULL,
        Provincia NVARCHAR(100) NOT NULL,
        Ciudad NVARCHAR(100) NOT NULL,
        Condicion NVARCHAR(20) NOT NULL,
        CultivoAnterior NVARCHAR(60) NOT NULL CONSTRAINT DF_Lotes_CultivoAnterior DEFAULT (N'Sin dato'),
        CultivoAnteriorCampania NVARCHAR(20) NOT NULL CONSTRAINT DF_Lotes_CultivoAnteriorCampania DEFAULT (N'Sin dato'),
        CultivoActual NVARCHAR(60) NULL,
        EstadoCultivo NVARCHAR(20) NOT NULL CONSTRAINT DF_Lotes_EstadoCultivo DEFAULT (N'Sin cultivo'),
        Hectareas DECIMAL(12,4) NOT NULL,
        SuperficieTotal DECIMAL(18,4) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Lotes_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Lotes_FechaCreacion DEFAULT (SYSDATETIME()),
        FechaModificacion DATETIME2(0) NULL,

        CONSTRAINT PK_Lotes PRIMARY KEY CLUSTERED (LoteId),
        CONSTRAINT FK_Lotes_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId),
        CONSTRAINT CK_Lotes_Condicion CHECK (Condicion IN (N'Propio', N'Alquilado')),
        CONSTRAINT CK_Lotes_EstadoCultivo CHECK (EstadoCultivo IN (N'Sin cultivo', N'Pendiente', N'Cultivado', N'Cosechado')),
        CONSTRAINT CK_Lotes_Hectareas CHECK (Hectareas > 0),
        CONSTRAINT CK_Lotes_SuperficieTotal CHECK (SuperficieTotal > 0)
    );
END;
GO
IF COL_LENGTH(N'dbo.Lotes', N'EmpresaId') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD EmpresaId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'NombreNormalizado') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes
    ADD NombreNormalizado AS LOWER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI PERSISTED;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'CultivoAnterior') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD CultivoAnterior NVARCHAR(60) NOT NULL CONSTRAINT DF_Lotes_CultivoAnterior DEFAULT (N'Sin dato') WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'CultivoActual') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD CultivoActual NVARCHAR(60) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'CultivoAnteriorCampania') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD CultivoAnteriorCampania NVARCHAR(20) NOT NULL CONSTRAINT DF_Lotes_CultivoAnteriorCampania DEFAULT (N'Sin dato') WITH VALUES;
END;
GO

IF COL_LENGTH(N'dbo.Lotes', N'EstadoCultivo') IS NULL
BEGIN
    ALTER TABLE dbo.Lotes ADD EstadoCultivo NVARCHAR(20) NOT NULL CONSTRAINT DF_Lotes_EstadoCultivo DEFAULT (N'Sin cultivo') WITH VALUES;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Lotes_EstadoCultivo' AND parent_object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    ALTER TABLE dbo.Lotes WITH CHECK ADD CONSTRAINT CK_Lotes_EstadoCultivo CHECK (EstadoCultivo IN (N'Sin cultivo', N'Pendiente', N'Cultivado', N'Cosechado'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Lotes_Empresas' AND parent_object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    ALTER TABLE dbo.Lotes
    ADD CONSTRAINT FK_Lotes_Empresas FOREIGN KEY (EmpresaId) REFERENCES dbo.Empresas (EmpresaId);
END;
GO

IF EXISTS (SELECT 1 FROM dbo.Empresas WHERE Activo = 1)
BEGIN
    UPDATE dbo.Lotes
    SET EmpresaId = (SELECT TOP (1) EmpresaId FROM dbo.Empresas WHERE Activo = 1 ORDER BY EmpresaId)
    WHERE EmpresaId IS NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Lotes_EmpresaId_Activo' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    CREATE INDEX IX_Lotes_EmpresaId_Activo
    ON dbo.Lotes (EmpresaId, Activo);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Lotes_CultivoActual_EstadoCultivo' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    CREATE INDEX IX_Lotes_CultivoActual_EstadoCultivo ON dbo.Lotes (CultivoActual, EstadoCultivo);
END;
GO

IF OBJECT_ID(N'dbo.LoteCoordenadas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.LoteCoordenadas
    (
        LoteCoordenadaId INT IDENTITY(1,1) NOT NULL,
        LoteId INT NOT NULL,
        Orden INT NOT NULL,
        Latitud DECIMAL(9,6) NOT NULL,
        Longitud DECIMAL(9,6) NOT NULL,

        CONSTRAINT PK_LoteCoordenadas PRIMARY KEY CLUSTERED (LoteCoordenadaId),
        CONSTRAINT FK_LoteCoordenadas_Lotes FOREIGN KEY (LoteId)
            REFERENCES dbo.Lotes (LoteId),
        CONSTRAINT UQ_LoteCoordenadas_Lote_Orden UNIQUE (LoteId, Orden),
        CONSTRAINT CK_LoteCoordenadas_Orden CHECK (Orden > 0),
        CONSTRAINT CK_LoteCoordenadas_Latitud CHECK (Latitud BETWEEN -90 AND 90),
        CONSTRAINT CK_LoteCoordenadas_Longitud CHECK (Longitud BETWEEN -180 AND 180)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Lotes_Ubicacion' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    CREATE INDEX IX_Lotes_Ubicacion
    ON dbo.Lotes (Pais, Provincia, Ciudad);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Lotes_Nombre' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    CREATE INDEX IX_Lotes_Nombre
    ON dbo.Lotes (Nombre);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Lotes_Empresa_NombreNormalizado' AND object_id = OBJECT_ID(N'dbo.Lotes'))
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Lotes
        GROUP BY EmpresaId, NombreNormalizado
        HAVING COUNT(*) > 1
    )
    BEGIN
        CREATE UNIQUE INDEX UX_Lotes_Empresa_NombreNormalizado
        ON dbo.Lotes (EmpresaId, NombreNormalizado);
    END
    ELSE
    BEGIN
        PRINT N'No se creo UX_Lotes_Empresa_NombreNormalizado porque existen lotes duplicados. Corregir nombres duplicados y volver a ejecutar.';
    END
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LoteCoordenadas_LoteId' AND object_id = OBJECT_ID(N'dbo.LoteCoordenadas'))
BEGIN
    CREATE INDEX IX_LoteCoordenadas_LoteId
    ON dbo.LoteCoordenadas (LoteId);
END;
GO

/*
    Modulo: Campanias
    Una campania agrupa una o varias combinaciones Lote + Grano durante un periodo.
    Cada combinacion mantiene su propio estado y etapa para operar procesos independientes.
*/
IF OBJECT_ID(N'dbo.Campanias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Campanias
    (
        CampaniaId INT IDENTITY(1,1) NOT NULL,
        EmpresaId INT NULL,
        Periodo NVARCHAR(9) NOT NULL,
        Nombre NVARCHAR(120) NOT NULL,
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

IF COL_LENGTH(N'dbo.Campanias', N'Periodo') IS NULL
BEGIN
    ALTER TABLE dbo.Campanias ADD Periodo NVARCHAR(9) NULL;
END;
GO

UPDATE dbo.Campanias
SET Periodo = CONCAT(
    CASE WHEN MONTH(FechaInicio) >= 6 THEN YEAR(FechaInicio) ELSE YEAR(FechaInicio) - 1 END,
    N'-',
    CASE WHEN MONTH(FechaInicio) >= 6 THEN YEAR(FechaInicio) + 1 ELSE YEAR(FechaInicio) END
)
WHERE Periodo IS NULL;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Campanias')
      AND name = N'Periodo'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE dbo.Campanias ALTER COLUMN Periodo NVARCHAR(9) NOT NULL;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Campanias')
      AND name = N'Nombre'
      AND max_length < 240
)
BEGIN
    ALTER TABLE dbo.Campanias ALTER COLUMN Nombre NVARCHAR(120) NOT NULL;
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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Campanias_Empresa_Periodo' AND object_id = OBJECT_ID(N'dbo.Campanias'))
AND NOT EXISTS (
    SELECT 1
    FROM dbo.Campanias
    WHERE EmpresaId IS NOT NULL
    GROUP BY EmpresaId, Periodo
    HAVING COUNT(1) > 1
)
BEGIN
    CREATE UNIQUE INDEX UX_Campanias_Empresa_Periodo
    ON dbo.Campanias (EmpresaId, Periodo)
    WHERE EmpresaId IS NOT NULL;
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

-- Almacenamiento: estructura integrada desde los scripts incrementales.

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

USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.Almacenamientos', N'Campania') IS NULL
BEGIN
    ALTER TABLE dbo.Almacenamientos
    ADD Campania NVARCHAR(60) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Almacenamientos', N'Cosecha') IS NULL
BEGIN
    ALTER TABLE dbo.Almacenamientos
    ADD Cosecha NVARCHAR(60) NULL;
END;
GO
