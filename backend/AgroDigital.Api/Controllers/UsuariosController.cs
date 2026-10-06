using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsuariosController(IConfiguration configuration, IAuthTokenService authTokenService) : ControllerBase
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    [HttpGet("resumen")]
    public async Task<ActionResult<IReadOnlyList<UsuarioResumenDto>>> ObtenerResumen()
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        const string sql = """
            SELECT UsuarioId, Nombre, Apellido, Rol
            FROM dbo.Usuarios
            WHERE Activo = 1
            ORDER BY Nombre, Apellido;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var usuarios = new List<UsuarioResumenDto>();
        while (await reader.ReadAsync())
        {
            usuarios.Add(new UsuarioResumenDto
            {
                UsuarioId = reader.GetInt32(0),
                Nombre = reader.GetString(1),
                Apellido = reader.IsDBNull(2) ? null : reader.GetString(2),
                Rol = reader.GetString(3)
            });
        }

        return Ok(usuarios);
    }

    /// <summary>
    /// Empresas activas del usuario logueado, con su rol en cada una. Lo usa el selector de
    /// empresa del frontend para los roles que no son Gerente (el Gerente usa api/manager/contexto,
    /// que devuelve las empresas de su grupo de gestion).
    /// </summary>
    [HttpGet("mis-empresas")]
    public async Task<ActionResult<IReadOnlyList<MiEmpresaDto>>> ObtenerMisEmpresas()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        const string sql = """
            SELECT e.EmpresaId, e.Nombre,
                   CAST(CASE WHEN u.EmpresaPrincipalId = e.EmpresaId THEN 1 ELSE 0 END AS BIT) AS EsPrincipal,
                   e.Activo, ue.Rol
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = ue.UsuarioId
            WHERE ue.UsuarioId = @UsuarioId
              AND ue.Activo = 1
              AND e.Activo = 1
            ORDER BY CASE WHEN u.EmpresaPrincipalId = e.EmpresaId THEN 0 ELSE 1 END, e.Nombre;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
        await using var reader = await command.ExecuteReaderAsync();

        var empresas = new List<MiEmpresaDto>();
        while (await reader.ReadAsync())
        {
            empresas.Add(new MiEmpresaDto(
                reader.GetInt32(0),
                reader.GetString(1),
                reader.GetBoolean(2),
                reader.GetBoolean(3),
                reader.GetString(4)));
        }

        return Ok(empresas);
    }

    private bool TryGetAuthenticatedUser(out AuthenticatedUser usuario, out ActionResult error)
    {
        usuario = null!;
        error = Unauthorized("Sesion no valida.");

        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;

        var token = header["Bearer ".Length..].Trim();
        if (!authTokenService.TryValidate(token, out var authenticatedUser) || authenticatedUser is null) return false;

        usuario = authenticatedUser;
        error = Ok();
        return true;
    }
}
