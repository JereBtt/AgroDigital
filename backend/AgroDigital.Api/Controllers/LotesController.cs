using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LotesController(ILoteRepository loteRepository, IAuthTokenService authTokenService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LoteDto>>> ObtenerTodos()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var lotes = await loteRepository.ObtenerTodosAsync(usuario.UsuarioId, usuario.Rol == "Admin");
        return Ok(lotes);
    }

    [HttpGet("{loteId:int}")]
    public async Task<ActionResult<LoteDto>> ObtenerPorId(int loteId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var lote = await loteRepository.ObtenerPorIdAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
        return lote is null ? NotFound() : Ok(lote);
    }

    [HttpPost]
    public async Task<ActionResult<LoteDto>> Crear(CrearLoteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (request.RegistrarDeshabilitado && ValidarDeshabilitacion(request.Deshabilitacion, allowRecentlyRented: true) is { } errorMotivo) return BadRequest(errorMotivo);
        if (await loteRepository.ExisteNombreAsync(request.Nombre, usuario.UsuarioId, usuario.Rol == "Admin"))
        {
            return Conflict("Ya existe un lote registrado con ese nombre. Revisa mayusculas, minusculas o espacios.");
        }

        try
        {
            var lote = await loteRepository.CrearAsync(request, usuario.UsuarioId, usuario.Rol == "Admin");
            return CreatedAtAction(nameof(ObtenerPorId), new { loteId = lote.LoteId }, lote);
        }
        catch (LoteSuperpuestoException exception)
        {
            return Conflict(exception.Message);
        }
        catch (LoteDeshabilitacionBloqueadaException exception)
        {
            return BadRequest(exception.Message);
        }
    }

    [HttpPost("validar-registro")]
    public async Task<IActionResult> ValidarRegistro(CrearLoteRequest request, [FromQuery] int? excluirLoteId = null)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (await loteRepository.ExisteNombreAsync(request.Nombre, usuario.UsuarioId, usuario.Rol == "Admin", excluirLoteId))
        {
            return Conflict("Ya existe un lote registrado con ese nombre. Revisa mayusculas, minusculas o espacios.");
        }

        var loteSuperpuesto = await loteRepository.ObtenerSuperposicionAsync(request.Coordenadas, usuario.UsuarioId, usuario.Rol == "Admin", excluirLoteId);
        return loteSuperpuesto is null
            ? NoContent()
            : Conflict(LoteSuperpuestoException.CrearMensaje(loteSuperpuesto));
    }

    [HttpPut("{loteId:int}")]
    public async Task<IActionResult> Actualizar(int loteId, ActualizarLoteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (await loteRepository.ExisteNombreAsync(request.Nombre, usuario.UsuarioId, usuario.Rol == "Admin", loteId))
        {
            return Conflict("Ya existe otro lote registrado con ese nombre. Revisa mayusculas, minusculas o espacios.");
        }

        try
        {
            var loteActual = await loteRepository.ObtenerPorIdAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
            if (loteActual is null) return NotFound();
            if (request.Activo != loteActual.Activo) return BadRequest("Para cambiar la habilitación del lote utilizá la acción correspondiente.");
            var actualizado = await loteRepository.ActualizarAsync(loteId, request, usuario.UsuarioId, usuario.Rol == "Admin");
            return actualizado ? NoContent() : NotFound();
        }
        catch (LoteSuperpuestoException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpPost("{loteId:int}/deshabilitar")]
    public async Task<IActionResult> Deshabilitar(int loteId, DeshabilitarLoteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (ValidarDeshabilitacion(request, allowRecentlyRented: true) is { } errorMotivo) return BadRequest(errorMotivo);
        try
        {
            var actualizado = await loteRepository.CambiarEstadoAsync(loteId, false, usuario.UsuarioId, usuario.Rol == "Admin", request);
            return actualizado ? Ok(new { mensaje = "Lote deshabilitado correctamente." }) : NotFound();
        }
        catch (LoteDeshabilitacionBloqueadaException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpGet("{loteId:int}/deshabilitacion")]
    public async Task<IActionResult> ConsultarDeshabilitacion(int loteId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var lote = await loteRepository.ObtenerPorIdAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (lote is null) return NotFound();
        var bloqueo = await loteRepository.ObtenerBloqueoDeshabilitacionAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
        var periodo = await loteRepository.ObtenerPeriodoDeshabilitacionAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
        var permiteAlquiladoRecientemente = await loteRepository.PuedeDeshabilitarPorAlquilerRecienteAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
        return Ok(new { bloqueo, periodo, permiteAlquiladoRecientemente });
    }

    [HttpPost("{loteId:int}/habilitar")]
    public async Task<IActionResult> Habilitar(int loteId, [FromBody] HabilitarLoteRequest? request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        try
        {
            var actualizado = await loteRepository.HabilitarAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin", request?.Modo);
            return actualizado ? Ok(new { mensaje = "Lote habilitado correctamente." }) : NotFound();
        }
        catch (LoteDeshabilitacionBloqueadaException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpGet("{loteId:int}/habilitacion")]
    public async Task<ActionResult<HabilitacionLoteDto>> ConsultarHabilitacion(int loteId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var contexto = await loteRepository.ObtenerHabilitacionAsync(loteId, usuario.UsuarioId, usuario.Rol == "Admin");
        return contexto is null ? NotFound() : Ok(contexto);
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

    private static string? ValidarDeshabilitacion(DeshabilitarLoteRequest? request, bool allowRecentlyRented = false)
    {
        if (request is null) return "Seleccioná un motivo para deshabilitar el lote.";
        if (request.Motivo == "Alquilado recientemente" && !allowRecentlyRented)
            return "Alquilado recientemente solo corresponde al registro de un lote nuevo durante una campaña.";
        if (request.Motivo is not ("Alquilado recientemente" or "Fin de alquiler" or "Siniestro" or "Otro motivo"))
            return "Seleccioná un motivo válido para deshabilitar el lote.";
        if (request.Motivo == "Otro motivo" && string.IsNullOrWhiteSpace(request.Detalle))
            return "Describí el otro motivo de deshabilitación.";
        if (request.Motivo != "Otro motivo" && !string.IsNullOrWhiteSpace(request.Detalle))
            return "El detalle solo corresponde a Otro motivo.";
        if (request.Motivo == "Siniestro")
        {
            if (request.Siniestro is null || !SiniestroCatalogo.Valores.Contains(request.Siniestro))
                return "Seleccioná un tipo de siniestro válido.";
            if (request.FechaSiniestro is null)
                return "Indicá la fecha del siniestro.";
        }
        else if (request.Siniestro is not null || request.FechaSiniestro is not null)
            return "Los datos de siniestro solo corresponden al motivo Siniestro.";
        return null;
    }
}
