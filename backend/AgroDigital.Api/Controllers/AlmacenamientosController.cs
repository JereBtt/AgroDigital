using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlmacenamientosController(
    IAlmacenamientoRepository almacenamientoRepository,
    ISiloRepository siloRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    private static readonly string[] TiposMovimientoValidos = ["Ingreso", "Egreso"];

    // ALM-02: consultar el listado de movimientos (disponible para cualquier rol).
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AlmacenamientoDto>>> ObtenerTodos([FromQuery] int? siloId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var movimientos = siloId.HasValue
            ? await almacenamientoRepository.ObtenerPorSiloAsync(siloId.Value)
            : await almacenamientoRepository.ObtenerTodosAsync();

        return Ok(movimientos);
    }

    // ALM-03 (detalle, solo lectura).
    [HttpGet("{almacenamientoId:int}")]
    public async Task<ActionResult<AlmacenamientoDto>> ObtenerPorId(int almacenamientoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var movimiento = await almacenamientoRepository.ObtenerPorIdAsync(almacenamientoId);
        return movimiento is null ? NotFound() : Ok(movimiento);
    }

    // ALM-01: registrar un movimiento manual desde el propio modulo de Almacenamiento.
    [HttpPost]
    public async Task<ActionResult<AlmacenamientoDto>> Registrar(CrearAlmacenamientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarMovimiento(request.SiloId, request.TipoMovimiento, request.Cantidad, request.Fecha);
        if (validacion is not null) return BadRequest(validacion);

        var silo = await siloRepository.ObtenerPorIdAsync(request.SiloId);
        if (silo is null) return BadRequest("El silo indicado no existe.");

        try
        {
            var movimiento = await almacenamientoRepository.RegistrarAsync(request, usuario.UsuarioId);
            return CreatedAtAction(nameof(ObtenerPorId), new { almacenamientoId = movimiento.AlmacenamientoId }, movimiento);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // ALM-03: editar reutilizando el mismo formulario del alta.
    [HttpPut("{almacenamientoId:int}")]
    public async Task<IActionResult> Actualizar(int almacenamientoId, ActualizarAlmacenamientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var validacion = ValidarMovimiento(siloId: null, request.TipoMovimiento, request.Cantidad, request.Fecha);
        if (validacion is not null) return BadRequest(validacion);

        try
        {
            var actualizado = await almacenamientoRepository.ActualizarAsync(almacenamientoId, request);
            return actualizado ? NoContent() : NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    private static string? ValidarMovimiento(int? siloId, string tipoMovimiento, decimal cantidad, DateOnly fecha)
    {
        if (siloId.HasValue && siloId.Value <= 0)
        {
            return "Debe indicar un Silo valido.";
        }

        if (string.IsNullOrWhiteSpace(tipoMovimiento) || !TiposMovimientoValidos.Contains(tipoMovimiento))
        {
            return "Tipo de Movimiento debe ser 'Ingreso' o 'Egreso'.";
        }

        if (cantidad <= 0)
        {
            return "La Cantidad de grano debe ser mayor a cero.";
        }

        if (fecha == default)
        {
            return "Debe indicar la Fecha del movimiento.";
        }

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
