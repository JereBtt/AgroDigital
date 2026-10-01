using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlmacenamientosController(
    IAlmacenamientoRepository almacenamientoRepository,
    IAuthTokenService authTokenService,
    IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "almacenamientos");

    private static readonly string[] TiposMovimientoValidos = ["Ingreso", "Egreso"];
    private static readonly string[] MotivosEgreso = ["Semilla propia", "Consumo interno", "Deterioro"];
    private static readonly string[] MotivosAjusteNegativo = ["Merma por secado", "Diferencia de medicion", "Deterioro"];
    private static readonly string[] MotivosAjustePositivo = ["Diferencia de medicion"];

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

        // La venta sale por Distribucion; el egreso manual necesita decir por que sale el grano.
        if (request.TipoMovimiento == "Egreso" && !MotivosEgreso.Contains(request.Motivo ?? string.Empty))
        {
            return BadRequest("Indica el motivo del egreso: Semilla propia, Consumo interno o Deterioro.");
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

        if (request.TipoMovimiento == "Egreso" && request.Motivo is not null && !MotivosEgreso.Contains(request.Motivo))
        {
            return BadRequest("Motivo de egreso invalido.");
        }

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

    // ALM-08: ajuste de stock (merma, diferencia de medicion, deterioro). Solo Encargado.
    [HttpPost("ajustes")]
    public async Task<ActionResult<AlmacenamientoDto>> RegistrarAjuste(RegistrarAjusteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (request.SiloId <= 0) return BadRequest("Debe indicar un Silo valido.");
        if (request.Sentido is not ("Positivo" or "Negativo")) return BadRequest("El ajuste debe ser Positivo o Negativo.");
        if (request.Cantidad <= 0) return BadRequest("La cantidad del ajuste debe ser mayor a cero.");
        if (request.Fecha == default) return BadRequest("Debe indicar la Fecha del ajuste.");

        var motivos = request.Sentido == "Positivo" ? MotivosAjustePositivo : MotivosAjusteNegativo;
        if (!motivos.Contains(request.Motivo ?? string.Empty))
        {
            return BadRequest(request.Sentido == "Positivo"
                ? "Un ajuste positivo solo corresponde a una diferencia de medicion."
                : "Indica el motivo del ajuste: Merma por secado, Diferencia de medicion o Deterioro.");
        }

        try
        {
            var movimiento = await almacenamientoRepository.RegistrarAjusteAsync(request, usuario.UsuarioId, EsAdmin(usuario));
            return CreatedAtAction(nameof(ObtenerPorId), new { almacenamientoId = movimiento.AlmacenamientoId }, movimiento);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // ALM-06: transferencia de grano entre dos silos de la misma empresa.
    [HttpPost("transferencias")]
    public async Task<ActionResult<TransferenciaResultadoDto>> RegistrarTransferencia(RegistrarTransferenciaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (request.SiloOrigenId <= 0 || request.SiloDestinoId <= 0) return BadRequest("Debe indicar el silo de origen y el de destino.");
        if (request.SiloOrigenId == request.SiloDestinoId) return BadRequest("El silo de origen y el de destino tienen que ser distintos.");
        if (request.Cantidad <= 0) return BadRequest("La cantidad a transferir debe ser mayor a cero.");
        if (request.Fecha == default) return BadRequest("Debe indicar la Fecha de la transferencia.");
        if (request.Motivo?.Trim().Length > 500) return BadRequest("El motivo admite hasta 500 caracteres.");

        try
        {
            var resultado = await almacenamientoRepository.RegistrarTransferenciaAsync(request, usuario.UsuarioId, EsAdmin(usuario));
            return Ok(resultado);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // ---------- Documentos del movimiento ----------

    [HttpGet("{almacenamientoId:int}/documentos")]
    public async Task<ActionResult<IReadOnlyList<AlmacenamientoDocumentoDto>>> ObtenerDocumentos(int almacenamientoId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (await almacenamientoRepository.ObtenerPorIdAsync(almacenamientoId, usuario.UsuarioId, EsAdmin(usuario)) is null) return NotFound();
        return Ok(await almacenamientoRepository.ObtenerDocumentosAsync(almacenamientoId));
    }

    [HttpPost("{almacenamientoId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<AlmacenamientoDocumentoDto>> SubirDocumento(int almacenamientoId, IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (await almacenamientoRepository.ObtenerPorIdAsync(almacenamientoId, usuario.UsuarioId, EsAdmin(usuario)) is null) return NotFound();

        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest("Debes adjuntar un archivo.");
        }

        var carpeta = Path.Combine(_uploadsRoot, almacenamientoId.ToString());
        Directory.CreateDirectory(carpeta);
        var rutaCompleta = Path.Combine(carpeta, $"{Guid.NewGuid()}_{Path.GetFileName(archivo.FileName)}");

        await using (var stream = System.IO.File.Create(rutaCompleta))
        {
            await archivo.CopyToAsync(stream);
        }

        var documento = await almacenamientoRepository.AgregarDocumentoAsync(almacenamientoId, archivo.FileName, rutaCompleta, usuario.UsuarioId);
        return Ok(documento);
    }

    [HttpGet("{almacenamientoId:int}/documentos/{documentoId:int}/descargar")]
    public async Task<IActionResult> DescargarDocumento(int almacenamientoId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (await almacenamientoRepository.ObtenerPorIdAsync(almacenamientoId, usuario.UsuarioId, EsAdmin(usuario)) is null) return NotFound();

        var ruta = await almacenamientoRepository.ObtenerRutaDocumentoAsync(almacenamientoId, documentoId);
        if (ruta is null || !System.IO.File.Exists(ruta)) return NotFound();

        var bytes = await System.IO.File.ReadAllBytesAsync(ruta);
        var nombreOriginal = Path.GetFileName(ruta).Split('_', 2).Last();
        return File(bytes, "application/octet-stream", nombreOriginal);
    }

    [HttpDelete("{almacenamientoId:int}/documentos/{documentoId:int}")]
    public async Task<IActionResult> EliminarDocumento(int almacenamientoId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (await almacenamientoRepository.ObtenerPorIdAsync(almacenamientoId, usuario.UsuarioId, EsAdmin(usuario)) is null) return NotFound();

        var ruta = await almacenamientoRepository.ObtenerRutaDocumentoAsync(almacenamientoId, documentoId);
        var eliminado = await almacenamientoRepository.EliminarDocumentoAsync(almacenamientoId, documentoId);
        if (eliminado && ruta is not null && System.IO.File.Exists(ruta))
        {
            System.IO.File.Delete(ruta);
        }

        return eliminado ? NoContent() : NotFound();
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
