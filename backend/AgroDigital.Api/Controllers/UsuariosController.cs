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
