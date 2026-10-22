-- Reportería IA: historial privado por usuario y empresa. No persiste datos enviados al proveedor.
IF OBJECT_ID(N'dbo.ReporteriaConversaciones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReporteriaConversaciones (
        ConversacionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EmpresaId INT NOT NULL REFERENCES dbo.Empresas(EmpresaId),
        UsuarioId INT NOT NULL REFERENCES dbo.Usuarios(UsuarioId),
        Titulo NVARCHAR(120) NOT NULL,
        FechaCreacion DATETIME2 NOT NULL CONSTRAINT DF_ReporteriaConversaciones_Creacion DEFAULT SYSUTCDATETIME(),
        FechaActualizacion DATETIME2 NOT NULL CONSTRAINT DF_ReporteriaConversaciones_Actualizacion DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ReporteriaConversaciones_UsuarioEmpresa
        ON dbo.ReporteriaConversaciones(UsuarioId, EmpresaId, FechaActualizacion DESC);
END;

IF OBJECT_ID(N'dbo.ReporteriaMensajes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReporteriaMensajes (
        MensajeId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ConversacionId INT NOT NULL REFERENCES dbo.ReporteriaConversaciones(ConversacionId),
        Rol NVARCHAR(12) NOT NULL CHECK (Rol IN (N'usuario', N'asistente')),
        Contenido NVARCHAR(MAX) NOT NULL,
        Modo NVARCHAR(20) NULL,
        Fuentes NVARCHAR(MAX) NULL,
        FechaCreacion DATETIME2 NOT NULL CONSTRAINT DF_ReporteriaMensajes_Creacion DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ReporteriaMensajes_Conversacion
        ON dbo.ReporteriaMensajes(ConversacionId, MensajeId);
END;
