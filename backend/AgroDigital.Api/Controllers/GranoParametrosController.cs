using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Parametros de almacenamiento por grano y tipo de silo (paso 4 del rediseno de Silos).
/// Los consulta cualquier usuario de la empresa; los carga el Gerente o el Encargado.
/// </summary>
[ApiController]
[Route("api/grano-parametros")]
public class GranoParametrosController(
    IGranoParametroRepository granoParametroRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    private static readonly string[] TiposSiloValidos = ["Chapa", "Bolson"];

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GranoParametroDto>>> Obtener([FromQuery] int? empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        return Ok(await granoParametroRepository.ObtenerAsync(empresaId, usuario.UsuarioId, usuario.Rol == "Admin"));
    }

    // Humedad base de comercializacion por grano (valor normativo, solo lectura).
    [HttpGet("bases")]
    public async Task<ActionResult<IReadOnlyList<GranoBaseComercializacionDto>>> ObtenerBases()
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        return Ok(await granoParametroRepository.ObtenerBasesAsync());
    }

    // Crea o actualiza la combinacion empresa + grano + tipo de silo.
    [HttpPut]
    public async Task<ActionResult<GranoParametroDto>> Guardar(GuardarGranoParametroRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = Validar(request);
        if (validacion is not null) return BadRequest(validacion);

        var guardado = await granoParametroRepository.GuardarAsync(request, usuario.UsuarioId, usuario.Rol == "Admin");
        return guardado is null
            ? StatusCode(StatusCodes.Status403Forbidden, "Solo el Gerente o el Encargado de la empresa pueden modificar los parametros.")
            : Ok(guardado);
    }

    [HttpDelete("{granoParametroId:int}")]
    public async Task<IActionResult> Eliminar(int granoParametroId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var eliminado = await granoParametroRepository.EliminarAsync(granoParametroId, usuario.UsuarioId, usuario.Rol == "Admin");
        return eliminado ? NoContent() : NotFound();
    }

    private static string? Validar(GuardarGranoParametroRequest request)
    {
        if (request.EmpresaId <= 0) return "Debe indicar la empresa.";
        if (string.IsNullOrWhiteSpace(request.Producto) || request.Producto.Trim().Length > 60) return "El grano es obligatorio (hasta 60 caracteres).";
        if (!TiposSiloValidos.Contains(request.TipoSilo?.Trim() ?? string.Empty)) return "Tipo de Silo debe ser 'Chapa' o 'Bolson'.";
        if (request.UmbralHumedad is <= 0 or >= 100) return "El umbral de humedad debe estar entre 0 y 100 %.";
        if (request.MargenTemperaturaC is <= 0 or > 50) return "El margen de temperatura debe ser mayor a 0 y hasta 50 °C.";
        if (request.FrecuenciaControlDias is < 1 or > 365) return "La frecuencia de control debe estar entre 1 y 365 dias.";
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
