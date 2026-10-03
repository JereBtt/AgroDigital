using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Modulo Usuarios para los roles que NO son Gerente. Solo consulta.
///
///   GET api/equipo/mi-acceso   cualquier usuario: su grupo, su gerente, sus empresas y su rol en cada una.
///   GET api/equipo/usuarios    solo Encargado: el equipo de las empresas donde es Encargado
///                              (Manual de Usuario: el Encargado tiene permiso de consulta en Usuarios).
///
/// La gestion (invitar, aprobar, deshabilitar) sigue siendo exclusiva del Gerente (ManagerController).
/// </summary>
[ApiController]
[Route("api/equipo")]
public sealed class EquipoController(IConfiguration configuration, IAuthTokenService authTokenService) : ControllerBase
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    [HttpGet("mi-acceso")]
    public async Task<ActionResult<MiAccesoDto>> ObtenerMiAcceso()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        const string sql = """
            SELECT
                LTRIM(RTRIM(CONCAT(u.Nombre, N' ', u.Apellido))) AS Nombre,
                ISNULL(u.CorreoElectronico, u.Usuario) AS Correo,
                u.Rol AS RolGeneral,
                g.GrupoGestionId,
                g.Codigo,
                g.Nombre AS Grupo,
                LTRIM(RTRIM(CONCAT(gerente.Nombre, N' ', gerente.Apellido))) AS Gerente,
                gerente.CorreoElectronico AS GerenteCorreo,
                e.EmpresaId,
                e.Nombre AS Empresa,
                ue.Rol,
                CAST(CASE WHEN u.EmpresaPrincipalId = e.EmpresaId THEN 1 ELSE 0 END AS BIT) AS EsPrincipal
            FROM dbo.Usuarios AS u
            LEFT JOIN dbo.UsuarioEmpresas AS ue ON ue.UsuarioId = u.UsuarioId AND ue.Activo = 1
            LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId AND e.Activo = 1
            LEFT JOIN dbo.GruposGestion AS g ON g.GrupoGestionId = e.GrupoGestionId AND g.Activo = 1
            LEFT JOIN dbo.Usuarios AS gerente ON gerente.UsuarioId = g.GerenteUsuarioId
            WHERE u.UsuarioId = @UsuarioId
            ORDER BY g.Nombre, CASE WHEN u.EmpresaPrincipalId = e.EmpresaId THEN 0 ELSE 1 END, e.Nombre;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
        await using var r = await command.ExecuteReaderAsync();

        string? nombre = null, correo = null, rolGeneral = null;
        var grupos = new List<(int Id, string Codigo, string Nombre, string Gerente, string? GerenteCorreo, List<MiEmpresaAccesoDto> Empresas)>();

        while (await r.ReadAsync())
        {
            nombre ??= r.GetString(0);
            correo ??= r.GetString(1);
            rolGeneral ??= r.GetString(2);

            // Fila sin empresa activa o sin grupo activo (LEFT JOIN): no suma accesos.
            if (r.IsDBNull(3) || r.IsDBNull(8)) continue;

            var grupoId = r.GetInt32(3);
            var indice = grupos.FindIndex(g => g.Id == grupoId);
            if (indice < 0)
            {
                grupos.Add((grupoId, r.GetString(4), r.GetString(5), r.GetString(6), r.IsDBNull(7) ? null : r.GetString(7), new List<MiEmpresaAccesoDto>()));
                indice = grupos.Count - 1;
            }

            grupos[indice].Empresas.Add(new MiEmpresaAccesoDto(r.GetInt32(8), r.GetString(9), r.GetString(10), r.GetBoolean(11)));
        }

        if (nombre is null) return NotFound("No se encontró el usuario.");

        var dto = new MiAccesoDto(
            nombre,
            correo!,
            rolGeneral!,
            grupos.Any(g => g.Empresas.Any(e => e.Rol == "Encargado")),
            grupos.Select(g => new MiGrupoDto(g.Id, g.Codigo, g.Nombre, g.Gerente, g.GerenteCorreo, g.Empresas)).ToList());

        return Ok(dto);
    }

    [HttpGet("usuarios")]
    public async Task<ActionResult<IReadOnlyList<ManagerUsuarioDto>>> ObtenerEquipo()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        // Solo las empresas donde quien consulta es Encargado (activo). Se excluye al Gerente,
        // igual que en la lista del Gerente.
        const string sql = """
            WITH EmpresasEncargado AS (
                SELECT ue.EmpresaId
                FROM dbo.UsuarioEmpresas AS ue
                INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
                WHERE ue.UsuarioId = @UsuarioId
                  AND ue.Rol = N'Encargado'
                  AND ue.Activo = 1
                  AND e.Activo = 1
            )
            SELECT
                u.UsuarioId,
                u.Nombre,
                ISNULL(u.Apellido, N'') AS Apellido,
                ISNULL(u.Telefono, N'') AS Telefono,
                ISNULL(u.CorreoElectronico, u.Usuario) AS CorreoElectronico,
                u.Rol,
                u.Activo,
                u.FechaCreacion AS FechaAlta,
                e.EmpresaId,
                e.Nombre AS EmpresaNombre,
                ue.Rol AS RolEmpresa,
                ue.Activo AS AccesoActivo
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = ue.UsuarioId
            WHERE ue.EmpresaId IN (SELECT EmpresaId FROM EmpresasEncargado)
              AND u.Rol IN (N'Encargado', N'EmpleadoCampo', N'EmpleadoAdministrativo')
            ORDER BY u.Activo DESC, u.Nombre, u.Apellido, e.Nombre;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        await using (var check = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
                WHERE ue.UsuarioId = @UsuarioId AND ue.Rol = N'Encargado' AND ue.Activo = 1 AND e.Activo = 1)
            THEN 1 ELSE 0 END;
            """, connection))
        {
            check.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
            if (Convert.ToInt32(await check.ExecuteScalarAsync()) == 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, "Solo el Encargado puede consultar el equipo.");
            }
        }

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
        await using var r = await command.ExecuteReaderAsync();

        var usuarios = new List<(int Id, string Nombre, string Apellido, string Telefono, string Correo, string Rol, bool Activo, DateTime Alta, List<ManagerUsuarioEmpresaDto> Empresas)>();
        while (await r.ReadAsync())
        {
            var id = r.GetInt32(0);
            var indice = usuarios.FindIndex(u => u.Id == id);
            if (indice < 0)
            {
                usuarios.Add((id, r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetString(5), r.GetBoolean(6), r.GetDateTime(7), new List<ManagerUsuarioEmpresaDto>()));
                indice = usuarios.Count - 1;
            }

            usuarios[indice].Empresas.Add(new ManagerUsuarioEmpresaDto(r.GetInt32(8), r.GetString(9), r.GetString(10), r.GetBoolean(11)));
        }

        return Ok(usuarios.Select(u => new ManagerUsuarioDto(
            u.Id, u.Nombre, u.Apellido, u.Telefono, u.Correo, u.Rol,
            u.Empresas.Count > 0 && u.Empresas.All(e => e.Rol == u.Rol),
            u.Activo, u.Alta, u.Empresas)).ToList());
    }

    private bool TryGetAuthenticatedUser(out AuthenticatedUser usuario, out ActionResult error)
    {
        usuario = null!;
        error = Unauthorized("Sesion no valida.");

        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;

        var token = header["Bearer ".Length..].Trim();
        if (!authTokenService.TryValidate(token, out var autenticado) || autenticado is null) return false;

        usuario = autenticado;
        error = Ok();
        return true;
    }
}
