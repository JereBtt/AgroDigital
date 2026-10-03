using System.Data;
using AgroDigital.Api.Dtos;
using AgroDigital.Api.Models;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public sealed class AdminRepository(IConfiguration configuration) : IAdminRepository
{
    private const string PendingStatus = "Pendiente de primer ingreso";
    private const string PendingGroup = "Se genera al completar registro";

    // Columnas de CuentaGerenteInicialDto, en el orden que espera MapCuenta.
    private const string ColumnasCuenta = """
            acceso.AccesoGerenteInicialId,
            acceso.ResponsableInicial,
            usuario.Usuario,
            acceso.Estado,
            acceso.GrupoGestion,
            acceso.FechaCreacion,
            acceso.FechaVencimiento,
            acceso.CorreoElectronico,
            acceso.EstadoEnvio,
            acceso.FechaUltimoEnvio,
            acceso.CantidadEnvios
        """;

    private const string SelectCuentaPorId = """
            SELECT
        """ + ColumnasCuenta + """

            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId;
        """;

    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<IReadOnlyList<CuentaGerenteInicialDto>> ObtenerCuentasGerenteAsync()
    {
        const string sql = """
            SELECT
            """ + ColumnasCuenta + """

            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            ORDER BY acceso.FechaCreacion DESC, acceso.AccesoGerenteInicialId DESC;
            """;

        var cuentas = new List<CuentaGerenteInicialDto>();

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            cuentas.Add(MapCuenta(reader));
        }

        return cuentas;
    }

    public async Task<CuentaGerenteInicialDto?> ObtenerCuentaGerenteAsync(int accesoId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(SelectCuentaPorId, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCuenta(reader) : null;
    }

    public async Task<bool> ExisteUsuarioAsync(string usuario)
    {
        const string sql = "SELECT COUNT(1) FROM dbo.Usuarios WHERE Usuario = @Usuario;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Usuario", usuario);

        var result = await command.ExecuteScalarAsync();
        return Convert.ToInt32(result) > 0;
    }

    public async Task<CuentaGerenteInicialDto> CrearCuentaGerenteAsync(
        string responsable, string usuario, string correoElectronico,
        string passwordHash, string tokenActivacionHash, DateTime fechaVencimiento)
    {
        const string sql = """
            SET ANSI_NULLS ON;
            SET QUOTED_IDENTIFIER ON;
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            INSERT INTO dbo.Usuarios (Usuario, PasswordHash, Rol, Nombre, DebeCambiarPassword, Activo)
            VALUES (@Usuario, @PasswordHash, N'Gerente', @Responsable, 1, 1);

            DECLARE @UsuarioId INT = CONVERT(INT, SCOPE_IDENTITY());

            INSERT INTO dbo.AccesosGerenteIniciales
                (UsuarioId, ResponsableInicial, Estado, GrupoGestion, FechaVencimiento,
                 CorreoElectronico, TokenActivacionHash, EstadoEnvio)
            OUTPUT
                INSERTED.AccesoGerenteInicialId,
                INSERTED.ResponsableInicial,
                @Usuario,
                INSERTED.Estado,
                INSERTED.GrupoGestion,
                INSERTED.FechaCreacion,
                INSERTED.FechaVencimiento,
                INSERTED.CorreoElectronico,
                INSERTED.EstadoEnvio,
                INSERTED.FechaUltimoEnvio,
                INSERTED.CantidadEnvios
            VALUES
                (@UsuarioId, @Responsable, @Estado, @GrupoGestion, @FechaVencimiento,
                 @Correo, @TokenHash, N'Pendiente');

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Usuario", usuario);
        command.Parameters.AddWithValue("@PasswordHash", passwordHash);
        command.Parameters.AddWithValue("@Responsable", responsable);
        command.Parameters.AddWithValue("@Estado", PendingStatus);
        command.Parameters.AddWithValue("@GrupoGestion", PendingGroup);
        command.Parameters.AddWithValue("@FechaVencimiento", fechaVencimiento);
        command.Parameters.Add("@Correo", SqlDbType.NVarChar, 160).Value = correoElectronico;
        command.Parameters.Add("@TokenHash", SqlDbType.Char, 64).Value = tokenActivacionHash;

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("No se pudo crear el acceso gerente inicial.");
        }

        return MapCuenta(reader);
    }

    public async Task<CuentaGerenteInicialDto?> ActualizarResponsableAsync(int accesoId, string responsable, string usuarioInicial, string? correoElectronico)
    {
        // Si el correo cambia, el enlace enviado al correo anterior deja de servir
        // (se borra el token) y el envio vuelve a "Pendiente" hasta reenviar.
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE acceso
            SET
                acceso.ResponsableInicial = @Responsable,
                acceso.CorreoElectronico = COALESCE(@Correo, acceso.CorreoElectronico),
                acceso.TokenActivacionHash = CASE
                    WHEN @Correo IS NOT NULL AND @Correo <> ISNULL(acceso.CorreoElectronico, N'') THEN NULL
                    ELSE acceso.TokenActivacionHash END,
                acceso.EstadoEnvio = CASE
                    WHEN @Correo IS NOT NULL AND @Correo <> ISNULL(acceso.CorreoElectronico, N'') THEN N'Pendiente'
                    ELSE acceso.EstadoEnvio END,
                acceso.FechaModificacion = SYSDATETIME()
            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId
              AND acceso.Estado = @EstadoPendiente
              AND usuario.DebeCambiarPassword = 1;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            UPDATE usuario
            SET
                usuario.Nombre = @Responsable,
                usuario.Usuario = @UsuarioInicial,
                usuario.FechaModificacion = SYSDATETIME()
            FROM dbo.Usuarios usuario
            INNER JOIN dbo.AccesosGerenteIniciales acceso ON acceso.UsuarioId = usuario.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId
              AND acceso.Estado = @EstadoPendiente
              AND usuario.DebeCambiarPassword = 1;

            """ + SelectCuentaPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);
        command.Parameters.AddWithValue("@Responsable", responsable);
        command.Parameters.AddWithValue("@UsuarioInicial", usuarioInicial);
        command.Parameters.AddWithValue("@EstadoPendiente", PendingStatus);
        command.Parameters.Add("@Correo", SqlDbType.NVarChar, 160).Value = (object?)correoElectronico ?? DBNull.Value;

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCuenta(reader) : null;
    }

    public async Task<CuentaGerenteInicialDto?> CambiarHabilitacionAsync(int accesoId, bool habilitado)
    {
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE usuario
            SET
                usuario.Activo = @Activo,
                usuario.FechaModificacion = SYSDATETIME()
            FROM dbo.Usuarios usuario
            INNER JOIN dbo.AccesosGerenteIniciales acceso ON acceso.UsuarioId = usuario.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            UPDATE dbo.AccesosGerenteIniciales
            SET
                Estado = @Estado,
                FechaModificacion = SYSDATETIME()
            WHERE AccesoGerenteInicialId = @AccesoId;

            """ + SelectCuentaPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);
        command.Parameters.AddWithValue("@Activo", habilitado);
        command.Parameters.AddWithValue("@Estado", habilitado ? PendingStatus : "Deshabilitado");

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCuenta(reader) : null;
    }

    public async Task<CuentaGerenteInicialDto?> RegenerarPasswordAsync(int accesoId, string passwordHash, DateTime fechaVencimiento)
    {
        const string sql = """
            SET ANSI_NULLS ON;
            SET QUOTED_IDENTIFIER ON;
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE usuario
            SET
                usuario.PasswordHash = @PasswordHash,
                usuario.DebeCambiarPassword = 1,
                usuario.Activo = 1,
                usuario.FechaModificacion = SYSDATETIME()
            FROM dbo.Usuarios usuario
            INNER JOIN dbo.AccesosGerenteIniciales acceso ON acceso.UsuarioId = usuario.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId
              AND acceso.Estado = @Estado;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            UPDATE dbo.AccesosGerenteIniciales
            SET
                FechaVencimiento = @FechaVencimiento,
                FechaModificacion = SYSDATETIME()
            WHERE AccesoGerenteInicialId = @AccesoId;

            """ + SelectCuentaPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);
        command.Parameters.AddWithValue("@PasswordHash", passwordHash);
        command.Parameters.AddWithValue("@Estado", PendingStatus);
        command.Parameters.AddWithValue("@FechaVencimiento", fechaVencimiento);

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCuenta(reader) : null;
    }

    // =====================================================================
    // Invitacion por correo
    // =====================================================================

    public async Task<bool> CorreoEnUsoAsync(string correoElectronico, int? excluirAccesoId)
    {
        // En uso si ya es el usuario o el correo de alguien (el Gerente usa su correo
        // como usuario al completar el registro) o si otra invitacion pendiente lo tiene.
        const string sql = """
            SELECT CASE
                WHEN EXISTS (
                    SELECT 1 FROM dbo.Usuarios
                    WHERE Usuario = @Correo OR CorreoElectronico = @Correo)
                  OR EXISTS (
                    SELECT 1 FROM dbo.AccesosGerenteIniciales
                    WHERE CorreoElectronico = @Correo
                      AND Estado = @EstadoPendiente
                      AND (@ExcluirAccesoId IS NULL OR AccesoGerenteInicialId <> @ExcluirAccesoId))
                THEN 1 ELSE 0 END;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.Add("@Correo", SqlDbType.NVarChar, 160).Value = correoElectronico;
        command.Parameters.AddWithValue("@EstadoPendiente", PendingStatus);
        command.Parameters.Add("@ExcluirAccesoId", SqlDbType.Int).Value = (object?)excluirAccesoId ?? DBNull.Value;

        return Convert.ToInt32(await command.ExecuteScalarAsync()) == 1;
    }

    public async Task<CuentaGerenteInicialDto?> RenovarTokenActivacionAsync(int accesoId, string tokenActivacionHash, DateTime fechaVencimiento)
    {
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE dbo.AccesosGerenteIniciales
            SET
                TokenActivacionHash = @TokenHash,
                FechaVencimiento = @FechaVencimiento,
                EstadoEnvio = N'Pendiente',
                FechaModificacion = SYSDATETIME()
            WHERE AccesoGerenteInicialId = @AccesoId
              AND Estado = @EstadoPendiente
              AND CorreoElectronico IS NOT NULL;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            """ + SelectCuentaPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);
        command.Parameters.Add("@TokenHash", SqlDbType.Char, 64).Value = tokenActivacionHash;
        command.Parameters.AddWithValue("@FechaVencimiento", fechaVencimiento);
        command.Parameters.AddWithValue("@EstadoPendiente", PendingStatus);

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCuenta(reader) : null;
    }

    public async Task<CuentaGerenteInicialDto?> RegistrarEnvioInvitacionAsync(
        int accesoId, string destinatario, string asunto, bool enviado, string? error, int? enviadoPorUsuarioId)
    {
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            INSERT INTO dbo.CorreosEnviados
                (Tipo, Destinatario, Asunto, Estado, Error, ReferenciaTipo, ReferenciaId, EnviadoPorUsuarioId)
            VALUES
                (N'InvitacionGerente', @Destinatario, @Asunto, @Estado, @Error, N'AccesoGerenteInicial', @AccesoId,
                 (SELECT UsuarioId FROM dbo.Usuarios WHERE UsuarioId = @EnviadoPor));

            UPDATE dbo.AccesosGerenteIniciales
            SET
                EstadoEnvio = @Estado,
                FechaUltimoEnvio = SYSDATETIME(),
                CantidadEnvios = CantidadEnvios + 1,
                FechaModificacion = SYSDATETIME()
            WHERE AccesoGerenteInicialId = @AccesoId;

            """ + SelectCuentaPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);
        command.Parameters.Add("@Destinatario", SqlDbType.NVarChar, 160).Value = destinatario;
        command.Parameters.Add("@Asunto", SqlDbType.NVarChar, 200).Value = asunto;
        command.Parameters.Add("@Estado", SqlDbType.NVarChar, 20).Value = enviado ? "Enviado" : "Error";
        command.Parameters.Add("@Error", SqlDbType.NVarChar, 500).Value = (object?)error ?? DBNull.Value;
        command.Parameters.Add("@EnviadoPor", SqlDbType.Int).Value = (object?)enviadoPorUsuarioId ?? DBNull.Value;

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCuenta(reader) : null;
    }

    public async Task<(UsuarioLogin Usuario, string? CorreoInvitacion)?> ObtenerUsuarioPorTokenActivacionAsync(string tokenActivacionHash)
    {
        // El enlace sirve solo mientras el acceso este pendiente, vigente y el usuario activo.
        // Al completar el registro el acceso pasa a "Usado" y el enlace deja de funcionar.
        const string sql = """
            SELECT
                usuario.UsuarioId, usuario.Usuario, usuario.PasswordHash, usuario.Rol, usuario.Nombre,
                usuario.Apellido, usuario.Telefono, usuario.CorreoElectronico, usuario.DebeCambiarPassword,
                usuario.Activo, acceso.CorreoElectronico AS CorreoInvitacion
            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            WHERE acceso.TokenActivacionHash = @TokenHash
              AND acceso.Estado = @EstadoPendiente
              AND (acceso.FechaVencimiento IS NULL OR acceso.FechaVencimiento >= SYSUTCDATETIME())
              AND usuario.Activo = 1
              AND usuario.DebeCambiarPassword = 1
              AND usuario.Rol = N'Gerente';
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.Add("@TokenHash", SqlDbType.Char, 64).Value = tokenActivacionHash;
        command.Parameters.AddWithValue("@EstadoPendiente", PendingStatus);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        string? Texto(string columna) =>
            reader.IsDBNull(reader.GetOrdinal(columna)) ? null : reader.GetString(reader.GetOrdinal(columna));

        var usuario = new UsuarioLogin
        {
            UsuarioId = reader.GetInt32(reader.GetOrdinal("UsuarioId")),
            Usuario = reader.GetString(reader.GetOrdinal("Usuario")),
            PasswordHash = reader.GetString(reader.GetOrdinal("PasswordHash")),
            Rol = reader.GetString(reader.GetOrdinal("Rol")),
            Nombre = reader.GetString(reader.GetOrdinal("Nombre")),
            Apellido = Texto("Apellido"),
            Telefono = Texto("Telefono"),
            CorreoElectronico = Texto("CorreoElectronico"),
            DebeCambiarPassword = reader.GetBoolean(reader.GetOrdinal("DebeCambiarPassword")),
            Activo = reader.GetBoolean(reader.GetOrdinal("Activo")),
        };

        return (usuario, Texto("CorreoInvitacion"));
    }

    private static CuentaGerenteInicialDto MapCuenta(SqlDataReader reader)
    {
        return new CuentaGerenteInicialDto(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetDateTime(5),
            reader.IsDBNull(6) ? null : reader.GetDateTime(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetDateTime(9),
            reader.GetInt32(10)
        );
    }
}
