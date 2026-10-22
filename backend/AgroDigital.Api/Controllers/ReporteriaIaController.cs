using System.Text.Json;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

public sealed record ConsultaReporteriaRequest(int EmpresaId, int? ConversacionId, string Pregunta);

[ApiController]
[Route("api/reporteria-ia")]
public sealed class ReporteriaIaController(
    ReporteriaRepository repository,
    ReporteriaIaService service,
    IPermisosService permisos,
    IAuthTokenService tokens) : ControllerBase
{
    [HttpGet("conversaciones")]
    public async Task<ActionResult> Listar([FromQuery] int empresaId, CancellationToken ct)
    {
        if (!Autenticar(out var user, out var error)) return error;
        if (empresaId <= 0) return BadRequest("Seleccioná una empresa.");
        try
        {
            await AutorizarAsync(user, empresaId, ct);
            return Ok(await repository.ListarConversacionesAsync(empresaId, user.UsuarioId, ct));
        }
        catch (RecursoNoEncontradoException ex) { return NotFound(ex.Message); }
        catch (PermisoDenegadoException ex) { return StatusCode(403, ex.Message); }
    }

    [HttpGet("conversaciones/{id:int}")]
    public async Task<ActionResult> Ver(int id, [FromQuery] int empresaId, CancellationToken ct)
    {
        if (!Autenticar(out var user, out var error)) return error;
        if (empresaId <= 0 || id <= 0) return BadRequest("Seleccioná una empresa y una conversación.");
        try
        {
            await AutorizarAsync(user, empresaId, ct);
            var rows = await repository.LeerMensajesAsync(empresaId, user.UsuarioId, id, ct);
            return rows is null ? NotFound("No se encontró la conversación.") : Ok(rows);
        }
        catch (RecursoNoEncontradoException ex) { return NotFound(ex.Message); }
        catch (PermisoDenegadoException ex) { return StatusCode(403, ex.Message); }
    }

    [HttpPost("consultar")]
    public async Task<ActionResult> Consultar([FromBody] ConsultaReporteriaRequest request, CancellationToken ct)
    {
        if (!Autenticar(out var user, out var error)) return error;
        if (request.EmpresaId <= 0) return BadRequest("Seleccioná una empresa.");
        var pregunta = request.Pregunta?.Trim();
        if (string.IsNullOrWhiteSpace(pregunta) || pregunta.Length > 1000)
            return BadRequest("Escribí una consulta de hasta 1000 caracteres.");
        if (request.ConversacionId is <= 0) return BadRequest("La conversación no es válida.");
        try
        {
            await AutorizarAsync(user, request.EmpresaId, ct);
            var previous = request.ConversacionId is int id
                ? await repository.LeerMensajesAsync(request.EmpresaId, user.UsuarioId, id, ct)
                : [];
            if (previous is null) return NotFound("No se encontró la conversación.");
            var result = await service.ResponderAsync(request.EmpresaId, user.UsuarioId, user.Rol == "Admin", pregunta, previous, ct);
            var conversationId = await repository.GuardarIntercambioAsync(request.EmpresaId, user.UsuarioId,
                request.ConversacionId, pregunta, result.Respuesta, result.Modo,
                JsonSerializer.Serialize(result.Fuentes), ct);
            return Ok(new { conversacionId = conversationId, respuesta = result.Respuesta, modo = result.Modo, fuentes = result.Fuentes });
        }
        catch (RecursoNoEncontradoException ex) { return NotFound(ex.Message); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (PermisoDenegadoException ex) { return StatusCode(403, ex.Message); }
        catch (InvalidOperationException ex) { return StatusCode(503, ex.Message); }
    }

    private async Task AutorizarAsync(AuthenticatedUser user, int empresaId, CancellationToken ct)
    {
        if (!await repository.ExisteEmpresaAsync(empresaId, ct))
            throw new RecursoNoEncontradoException("No se encontró la empresa.");
        await permisos.ExigirAsync(user, RecursoOperativo.Empresa, empresaId,
            RolesPermiso.Estructura, "consultar Reportería IA");
    }

    private bool Autenticar(out AuthenticatedUser user, out ActionResult error)
    {
        user = null!;
        error = Unauthorized("Sesión no válida.");
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;
        if (!tokens.TryValidate(header["Bearer ".Length..].Trim(), out var valid) || valid is null) return false;
        user = valid;
        return true;
    }
}
