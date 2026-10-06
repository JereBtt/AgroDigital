using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Modulo Estadisticas. Solo lectura, por empresa y periodo. Acceso: Gerente, Encargado y Admin.
/// Sin fechas, el periodo por defecto son los ultimos 6 meses hasta hoy.
/// Errores: 400 fechas invalidas, 403 rol sin permiso, 404 empresa ajena.
/// </summary>
[ApiController]
[Route("api/estadisticas")]
public class EstadisticasController(
    IEstadisticasRepository estadisticasRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    private const int MaximoMeses = 60;

    [HttpGet("almacenamiento")]
    public Task<ActionResult> ObtenerAlmacenamiento(
        [FromQuery] int empresaId, [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, [FromQuery] string? grano) =>
        Ejecutar(empresaId, desde, hasta, async (usuario, d, h) =>
            Ok(await estadisticasRepository.ObtenerAlmacenamientoAsync(empresaId, d, h, grano, usuario.UsuarioId, EsAdmin(usuario))));

    [HttpGet("distribucion")]
    public Task<ActionResult> ObtenerDistribucion(
        [FromQuery] int empresaId, [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, [FromQuery] string? grano) =>
        Ejecutar(empresaId, desde, hasta, async (usuario, d, h) =>
            Ok(await estadisticasRepository.ObtenerDistribucionAsync(empresaId, d, h, grano, usuario.UsuarioId, EsAdmin(usuario))));

    private async Task<ActionResult> Ejecutar(
        int empresaId, DateOnly? desde, DateOnly? hasta,
        Func<AuthenticatedUser, DateOnly, DateOnly, Task<ActionResult>> accion)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (empresaId <= 0) return BadRequest("Debe indicar la empresa.");

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var h = hasta ?? hoy;
        var d = desde ?? h.AddMonths(-6).AddDays(1);

        if (d > h) return BadRequest("La fecha Desde no puede ser posterior a Hasta.");
        if (d < h.AddMonths(-MaximoMeses)) return BadRequest($"El periodo admite hasta {MaximoMeses / 12} anios.");

        try
        {
            return await accion(usuario, d, h);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
    }

    private static bool EsAdmin(AuthenticatedUser usuario) => usuario.Rol == "Admin";

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
