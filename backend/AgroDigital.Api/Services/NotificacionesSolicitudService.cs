using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace AgroDigital.Api.Services;

/// <summary>
/// Avisos por correo de las solicitudes de acceso a un grupo de gestion
/// (27_notificaciones_solicitudes.sql):
///   - NuevaSolicitud:     al Gerente, cuando llega una solicitud.
///   - SolicitudAprobada:  al empleado, con su rol en cada empresa.
///   - SolicitudRechazada: al empleado.
///
/// Nunca lanza excepcion: un correo que no sale no puede deshacer la solicitud
/// ni la aprobacion. Cada intento queda en dbo.CorreosEnviados.
/// </summary>
public interface INotificacionesSolicitudService
{
    Task<bool> NotificarNuevaSolicitudAsync(int solicitudId);
    Task<bool> NotificarSolicitudAprobadaAsync(int solicitudId, int gerenteUsuarioId);
    Task<bool> NotificarSolicitudRechazadaAsync(int solicitudId, int gerenteUsuarioId);
}

public sealed class NotificacionesSolicitudService(
    IConfiguration configuration,
    IEmailService emailService,
    IOptions<EmailSettings> emailSettings,
    ILogger<NotificacionesSolicitudService> logger) : INotificacionesSolicitudService
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private string UrlAplicacion => emailSettings.Value.UrlAplicacion.TrimEnd('/') + "/";

    public async Task<bool> NotificarNuevaSolicitudAsync(int solicitudId)
    {
        try
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var datos = await ObtenerDatosAsync(connection, solicitudId);
            if (datos is null || string.IsNullOrWhiteSpace(datos.CorreoGerente)) return false;

            var correo = PlantillasCorreo.NuevaSolicitud(datos.NombreGerente, datos.NombreSolicitante, datos.CorreoSolicitante, UrlAplicacion);
            return await EnviarYRegistrarAsync(connection, "NuevaSolicitud", datos.CorreoGerente, datos.NombreGerente, correo, solicitudId, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo notificar la nueva solicitud {SolicitudId}.", solicitudId);
            return false;
        }
    }

    public async Task<bool> NotificarSolicitudAprobadaAsync(int solicitudId, int gerenteUsuarioId)
    {
        try
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var datos = await ObtenerDatosAsync(connection, solicitudId);
            if (datos is null || datos.UsuarioId is null) return false;

            var accesos = await ObtenerAccesosAsync(connection, datos.UsuarioId.Value, datos.GrupoGestionId);
            var correo = PlantillasCorreo.SolicitudAprobada(
                datos.NombrePila, datos.NombreGerente, accesos, datos.CorreoSolicitante, UrlAplicacion);

            return await EnviarYRegistrarAsync(connection, "SolicitudAprobada", datos.CorreoSolicitante, datos.NombreSolicitante, correo, solicitudId, gerenteUsuarioId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo notificar la aprobacion de la solicitud {SolicitudId}.", solicitudId);
            return false;
        }
    }

    public async Task<bool> NotificarSolicitudRechazadaAsync(int solicitudId, int gerenteUsuarioId)
    {
        try
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var datos = await ObtenerDatosAsync(connection, solicitudId);
            if (datos is null) return false;

            var correo = PlantillasCorreo.SolicitudRechazada(datos.NombrePila, datos.NombreGerente);
            return await EnviarYRegistrarAsync(connection, "SolicitudRechazada", datos.CorreoSolicitante, datos.NombreSolicitante, correo, solicitudId, gerenteUsuarioId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo notificar el rechazo de la solicitud {SolicitudId}.", solicitudId);
            return false;
        }
    }

    // =====================================================================

    private sealed record DatosSolicitud(
        int GrupoGestionId,
        int? UsuarioId,
        string NombrePila,
        string NombreSolicitante,
        string CorreoSolicitante,
        string NombreGerente,
        string? CorreoGerente);

    private static async Task<DatosSolicitud?> ObtenerDatosAsync(SqlConnection connection, int solicitudId)
    {
        const string sql = """
            SELECT
                s.GrupoGestionId,
                s.UsuarioId,
                s.Nombre,
                LTRIM(RTRIM(CONCAT(s.Nombre, N' ', s.Apellido))) AS Solicitante,
                s.CorreoElectronico,
                LTRIM(RTRIM(CONCAT(gerente.Nombre, N' ', gerente.Apellido))) AS Gerente,
                gerente.CorreoElectronico AS CorreoGerente
            FROM dbo.SolicitudesUsuario AS s
            INNER JOIN dbo.GruposGestion AS g ON g.GrupoGestionId = s.GrupoGestionId
            INNER JOIN dbo.Usuarios AS gerente ON gerente.UsuarioId = g.GerenteUsuarioId
            WHERE s.SolicitudUsuarioId = @SolicitudId;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SolicitudId", solicitudId);

        await using var r = await command.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        return new DatosSolicitud(
            r.GetInt32(0),
            r.IsDBNull(1) ? null : r.GetInt32(1),
            r.GetString(2),
            r.GetString(3),
            r.GetString(4),
            r.GetString(5),
            r.IsDBNull(6) ? null : r.GetString(6));
    }

    private static async Task<IReadOnlyList<(string Empresa, string Rol)>> ObtenerAccesosAsync(SqlConnection connection, int usuarioId, int grupoGestionId)
    {
        const string sql = """
            SELECT e.Nombre, ue.Rol
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            WHERE ue.UsuarioId = @UsuarioId
              AND e.GrupoGestionId = @GrupoGestionId
              AND ue.Activo = 1
              AND e.Activo = 1
            ORDER BY e.Nombre;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);

        var accesos = new List<(string Empresa, string Rol)>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            accesos.Add((r.GetString(0), NombreRol(r.GetString(1))));
        }

        return accesos;
    }

    private static string NombreRol(string rol) => rol switch
    {
        "EmpleadoCampo" => "Empleado de campo",
        "EmpleadoAdministrativo" => "Empleado administrativo",
        _ => rol
    };

    private async Task<bool> EnviarYRegistrarAsync(
        SqlConnection connection, string tipo, string destinatario, string nombreDestinatario,
        CorreoArmado correo, int solicitudId, int? enviadoPorUsuarioId)
    {
        var resultado = await emailService.EnviarAsync(destinatario, nombreDestinatario, correo.Asunto, correo.Html, correo.Texto);

        const string sql = """
            INSERT INTO dbo.CorreosEnviados
                (Tipo, Destinatario, Asunto, Estado, Error, ReferenciaTipo, ReferenciaId, EnviadoPorUsuarioId)
            VALUES
                (@Tipo, @Destinatario, @Asunto, @Estado, @Error, N'SolicitudUsuario', @SolicitudId,
                 (SELECT UsuarioId FROM dbo.Usuarios WHERE UsuarioId = @EnviadoPor));
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Tipo", tipo);
        command.Parameters.AddWithValue("@Destinatario", destinatario);
        command.Parameters.AddWithValue("@Asunto", correo.Asunto);
        command.Parameters.AddWithValue("@Estado", resultado.Enviado ? "Enviado" : "Error");
        command.Parameters.AddWithValue("@Error", (object?)resultado.Error ?? DBNull.Value);
        command.Parameters.AddWithValue("@SolicitudId", solicitudId);
        command.Parameters.AddWithValue("@EnviadoPor", (object?)enviadoPorUsuarioId ?? DBNull.Value);
        await command.ExecuteNonQueryAsync();

        return resultado.Enviado;
    }
}
