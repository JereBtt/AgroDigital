using AgroDigital.Api.Models;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public sealed class AuthRepository(IConfiguration configuration) : IAuthRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<UsuarioLogin?> ObtenerPorUsuarioAsync(string usuario)
    {
        const string sql = """
            SELECT UsuarioId, Usuario, PasswordHash, Rol, Nombre, Apellido, Telefono, CorreoElectronico, DebeCambiarPassword, Activo
            FROM dbo.Usuarios
            WHERE Usuario = @Usuario;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Usuario", usuario.Trim());

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return MapUsuario(reader);
    }

    public async Task<UsuarioLogin?> ObtenerPorIdAsync(int usuarioId)
    {
        const string sql = """
            SELECT UsuarioId, Usuario, PasswordHash, Rol, Nombre, Apellido, Telefono, CorreoElectronico, DebeCambiarPassword, Activo
            FROM dbo.Usuarios
            WHERE UsuarioId = @UsuarioId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return MapUsuario(reader);
    }

    public async Task<UsuarioLogin?> ActualizarPerfilAsync(int usuarioId, string nombre, string apellido, string telefono, string correoElectronico)
    {
        const string sql = """
            IF EXISTS (
                SELECT 1
                FROM dbo.Usuarios
                WHERE UsuarioId <> @UsuarioId
                  AND (Usuario = @CorreoElectronico OR CorreoElectronico = @CorreoElectronico)
            )
            BEGIN
                SELECT CAST(0 AS BIT) AS PerfilActualizado;
                RETURN;
            END;

            UPDATE dbo.Usuarios
            SET
                Usuario = CASE WHEN Rol = N'Admin' THEN Usuario ELSE @CorreoElectronico END,
                Nombre = @Nombre,
                Apellido = @Apellido,
                Telefono = @Telefono,
                CorreoElectronico = @CorreoElectronico,
                FechaModificacion = SYSDATETIME()
            WHERE UsuarioId = @UsuarioId
              AND Activo = 1;

            IF @@ROWCOUNT = 0
            BEGIN
                SELECT CAST(0 AS BIT) AS PerfilActualizado;
                RETURN;
            END;

            SELECT UsuarioId, Usuario, PasswordHash, Rol, Nombre, Apellido, Telefono, CorreoElectronico, DebeCambiarPassword, Activo
            FROM dbo.Usuarios
            WHERE UsuarioId = @UsuarioId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@Nombre", nombre);
        command.Parameters.AddWithValue("@Apellido", apellido);
        command.Parameters.AddWithValue("@Telefono", telefono);
        command.Parameters.AddWithValue("@CorreoElectronico", correoElectronico);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync() || reader.FieldCount == 1)
        {
            return null;
        }

        return MapUsuario(reader);
    }

    public async Task<bool> ActualizarPasswordAsync(int usuarioId, string passwordHash)
    {
        const string sql = """
            UPDATE dbo.Usuarios
            SET PasswordHash = @PasswordHash,
                FechaModificacion = SYSDATETIME()
            WHERE UsuarioId = @UsuarioId
              AND Activo = 1;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@PasswordHash", passwordHash);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<UsuarioLogin?> CompletarRegistroGerenteAsync(
        int usuarioId,
        string nombre,
        string apellido,
        string telefono,
        string correoElectronico,
        string passwordHash,
        IReadOnlyList<string> empresas,
        string grupoGestionCodigo)
    {
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            DECLARE @AccesoId INT;

            SELECT TOP (1) @AccesoId = AccesoGerenteInicialId
            FROM dbo.AccesosGerenteIniciales
            WHERE UsuarioId = @UsuarioId
              AND Estado = N'Pendiente de primer ingreso'
              AND (FechaVencimiento IS NULL OR FechaVencimiento >= SYSUTCDATETIME());

            IF @AccesoId IS NULL
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            UPDATE dbo.Usuarios
            SET
                Usuario = @CorreoElectronico,
                PasswordHash = @PasswordHash,
                Nombre = @Nombre,
                Apellido = @Apellido,
                Telefono = @Telefono,
                CorreoElectronico = @CorreoElectronico,
                DebeCambiarPassword = 0,
                FechaModificacion = SYSDATETIME()
            WHERE UsuarioId = @UsuarioId
              AND Rol = N'Gerente'
              AND DebeCambiarPassword = 1
              AND Activo = 1;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            INSERT INTO dbo.GruposGestion (Codigo, GerenteUsuarioId, Nombre)
            VALUES (@GrupoGestionCodigo, @UsuarioId, CONCAT(N'Grupo de ', @Nombre, N' ', @Apellido));

            DECLARE @GrupoGestionId INT = SCOPE_IDENTITY();
            DECLARE @EmpresaPrincipalId INT = NULL;

            INSERT INTO dbo.Empresas (GrupoGestionId, Nombre)
            SELECT @GrupoGestionId, TRIM(value)
            FROM STRING_SPLIT(@Empresas, N'|')
            WHERE LEN(TRIM(value)) > 0;

            SELECT TOP (1) @EmpresaPrincipalId = EmpresaId
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId
            ORDER BY EmpresaId;

            INSERT INTO dbo.UsuarioEmpresas (UsuarioId, EmpresaId, Rol)
            SELECT @UsuarioId, EmpresaId, N'Gerente'
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId;

            UPDATE dbo.Usuarios
            SET EmpresaPrincipalId = @EmpresaPrincipalId
            WHERE UsuarioId = @UsuarioId;

            UPDATE dbo.AccesosGerenteIniciales
            SET
                Estado = N'Usado',
                GrupoGestion = @GrupoGestionCodigo,
                FechaUso = SYSDATETIME(),
                FechaModificacion = SYSDATETIME()
            WHERE AccesoGerenteInicialId = @AccesoId;

            SELECT UsuarioId, Usuario, PasswordHash, Rol, Nombre, Apellido, Telefono, CorreoElectronico, DebeCambiarPassword, Activo
            FROM dbo.Usuarios
            WHERE UsuarioId = @UsuarioId;

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@Nombre", nombre);
        command.Parameters.AddWithValue("@Apellido", apellido);
        command.Parameters.AddWithValue("@Telefono", telefono);
        command.Parameters.AddWithValue("@CorreoElectronico", correoElectronico);
        command.Parameters.AddWithValue("@PasswordHash", passwordHash);
        command.Parameters.AddWithValue("@Empresas", string.Join('|', empresas));
        command.Parameters.AddWithValue("@GrupoGestionCodigo", grupoGestionCodigo);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return MapUsuario(reader);
    }

    private static UsuarioLogin MapUsuario(SqlDataReader reader)
    {
        return new UsuarioLogin
        {
            UsuarioId = reader.GetInt32(0),
            Usuario = reader.GetString(1),
            PasswordHash = reader.GetString(2),
            Rol = reader.GetString(3),
            Nombre = reader.GetString(4),
            Apellido = reader.IsDBNull(5) ? null : reader.GetString(5),
            Telefono = reader.IsDBNull(6) ? null : reader.GetString(6),
            CorreoElectronico = reader.IsDBNull(7) ? null : reader.GetString(7),
            DebeCambiarPassword = reader.GetBoolean(8),
            Activo = reader.GetBoolean(9)
        };
    }
}
