using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Pantalla Principal (Inicio) y Agenda. Solo lectura, por empresa.
/// Acceso: cualquier usuario activo de la empresa; los indicadores agregados
/// solo se devuelven a Gerente y Encargado.
/// Errores: 400 parametros invalidos, 401 sesion no valida, 404 empresa o campania ajena.
/// </summary>
[ApiController]
[Route("api/inicio")]
public class InicioController(
    IInicioRepository inicioRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    private const int DiasAgendaPorDefecto = 30;
    private const int DiasAgendaMaximo = 90;

    /// <summary>
    /// GET api/inicio/resumen?empresaId=1&amp;campaniaId=2
    /// Sin campaniaId toma la campania en curso mas reciente.
    /// </summary>
    [HttpGet("resumen")]
    public Task<ActionResult<InicioResumenDto>> ObtenerResumen([FromQuery] int empresaId, [FromQuery] int? campaniaId) =>
        Ejecutar<InicioResumenDto>(empresaId, async usuario =>
        {
            if (campaniaId is <= 0) return BadRequest("La campaña indicada no es válida.");
            return Ok(await inicioRepository.ObtenerResumenAsync(empresaId, campaniaId, usuario.UsuarioId, EsAdmin(usuario)));
        });

    /// <summary>
    /// GET api/inicio/agenda?empresaId=1&amp;campaniaId=2&amp;dias=30
    /// dias: 1 a 90 (por defecto 30).
    /// </summary>
    [HttpGet("agenda")]
    public Task<ActionResult<InicioAgendaDto>> ObtenerAgenda(
        [FromQuery] int empresaId, [FromQuery] int? campaniaId, [FromQuery] int? dias) =>
        Ejecutar<InicioAgendaDto>(empresaId, async usuario =>
        {
            if (campaniaId is <= 0) return BadRequest("La campaña indicada no es válida.");

            var rango = dias ?? DiasAgendaPorDefecto;
            if (rango < 1 || rango > DiasAgendaMaximo)
            {
                return BadRequest($"El rango de la agenda debe estar entre 1 y {DiasAgendaMaximo} días.");
            }

            return Ok(await inicioRepository.ObtenerAgendaAsync(empresaId, campaniaId, rango, usuario.UsuarioId, EsAdmin(usuario)));
        });

    private async Task<ActionResult<T>> Ejecutar<T>(int empresaId, Func<AuthenticatedUser, Task<ActionResult<T>>> accion)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (empresaId <= 0) return BadRequest("Debe indicar la empresa.");

        try
        {
            return await accion(usuario);
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
