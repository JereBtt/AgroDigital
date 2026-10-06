using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CampaniasController(ICampaniaRepository campaniaRepository, IAuthTokenService authTokenService, IPermisosService permisos) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CampaniaConsultaDto>>> ObtenerConsulta()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var campanias = await campaniaRepository.ObtenerConsultaAsync(usuario.UsuarioId, usuario.Rol == "Admin");
        return Ok(campanias);
    }

    [HttpGet("{campaniaId:int}")]
    public async Task<ActionResult<CampaniaDto>> ObtenerPorId(int campaniaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var campania = await campaniaRepository.ObtenerPorIdAsync(campaniaId, usuario.UsuarioId, usuario.Rol == "Admin");
        return campania is null ? NotFound() : Ok(campania);
    }

    [HttpPost]
    public async Task<ActionResult<CampaniaDto>> Crear(CrearCampaniaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validation = ValidarCampania(request);
        if (validation is not null) return validation;

        // La campania pertenece a la empresa de sus lotes (CampaniaRepository usa el primero).
        await permisos.ExigirAsync(usuario, RecursoOperativo.Lote, request.Combinaciones[0].LoteId, RolesPermiso.Estructura, "registrar campañas");

        try
        {
            var campania = await campaniaRepository.CrearAsync(request, usuario.UsuarioId, usuario.Rol == "Admin");
            return CreatedAtAction(nameof(ObtenerPorId), new { campaniaId = campania.CampaniaId }, campania);
        }
        catch (CampaniaPeriodoDuplicadoException ex)
        {
            return Conflict(new { codigo = "CampaniaPeriodoDuplicado", mensaje = ex.Message });
        }
        catch (CampaniaLotesSinAsociarException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (CampaniaPlanificacionBloqueadaException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPut("{campaniaId:int}")]
    public async Task<IActionResult> Actualizar(int campaniaId, ActualizarCampaniaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validation = ValidarCampania(request, allowEmpty: true);
        if (validation is not null) return validation;

        await permisos.ExigirAsync(usuario, RecursoOperativo.Campania, campaniaId, RolesPermiso.Estructura, "editar campañas");

        try
        {
            var actualizado = await campaniaRepository.ActualizarAsync(campaniaId, request, usuario.UsuarioId, usuario.Rol == "Admin");
            return actualizado ? NoContent() : NotFound();
        }
        catch (CampaniaPeriodoDuplicadoException ex)
        {
            return Conflict(new { codigo = "CampaniaPeriodoDuplicado", mensaje = ex.Message });
        }
        catch (CampaniaLotesSinAsociarException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (CampaniaPlanificacionBloqueadaException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPost("{campaniaId:int}/combinaciones/{combinacionId:int}/retirar")]
    public async Task<IActionResult> RetirarPlanificacion(int campaniaId, int combinacionId, RetirarPlanificacionRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Campania, campaniaId, RolesPermiso.Estructura, "retirar planificaciones");
        if (request.Motivo is not ("Fin de alquiler" or "Siniestro" or "Otro motivo"))
            return BadRequest("Seleccioná un motivo válido.");
        if (request.Motivo == "Otro motivo" && string.IsNullOrWhiteSpace(request.Detalle))
            return BadRequest("Describí el motivo.");
        if (request.Motivo != "Otro motivo" && !string.IsNullOrWhiteSpace(request.Detalle))
            return BadRequest("El detalle solo corresponde a Otro motivo.");
        if (request.Motivo == "Siniestro" && (request.Siniestro is null || !SiniestroCatalogo.Valores.Contains(request.Siniestro) || request.FechaSiniestro is null))
            return BadRequest("Indicá el tipo y la fecha del siniestro.");
        if (request.Motivo != "Siniestro" && (request.Siniestro is not null || request.FechaSiniestro is not null))
            return BadRequest("Los datos de siniestro solo corresponden al motivo Siniestro.");

        try
        {
            var retirado = await campaniaRepository.RetirarPlanificacionAsync(campaniaId, combinacionId, request, usuario.UsuarioId, usuario.Rol == "Admin");
            return retirado ? NoContent() : NotFound();
        }
        catch (CampaniaPlanificacionBloqueadaException ex)
        {
            return Conflict(ex.Message);
        }
    }

    private static ActionResult? ValidarCampania(CrearCampaniaRequest request, bool allowEmpty = false)
    {
        if (request.FechaInicio == default) return new BadRequestObjectResult("La Fecha de Inicio de la campania es obligatoria.");
        if (request.FechaFin == default) return new BadRequestObjectResult("La Fecha tentativa de Fin de la campania es obligatoria.");
        if (request.FechaFin < request.FechaInicio) return new BadRequestObjectResult("La Fecha tentativa de Fin no puede ser anterior a la Fecha de Inicio.");
        if (request.FechaFin.Date < request.FechaInicio.Date.AddMonths(4))
            return new BadRequestObjectResult("La Fecha tentativa de Fin debe ser al menos cuatro meses posterior a la Fecha de Inicio.");

        var (fechaMinima, fechaMaxima) = ObtenerLimitesFechasCampania();
        if (request.FechaInicio.Date < fechaMinima || request.FechaInicio.Date > fechaMaxima)
            return new BadRequestObjectResult($"La Fecha de Inicio debe estar entre {fechaMinima:dd/MM/yyyy} y {fechaMaxima:dd/MM/yyyy}.");
        if (request.FechaFin.Date < fechaMinima || request.FechaFin.Date > fechaMaxima)
            return new BadRequestObjectResult($"La Fecha tentativa de Fin debe estar entre {fechaMinima:dd/MM/yyyy} y {fechaMaxima:dd/MM/yyyy}.");
        if (!allowEmpty && request.Combinaciones.Count == 0) return new BadRequestObjectResult("Debes agregar al menos una combinacion de Lote y Grano.");

        foreach (var omision in request.OmisionesVerano)
        {
            if (omision.LoteId <= 0) return new BadRequestObjectResult("Seleccioná el lote de la omisión de Verano.");
            if (ValidarMotivoOmisionVerano(omision) is { } errorOmision)
                return new BadRequestObjectResult(errorOmision);
        }

        var lotesPorCiclo = new HashSet<(int LoteId, string Ciclo)>();
        foreach (var combinacion in request.Combinaciones)
        {
            if (combinacion.LoteId <= 0) return new BadRequestObjectResult("El Lote es obligatorio en cada combinacion.");
            if (combinacion.CicloEstacional is not ("Verano" or "Invierno"))
                return new BadRequestObjectResult("El ciclo estacional debe ser Verano o Invierno.");
            if (!lotesPorCiclo.Add((combinacion.LoteId, combinacion.CicloEstacional)))
                return new BadRequestObjectResult("Cada lote puede figurar una sola vez por ciclo estacional en la campaña.");
            if (string.IsNullOrWhiteSpace(combinacion.Producto)) return new BadRequestObjectResult("El Grano es obligatorio en cada combinacion.");
            if (combinacion.FechaInicio == default) return new BadRequestObjectResult("La Fecha de Inicio es obligatoria en cada combinacion.");
            if (combinacion.FechaFin == default) return new BadRequestObjectResult("La Fecha de Fin es obligatoria en cada combinacion.");
            if (combinacion.FechaFin < combinacion.FechaInicio) return new BadRequestObjectResult("La Fecha de Fin no puede ser anterior a la Fecha de Inicio.");
        }

        return null;
    }

    private static (DateTime FechaMinima, DateTime FechaMaxima) ObtenerLimitesFechasCampania()
    {
        var hoy = DateTime.Today;
        var anioInicio = hoy.Month >= 6 ? hoy.Year : hoy.Year - 1;
        return (new DateTime(anioInicio, 1, 1), new DateTime(anioInicio + 1, 12, 31));
    }

    private static string? ValidarMotivoOmisionVerano(OmisionVeranoRequest request)
    {
        if (request.Motivo is not ("Fin de alquiler" or "Siniestro" or "Otro motivo"))
            return "Seleccioná Fin de alquiler, Siniestro u Otro motivo para omitir Verano.";
        if (request.Motivo == "Otro motivo" && string.IsNullOrWhiteSpace(request.Detalle))
            return "Describí el motivo para omitir Verano.";
        if (request.Motivo != "Otro motivo" && !string.IsNullOrWhiteSpace(request.Detalle))
            return "El detalle solo corresponde a Otro motivo.";
        if (request.Motivo == "Siniestro" && (request.Siniestro is null || !SiniestroCatalogo.Valores.Contains(request.Siniestro) || request.FechaSiniestro is null))
            return "Indicá el tipo y la fecha del siniestro.";
        if (request.Motivo != "Siniestro" && (request.Siniestro is not null || request.FechaSiniestro is not null))
            return "Los datos del siniestro solo corresponden a Siniestro.";
        return null;
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
