using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CosechasController(ICosechaRepository cosechaRepository, IAuthTokenService authTokenService, IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "cosechas");

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CosechaDto>>> ObtenerTodos()
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        return Ok(await cosechaRepository.ObtenerTodosAsync());
    }

    [HttpGet("{cosechaId:int}")]
    public async Task<ActionResult<CosechaDto>> ObtenerPorId(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        return cosecha is null ? NotFound() : Ok(cosecha);
    }

    [HttpPost]
    public async Task<ActionResult<CosechaDto>> Crear(CrearCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var validation = ValidarCosecha(request);
        if (validation is not null) return validation;

        var cosecha = await cosechaRepository.CrearAsync(request, usuario.UsuarioId);
        return CreatedAtAction(nameof(ObtenerPorId), new { cosechaId = cosecha.CosechaId }, cosecha);
    }

    [HttpPut("{cosechaId:int}")]
    public async Task<IActionResult> Actualizar(int cosechaId, ActualizarCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var validation = ValidarCosecha(request);
        if (validation is not null) return validation;

        var actualizado = await cosechaRepository.ActualizarAsync(cosechaId, request);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpPost("{cosechaId:int}/finalizar")]
    public async Task<IActionResult> Finalizar(int cosechaId, FinalizarCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        if (cosecha is null) return NotFound();

        var validation = ValidarFinalizacion(cosecha, request);
        if (validation is not null) return validation;

        var actualizado = await cosechaRepository.FinalizarAsync(cosechaId, request);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpGet("{cosechaId:int}/tirada-aros")]
    public async Task<ActionResult<IReadOnlyList<CosechaTiradaAroDto>>> ObtenerTiradas(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        if (cosecha is null) return NotFound();

        return Ok(await cosechaRepository.ObtenerTiradasAsync(cosechaId));
    }

    [HttpPost("{cosechaId:int}/tirada-aros")]
    public async Task<ActionResult<CosechaTiradaAroDto>> AgregarTirada(int cosechaId, CrearCosechaTiradaAroRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        if (cosecha is null) return NotFound();

        var validation = ValidarTirada(cosecha, request);
        if (validation is not null) return validation;

        var tirada = await cosechaRepository.AgregarTiradaAsync(cosechaId, request, usuario.UsuarioId);
        return Ok(tirada);
    }

    [HttpPut("{cosechaId:int}/tirada-aros/{tiradaId:int}")]
    public async Task<IActionResult> ActualizarTirada(int cosechaId, int tiradaId, ActualizarCosechaTiradaAroRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        if (cosecha is null) return NotFound();

        var validation = ValidarTirada(cosecha, request);
        if (validation is not null) return validation;

        var actualizado = await cosechaRepository.ActualizarTiradaAsync(cosechaId, tiradaId, request);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpDelete("{cosechaId:int}/tirada-aros/{tiradaId:int}")]
    public async Task<IActionResult> EliminarTirada(int cosechaId, int tiradaId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var eliminado = await cosechaRepository.EliminarTiradaAsync(cosechaId, tiradaId);
        return eliminado ? NoContent() : NotFound();
    }

    [HttpGet("{cosechaId:int}/documentos")]
    public async Task<ActionResult<IReadOnlyList<CosechaDocumentoDto>>> ObtenerDocumentos(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        return Ok(await cosechaRepository.ObtenerDocumentosAsync(cosechaId));
    }

    [HttpPost("{cosechaId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<CosechaDocumentoDto>> SubirDocumento(int cosechaId, IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest("Debes adjuntar un archivo.");
        }

        var cosechaCarpeta = Path.Combine(_uploadsRoot, cosechaId.ToString());
        Directory.CreateDirectory(cosechaCarpeta);

        var nombreEnDisco = $"{Guid.NewGuid()}_{Path.GetFileName(archivo.FileName)}";
        var rutaCompleta = Path.Combine(cosechaCarpeta, nombreEnDisco);

        await using (var stream = System.IO.File.Create(rutaCompleta))
        {
            await archivo.CopyToAsync(stream);
        }

        var documento = await cosechaRepository.AgregarDocumentoAsync(cosechaId, archivo.FileName, rutaCompleta, usuario.UsuarioId);
        return Ok(documento);
    }

    [HttpGet("{cosechaId:int}/documentos/{documentoId:int}/descargar")]
    public async Task<IActionResult> DescargarDocumento(int cosechaId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await cosechaRepository.ObtenerRutaDocumentoAsync(cosechaId, documentoId);
        if (ruta is null || !System.IO.File.Exists(ruta))
        {
            return NotFound();
        }

        var bytes = await System.IO.File.ReadAllBytesAsync(ruta);
        var nombreOriginal = Path.GetFileName(ruta).Split('_', 2).Last();
        return File(bytes, "application/octet-stream", nombreOriginal);
    }

    [HttpDelete("{cosechaId:int}/documentos/{documentoId:int}")]
    public async Task<IActionResult> EliminarDocumento(int cosechaId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await cosechaRepository.ObtenerRutaDocumentoAsync(cosechaId, documentoId);
        var eliminado = await cosechaRepository.EliminarDocumentoAsync(cosechaId, documentoId);

        if (eliminado && ruta is not null && System.IO.File.Exists(ruta))
        {
            System.IO.File.Delete(ruta);
        }

        return eliminado ? NoContent() : NotFound();
    }

    private static ActionResult? ValidarCosecha(CrearCosechaRequest request)
    {
        if (request.LoteId <= 0) return new BadRequestObjectResult("El Lote es obligatorio.");
        if (string.IsNullOrWhiteSpace(request.Producto)) return new BadRequestObjectResult("El Grano es obligatorio.");
        if (request.FechaFin < request.FechaInicio) return new BadRequestObjectResult("La Fecha de Fin no puede ser anterior a la Fecha de Inicio.");
        if (request.FechaFinReal is not null && request.FechaFinReal < request.FechaInicio) return new BadRequestObjectResult("La Fecha real de finalizacion no puede ser anterior a la Fecha de Inicio.");
        if (request.FechaFinReal is not null && request.FechaFinReal.Value.Date > request.FechaInicio.Date.AddMonths(6)) return new BadRequestObjectResult("La Fecha real de finalizacion no puede superar los 6 meses desde la Fecha de Inicio.");
        if (request.CantidadGranoCosechado is <= 0) return new BadRequestObjectResult("La Cantidad de grano cosechado debe ser mayor a cero.");
        if (request.CantidadHectareasTrabajadas is <= 0) return new BadRequestObjectResult("La Cantidad de hectareas trabajadas debe ser mayor a cero.");
        if (request.HumedadGrano is < 0) return new BadRequestObjectResult("La Humedad del grano no puede ser negativa.");
        if (request.Impurezas is < 0) return new BadRequestObjectResult("Las Impurezas no pueden ser negativas.");
        if (request.RindeKgHa is <= 0) return new BadRequestObjectResult("El Rinde debe ser mayor a cero.");
        return null;
    }

    private static ActionResult? ValidarFinalizacion(CosechaDto cosecha, FinalizarCosechaRequest request)
    {
        if (request.FechaFinReal < cosecha.FechaInicio) return new BadRequestObjectResult("La Fecha real de finalizacion no puede ser anterior a la Fecha de Inicio.");
        if (request.FechaFinReal.Date > cosecha.FechaInicio.Date.AddMonths(6)) return new BadRequestObjectResult("La Fecha real de finalizacion no puede superar los 6 meses desde la Fecha de Inicio.");
        if (request.CantidadGranoCosechado <= 0) return new BadRequestObjectResult("La Cantidad de grano cosechado debe ser mayor a cero.");
        if (request.CantidadHectareasTrabajadas <= 0) return new BadRequestObjectResult("La Cantidad de hectareas trabajadas debe ser mayor a cero.");
        if (request.HumedadGrano is < 0) return new BadRequestObjectResult("La Humedad del grano no puede ser negativa.");
        if (request.Impurezas is < 0) return new BadRequestObjectResult("Las Impurezas no pueden ser negativas.");
        if (request.RindeKgHa is <= 0) return new BadRequestObjectResult("El Rinde debe ser mayor a cero.");

        var diasDesvio = Math.Abs((request.FechaFinReal.Date - cosecha.FechaFin.Date).Days);
        if (diasDesvio > 3 && string.IsNullOrWhiteSpace(request.JustificacionDesvioFin))
        {
            return new BadRequestObjectResult("La fecha real se aleja mas de 3 dias de la fecha tentativa. Debes registrar una justificacion.");
        }

        return null;
    }

    private static ActionResult? ValidarTirada(CosechaDto cosecha, CrearCosechaTiradaAroRequest request)
    {
        if (request.Fecha == default) return new BadRequestObjectResult("La fecha del control es obligatoria.");
        var fechaFinControl = request.FechaFinRealReferencia ?? cosecha.FechaFinReal ?? cosecha.FechaFin;
        if (request.Fecha.Date < cosecha.FechaInicio.Date || request.Fecha.Date > fechaFinControl.Date)
        {
            return new BadRequestObjectResult("La fecha del control debe estar dentro del rango de la cosecha.");
        }
        if (request.AroCabezal < 0) return new BadRequestObjectResult("El Aro Cabezal no puede ser negativo.");
        if (request.AroCola1 < 0 || request.AroCola2 < 0 || request.AroCola3 < 0) return new BadRequestObjectResult("Los Aros Cola no pueden tener valores negativos.");
        if (request.PMG is null or <= 0) return new BadRequestObjectResult("El PMG es obligatorio y debe ser mayor a cero.");
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
