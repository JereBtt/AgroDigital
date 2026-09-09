using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CampaniasController(ICampaniaRepository campaniaRepository, IAuthTokenService authTokenService) : ControllerBase
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

        try
        {
            var campania = await campaniaRepository.CrearAsync(request, usuario.UsuarioId, usuario.Rol == "Admin");
            return CreatedAtAction(nameof(ObtenerPorId), new { campaniaId = campania.CampaniaId }, campania);
        }
        catch (CampaniaPeriodoDuplicadoException ex)
        {
            return Conflict(new { codigo = "CampaniaPeriodoDuplicado", mensaje = ex.Message });
        }
    }

    [HttpPut("{campaniaId:int}")]
    public async Task<IActionResult> Actualizar(int campaniaId, ActualizarCampaniaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validation = ValidarCampania(request);
        if (validation is not null) return validation;

        try
        {
            var actualizado = await campaniaRepository.ActualizarAsync(campaniaId, request, usuario.UsuarioId, usuario.Rol == "Admin");
            return actualizado ? NoContent() : NotFound();
        }
        catch (CampaniaPeriodoDuplicadoException ex)
        {
            return Conflict(new { codigo = "CampaniaPeriodoDuplicado", mensaje = ex.Message });
        }
    }

    private static ActionResult? ValidarCampania(CrearCampaniaRequest request)
    {
        if (request.FechaInicio == default) return new BadRequestObjectResult("La Fecha de Inicio de la campania es obligatoria.");
        if (request.FechaFin == default) return new BadRequestObjectResult("La Fecha tentativa de Fin de la campania es obligatoria.");
        if (request.FechaFin < request.FechaInicio) return new BadRequestObjectResult("La Fecha tentativa de Fin no puede ser anterior a la Fecha de Inicio.");

        var (fechaMinima, fechaMaxima) = ObtenerLimitesFechasCampania();
        if (request.FechaInicio.Date < fechaMinima || request.FechaInicio.Date > fechaMaxima)
            return new BadRequestObjectResult($"La Fecha de Inicio debe estar entre {fechaMinima:dd/MM/yyyy} y {fechaMaxima:dd/MM/yyyy}.");
        if (request.FechaFin.Date < fechaMinima || request.FechaFin.Date > fechaMaxima)
            return new BadRequestObjectResult($"La Fecha tentativa de Fin debe estar entre {fechaMinima:dd/MM/yyyy} y {fechaMaxima:dd/MM/yyyy}.");
        if (request.Combinaciones.Count == 0) return new BadRequestObjectResult("Debes agregar al menos una combinacion de Lote y Grano.");

        foreach (var combinacion in request.Combinaciones)
        {
            if (combinacion.LoteId <= 0) return new BadRequestObjectResult("El Lote es obligatorio en cada combinacion.");
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
