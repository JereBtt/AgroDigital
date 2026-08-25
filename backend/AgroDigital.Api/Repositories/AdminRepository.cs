using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public sealed class AdminRepository(IConfiguration configuration) : IAdminRepository
{
    private const string PendingStatus = "Pendiente de primer ingreso";
    private const string PendingGroup = "Se genera al completar registro";

    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<IReadOnlyList<CuentaGerenteInicialDto>> ObtenerCuentasGerenteAsync()
    {
        const string sql = """
            SELECT
                acceso.AccesoGerenteInicialId,
                acceso.ResponsableInicial,
                usuario.Usuario,
                acceso.Estado,
                acceso.GrupoGestion,
                acceso.FechaCreacion,
                acceso.FechaVencimiento
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

    public async Task<CuentaGerenteInicialDto> CrearCuentaGerenteAsync(string responsable, string usuario, string passwordHash, DateTime fechaVencimiento)
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
                (UsuarioId, ResponsableInicial, Estado, GrupoGestion, FechaVencimiento)
            OUTPUT
                INSERTED.AccesoGerenteInicialId,
                INSERTED.ResponsableInicial,
                @Usuario,
                INSERTED.Estado,
                INSERTED.GrupoGestion,
                INSERTED.FechaCreacion,
                INSERTED.FechaVencimiento
            VALUES
                (@UsuarioId, @Responsable, @Estado, @GrupoGestion, @FechaVencimiento);

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

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("No se pudo crear el acceso gerente inicial.");
        }

        return MapCuenta(reader);
    }

    public async Task<CuentaGerenteInicialDto?> ActualizarResponsableAsync(int accesoId, string responsable, string usuarioInicial)
    {
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE acceso
            SET
                acceso.ResponsableInicial = @Responsable,
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

            SELECT
                acceso.AccesoGerenteInicialId,
                acceso.ResponsableInicial,
                usuario.Usuario,
                acceso.Estado,
                acceso.GrupoGestion,
                acceso.FechaCreacion,
                acceso.FechaVencimiento
            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId;

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AccesoId", accesoId);
        command.Parameters.AddWithValue("@Responsable", responsable);
        command.Parameters.AddWithValue("@UsuarioInicial", usuarioInicial);
        command.Parameters.AddWithValue("@EstadoPendiente", PendingStatus);

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

            SELECT
                acceso.AccesoGerenteInicialId,
                acceso.ResponsableInicial,
                usuario.Usuario,
                acceso.Estado,
                acceso.GrupoGestion,
                acceso.FechaCreacion,
                acceso.FechaVencimiento
            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId;

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

            SELECT
                acceso.AccesoGerenteInicialId,
                acceso.ResponsableInicial,
                usuario.Usuario,
                acceso.Estado,
                acceso.GrupoGestion,
                acceso.FechaCreacion,
                acceso.FechaVencimiento
            FROM dbo.AccesosGerenteIniciales acceso
            INNER JOIN dbo.Usuarios usuario ON usuario.UsuarioId = acceso.UsuarioId
            WHERE acceso.AccesoGerenteInicialId = @AccesoId;

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

    private static CuentaGerenteInicialDto MapCuenta(SqlDataReader reader)
    {
        return new CuentaGerenteInicialDto(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetDateTime(5),
            reader.IsDBNull(6) ? null : reader.GetDateTime(6)
        );
    }
}
