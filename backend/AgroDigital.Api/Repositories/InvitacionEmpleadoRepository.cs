using System.Data;
using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

/// <summary>Grupo del Gerente que invita, con los datos que se muestran en el correo.</summary>
public sealed record GrupoInvitacion(int GrupoGestionId, string Codigo, string NombreGerente, string? Empresas);

/// <summary>Por que no se puede invitar a un correo (o Libre si se puede).</summary>
public enum SituacionCorreoInvitacion
{
    Libre,
    YaEsMiembro,
    SolicitudPendiente,
    InvitacionVigente
}

public interface IInvitacionEmpleadoRepository
{
    Task<GrupoInvitacion?> ObtenerGrupoDelGerenteAsync(int gerenteUsuarioId);
    Task<IReadOnlyList<InvitacionEmpleadoDto>> ListarPendientesAsync(int grupoGestionId);
    Task<InvitacionEmpleadoDto?> ObtenerAsync(int invitacionId, int grupoGestionId);
    Task<SituacionCorreoInvitacion> ObtenerSituacionCorreoAsync(int grupoGestionId, string correo);

    Task<InvitacionEmpleadoDto> CrearAsync(
        int grupoGestionId, int gerenteUsuarioId, string correo, string? nombre, string otpHash, DateTime vencimientoUtc);

    Task<InvitacionEmpleadoDto?> RenovarAsync(int invitacionId, int grupoGestionId, string otpHash, DateTime vencimientoUtc);
    Task<bool> CancelarAsync(int invitacionId, int grupoGestionId);

    Task<InvitacionEmpleadoDto?> RegistrarEnvioAsync(
        int invitacionId, string destinatario, string asunto, bool enviado, string? error, int gerenteUsuarioId);
}

/*
    Invitaciones de empleados por correo (26_invitaciones_empleado_correo.sql).
    Cada invitacion es una fila de dbo.GrupoGestionOtps con CorreoInvitado.
    Las fechas de esa tabla se guardan en UTC (SYSUTCDATETIME).
*/
public sealed class InvitacionEmpleadoRepository(IConfiguration configuration) : IInvitacionEmpleadoRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string Columnas = """
            otp.GrupoGestionOtpId,
            otp.CorreoInvitado,
            otp.NombreInvitado,
            otp.FechaCreacion,
            otp.FechaVencimiento,
            CAST(CASE WHEN otp.FechaVencimiento < SYSUTCDATETIME() THEN 1 ELSE 0 END AS BIT) AS Vencida,
            otp.EstadoEnvio,
            otp.FechaUltimoEnvio,
            otp.CantidadEnvios
        """;

    private const string SelectPorId = """
            SELECT
        """ + Columnas + """

            FROM dbo.GrupoGestionOtps AS otp
            WHERE otp.GrupoGestionOtpId = @InvitacionId
              AND otp.GrupoGestionId = @GrupoGestionId
              AND otp.CorreoInvitado IS NOT NULL;
        """;

    public async Task<GrupoInvitacion?> ObtenerGrupoDelGerenteAsync(int gerenteUsuarioId)
    {
        const string sql = """
            SELECT TOP (1)
                g.GrupoGestionId,
                g.Codigo,
                LTRIM(RTRIM(CONCAT(u.Nombre, N' ', u.Apellido))) AS NombreGerente,
                (SELECT STRING_AGG(e.Nombre, N', ') WITHIN GROUP (ORDER BY e.Nombre)
                 FROM dbo.Empresas AS e
                 WHERE e.GrupoGestionId = g.GrupoGestionId AND e.Activo = 1) AS Empresas
            FROM dbo.GruposGestion AS g
            INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = g.GerenteUsuarioId
            WHERE g.GerenteUsuarioId = @UsuarioId AND g.Activo = 1
            ORDER BY g.GrupoGestionId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", gerenteUsuarioId);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;

        return new GrupoInvitacion(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3));
    }

    public async Task<IReadOnlyList<InvitacionEmpleadoDto>> ListarPendientesAsync(int grupoGestionId)
    {
        // Pendientes y vencidas. Las usadas ya aparecen como solicitud; las canceladas no interesan.
        const string sql = """
            SELECT
            """ + Columnas + """

            FROM dbo.GrupoGestionOtps AS otp
            WHERE otp.GrupoGestionId = @GrupoGestionId
              AND otp.CorreoInvitado IS NOT NULL
              AND otp.Activo = 1
              AND otp.Usado = 0
            ORDER BY otp.FechaCreacion DESC, otp.GrupoGestionOtpId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);

        var lista = new List<InvitacionEmpleadoDto>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            lista.Add(Map(reader));
        }

        return lista;
    }

    public async Task<InvitacionEmpleadoDto?> ObtenerAsync(int invitacionId, int grupoGestionId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(SelectPorId, connection);
        command.Parameters.AddWithValue("@InvitacionId", invitacionId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? Map(reader) : null;
    }

    public async Task<SituacionCorreoInvitacion> ObtenerSituacionCorreoAsync(int grupoGestionId, string correo)
    {
        const string sql = """
            SELECT CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM dbo.UsuarioEmpresas AS ue
                    INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
                    INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = ue.UsuarioId
                    WHERE e.GrupoGestionId = @GrupoGestionId
                      AND ue.Activo = 1
                      AND (u.CorreoElectronico = @Correo OR u.Usuario = @Correo))
                    THEN 1
                WHEN EXISTS (
                    SELECT 1 FROM dbo.SolicitudesUsuario
                    WHERE GrupoGestionId = @GrupoGestionId
                      AND CorreoElectronico = @Correo
                      AND Estado = N'Pendiente')
                    THEN 2
                WHEN EXISTS (
                    SELECT 1 FROM dbo.GrupoGestionOtps
                    WHERE GrupoGestionId = @GrupoGestionId
                      AND CorreoInvitado = @Correo
                      AND Activo = 1
                      AND Usado = 0
                      AND FechaVencimiento >= SYSUTCDATETIME())
                    THEN 3
                ELSE 0
            END;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.Add("@Correo", SqlDbType.NVarChar, 180).Value = correo;

        return Convert.ToInt32(await command.ExecuteScalarAsync()) switch
        {
            1 => SituacionCorreoInvitacion.YaEsMiembro,
            2 => SituacionCorreoInvitacion.SolicitudPendiente,
            3 => SituacionCorreoInvitacion.InvitacionVigente,
            _ => SituacionCorreoInvitacion.Libre
        };
    }

    public async Task<InvitacionEmpleadoDto> CrearAsync(
        int grupoGestionId, int gerenteUsuarioId, string correo, string? nombre, string otpHash, DateTime vencimientoUtc)
    {
        // Las invitaciones vencidas al mismo correo se desactivan: queda una sola por persona.
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE dbo.GrupoGestionOtps
            SET Activo = 0
            WHERE GrupoGestionId = @GrupoGestionId
              AND CorreoInvitado = @Correo
              AND Activo = 1
              AND Usado = 0;

            DECLARE @Nueva TABLE (Id INT);

            INSERT INTO dbo.GrupoGestionOtps
                (GrupoGestionId, GeneradoPorUsuarioId, CodigoOtpHash, FechaVencimiento,
                 CorreoInvitado, NombreInvitado, EstadoEnvio)
            OUTPUT INSERTED.GrupoGestionOtpId INTO @Nueva (Id)
            VALUES
                (@GrupoGestionId, @GerenteUsuarioId, @OtpHash, @FechaVencimiento,
                 @Correo, @Nombre, N'Pendiente');

            DECLARE @InvitacionId INT = (SELECT TOP (1) Id FROM @Nueva);

            """ + SelectPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.AddWithValue("@GerenteUsuarioId", gerenteUsuarioId);
        command.Parameters.AddWithValue("@OtpHash", otpHash);
        command.Parameters.AddWithValue("@FechaVencimiento", vencimientoUtc);
        command.Parameters.Add("@Correo", SqlDbType.NVarChar, 160).Value = correo;
        command.Parameters.Add("@Nombre", SqlDbType.NVarChar, 150).Value = (object?)nombre ?? DBNull.Value;

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("No se pudo crear la invitación.");
        }

        return Map(reader);
    }

    public async Task<InvitacionEmpleadoDto?> RenovarAsync(int invitacionId, int grupoGestionId, string otpHash, DateTime vencimientoUtc)
    {
        // Reemplaza el hash: la OTP enviada antes deja de funcionar.
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            UPDATE dbo.GrupoGestionOtps
            SET CodigoOtpHash = @OtpHash,
                FechaVencimiento = @FechaVencimiento,
                EstadoEnvio = N'Pendiente'
            WHERE GrupoGestionOtpId = @InvitacionId
              AND GrupoGestionId = @GrupoGestionId
              AND CorreoInvitado IS NOT NULL
              AND Activo = 1
              AND Usado = 0;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;
                RETURN;
            END;

            """ + SelectPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@InvitacionId", invitacionId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.AddWithValue("@OtpHash", otpHash);
        command.Parameters.AddWithValue("@FechaVencimiento", vencimientoUtc);

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? Map(reader) : null;
    }

    public async Task<bool> CancelarAsync(int invitacionId, int grupoGestionId)
    {
        const string sql = """
            UPDATE dbo.GrupoGestionOtps
            SET Activo = 0
            WHERE GrupoGestionOtpId = @InvitacionId
              AND GrupoGestionId = @GrupoGestionId
              AND CorreoInvitado IS NOT NULL
              AND Activo = 1
              AND Usado = 0;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@InvitacionId", invitacionId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<InvitacionEmpleadoDto?> RegistrarEnvioAsync(
        int invitacionId, string destinatario, string asunto, bool enviado, string? error, int gerenteUsuarioId)
    {
        const string sql = """
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;

            DECLARE @GrupoGestionId INT = (
                SELECT GrupoGestionId FROM dbo.GrupoGestionOtps WHERE GrupoGestionOtpId = @InvitacionId);

            INSERT INTO dbo.CorreosEnviados
                (Tipo, Destinatario, Asunto, Estado, Error, ReferenciaTipo, ReferenciaId, EnviadoPorUsuarioId)
            VALUES
                (N'InvitacionEmpleado', @Destinatario, @Asunto, @Estado, @Error, N'GrupoGestionOtp', @InvitacionId, @GerenteUsuarioId);

            UPDATE dbo.GrupoGestionOtps
            SET EstadoEnvio = @Estado,
                FechaUltimoEnvio = SYSUTCDATETIME(),
                CantidadEnvios = CantidadEnvios + 1
            WHERE GrupoGestionOtpId = @InvitacionId;

            """ + SelectPorId + """

            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@InvitacionId", invitacionId);
        command.Parameters.Add("@Destinatario", SqlDbType.NVarChar, 160).Value = destinatario;
        command.Parameters.Add("@Asunto", SqlDbType.NVarChar, 200).Value = asunto;
        command.Parameters.Add("@Estado", SqlDbType.NVarChar, 20).Value = enviado ? "Enviado" : "Error";
        command.Parameters.Add("@Error", SqlDbType.NVarChar, 500).Value = (object?)error ?? DBNull.Value;
        command.Parameters.AddWithValue("@GerenteUsuarioId", gerenteUsuarioId);

        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? Map(reader) : null;
    }

    private static DateTime Utc(DateTime valor) => DateTime.SpecifyKind(valor, DateTimeKind.Utc);

    private static InvitacionEmpleadoDto Map(SqlDataReader r) => new(
        r.GetInt32(0),
        r.GetString(1),
        r.IsDBNull(2) ? null : r.GetString(2),
        Utc(r.GetDateTime(3)),
        Utc(r.GetDateTime(4)),
        r.GetBoolean(5) ? "Vencida" : "Pendiente",
        r.IsDBNull(6) ? null : r.GetString(6),
        r.IsDBNull(7) ? null : Utc(r.GetDateTime(7)),
        r.GetInt32(8));
}
