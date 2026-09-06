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
        var lote = await loteRepository.CrearAsync(request, usuario.UsuarioId, usuario.Rol == "Admin");
        return CreatedAtAction(nameof(ObtenerPorId), new { loteId = lote.LoteId }, lote);
    }

    [HttpPut("{loteId:int}")]
    public async Task<IActionResult> Actualizar(int loteId, ActualizarLoteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var actualizado = await loteRepository.ActualizarAsync(loteId, request, usuario.UsuarioId, usuario.Rol == "Admin");
        return actualizado ? NoContent() : NotFound();
    }

    [HttpPost("{loteId:int}/deshabilitar")]
    public async Task<IActionResult> Deshabilitar(int loteId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var actualizado = await loteRepository.CambiarEstadoAsync(loteId, false, usuario.UsuarioId, usuario.Rol == "Admin");
        return actualizado ? Ok(new { mensaje = "Lote deshabilitado correctamente." }) : NotFound();
    }

    [HttpPost("{loteId:int}/habilitar")]
    public async Task<IActionResult> Habilitar(int loteId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var actualizado = await loteRepository.CambiarEstadoAsync(loteId, true, usuario.UsuarioId, usuario.Rol == "Admin");
        return actualizado ? Ok(new { mensaje = "Lote habilitado correctamente." }) : NotFound();
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
