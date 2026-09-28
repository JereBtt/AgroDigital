using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlmacenamientosController(
    IAlmacenamientoRepository almacenamientoRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    private static readonly string[] TiposMovimientoValidos = ["Ingreso", "Egreso"];

    // ALM-02: consultar el listado de movimientos (disponible para cualquier rol).
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AlmacenamientoDto>>> ObtenerTodos([FromQuery] int? siloId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var esAdmin = EsAdmin(usuario);

        var movimientos = siloId.HasValue
            ? await almacenamientoRepository.ObtenerPorSiloAsync(siloId.Value, usuario.UsuarioId, esAdmin)
            : await almacenamientoRepository.ObtenerTodosAsync(usuario.UsuarioId, esAdmin);

        return Ok(movimientos);
    }

    // ALM-03 (detalle, solo lectura).
    [HttpGet("{almacenamientoId:int}")]
    public async Task<ActionResult<AlmacenamientoDto>> ObtenerPorId(int almacenamientoId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var movimiento = await almacenamientoRepository.ObtenerPorIdAsync(almacenamientoId, usuario.UsuarioId, EsAdmin(usuario));
        return movimiento is null ? NotFound() : Ok(movimiento);
    }

    // ALM-05: stock actual por grano y por silo. La campania es opcional.
    [HttpGet("stock")]
    public async Task<ActionResult<StockActualDto>> ObtenerStock([FromQuery] int? empresaId, [FromQuery] int? campaniaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var stock = await almacenamientoRepository.ObtenerStockAsync(empresaId, campaniaId, usuario.UsuarioId, EsAdmin(usuario));
        return Ok(stock);
    }

    // Cosechas con grano todavia sin almacenar (para elegir el origen de un ingreso).
    [HttpGet("cosechas-con-saldo")]
    public async Task<ActionResult<IReadOnlyList<SaldoCosechaDto>>> ObtenerCosechasConSaldo([FromQuery] int? empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var cosechas = await almacenamientoRepository.ObtenerCosechasConSaldoAsync(empresaId, usuario.UsuarioId, EsAdmin(usuario));
        return Ok(cosechas);
    }

    [HttpGet("cosechas/{cosechaId:int}/saldo")]
    public async Task<ActionResult<SaldoCosechaDto>> ObtenerSaldoCosecha(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var saldo = await almacenamientoRepository.ObtenerSaldoCosechaAsync(cosechaId, usuario.UsuarioId, EsAdmin(usuario));
        return saldo is null ? NotFound() : Ok(saldo);
    }

    // Silos de la empresa que pueden recibir un grano, con el motivo de los que no.
    [HttpGet("silos-destino")]
    public async Task<ActionResult<IReadOnlyList<SiloDestinoDto>>> ObtenerSilosDestino([FromQuery] int empresaId, [FromQuery] string? producto)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (empresaId <= 0) return BadRequest("Debe indicar la empresa.");
        if (string.IsNullOrWhiteSpace(producto)) return BadRequest("Debe indicar el grano.");

        var silos = await almacenamientoRepository.ObtenerSilosDestinoAsync(empresaId, producto.Trim(), usuario.UsuarioId, EsAdmin(usuario));
        return Ok(silos);
    }

    // ALM-01: registrar un movimiento manual desde el propio modulo de Almacenamiento.
    // El control de acceso al silo y a la cosecha lo hace el repositorio.
    [HttpPost]
    public async Task<ActionResult<AlmacenamientoDto>> Registrar(CrearAlmacenamientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarMovimiento(request.SiloId, request.TipoMovimiento, request.Cantidad, request.Fecha,
            request.HumedadIngreso, request.Impurezas);
        if (validacion is not null) return BadRequest(validacion);

        if (request.TipoMovimiento == "Egreso" && request.CosechaId.HasValue)
        {
            return BadRequest("Un egreso no se vincula a una cosecha: el grano sale de las partidas del silo.");
        }

        try
        {
            var movimiento = await almacenamientoRepository.RegistrarAsync(request, usuario.UsuarioId, EsAdmin(usuario));
            return CreatedAtAction(nameof(ObtenerPorId), new { almacenamientoId = movimiento.AlmacenamientoId }, movimiento);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // ALM-03: editar el ultimo movimiento manual de un silo.
    [HttpPut("{almacenamientoId:int}")]
    public async Task<IActionResult> Actualizar(int almacenamientoId, ActualizarAlmacenamientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarMovimiento(siloId: null, request.TipoMovimiento, request.Cantidad, request.Fecha,
            request.HumedadIngreso, request.Impurezas);
        if (validacion is not null) return BadRequest(validacion);

        try
        {
            var actualizado = await almacenamientoRepository.ActualizarAsync(almacenamientoId, request, usuario.UsuarioId, EsAdmin(usuario));
            return actualizado ? NoContent() : NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    private static string? ValidarMovimiento(
        int? siloId, string tipoMovimiento, decimal cantidad, DateOnly fecha, decimal? humedad, decimal? impurezas)
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

        if (humedad is < 0 or > 100)
        {
            return "La humedad al ingreso debe estar entre 0 y 100 %.";
        }

        if (impurezas is < 0 or > 100)
        {
            return "Las impurezas deben estar entre 0 y 100 %.";
        }

        return null;
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
