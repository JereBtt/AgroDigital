using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace AgroDigital.Api.Controllers;

public sealed record ConsultaAgroBotRequest(int EmpresaId, string Pregunta, IReadOnlyList<AgroBotMessage>? Historia);

[ApiController]
[Route("api/agrobot")]
public sealed class AgroBotController(ReporteriaRepository repository, AgroBotService service,
    IPermisosService permisos, IAuthTokenService tokens) : ControllerBase
{
    [HttpPost("consultar")]
    public async Task<ActionResult<AgroBotResult>> Consultar([FromBody] ConsultaAgroBotRequest request, CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ||
            !tokens.TryValidate(header["Bearer ".Length..].Trim(), out var user) || user is null)
            return Unauthorized("Sesión no válida.");
        if (request.EmpresaId <= 0) return BadRequest("Seleccioná una empresa.");
        var pregunta = request.Pregunta?.Trim() ?? "";
        if (pregunta.Length is 0 or > 1000) return BadRequest("Escribí una consulta de hasta 1000 caracteres.");
        var history = request.Historia ?? [];
        if (history.Count > 8 || history.Any(x => x.Contenido is null || x.Contenido.Length > 1200 ||
            x.Rol is not ("usuario" or "asistente")))
            return BadRequest("El contexto temporal de la conversación no es válido.");
        try
        {
            if (!await repository.ExisteEmpresaAsync(request.EmpresaId, ct))
                return NotFound("No se encontró la empresa.");
            var rol = await permisos.ExigirAsync(user, RecursoOperativo.Empresa, request.EmpresaId,
                ["Gerente", "Encargado", "EmpleadoCampo", "EmpleadoAdministrativo"], "consultar AgroBot");
            return Ok(await service.ResponderAsync(request.EmpresaId, rol, pregunta, history, ct));
        }
        catch (RecursoNoEncontradoException ex) { return NotFound(ex.Message); }
        catch (PermisoDenegadoException ex) { return StatusCode(403, ex.Message); }
        catch (JsonException) { return StatusCode(503, "AgroBot recibió una respuesta no reconocida del modelo."); }
        catch (HttpRequestException) { return StatusCode(503, "AgroBot no pudo conectarse al modelo."); }
        catch (InvalidOperationException ex) { return StatusCode(503, ex.Message); }
    }
}
