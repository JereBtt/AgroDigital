using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SiembrasController(ISiembraRepository siembraRepository, IAuthTokenService authTokenService, IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "siembras");

    private static readonly string[] TiposInsumoValidos =
    [
        "Herbicidas", "Insecticidas", "Fungicidas", "Acaricidas",
        "Nematicidas", "Raticidas", "Bactericidas", "Molusquicidas"
    ];

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SiembraDto>>> ObtenerTodos()
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var siembras = await siembraRepository.ObtenerTodosAsync();
        return Ok(siembras);
    }

    [HttpGet("{siembraId:int}")]
    public async Task<ActionResult<SiembraDto>> ObtenerPorId(int siembraId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var siembra = await siembraRepository.ObtenerPorIdAsync(siembraId);
        return siembra is null ? NotFound() : Ok(siembra);
    }

    [HttpPost]
    public async Task<ActionResult<SiembraDto>> Crear(CrearSiembraRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (request.LoteId <= 0)
        {
            return BadRequest("El Lote es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.Producto))
        {
            return BadRequest("El Producto es obligatorio.");
        }

        if (request.FechaFin < request.FechaInicio)
        {
            return BadRequest("La Fecha de Fin no puede ser anterior a la Fecha de Inicio.");
        }

        var siembra = await siembraRepository.CrearAsync(request, usuario.UsuarioId);
        return CreatedAtAction(nameof(ObtenerPorId), new { siembraId = siembra.SiembraId }, siembra);
    }

    [HttpPut("{siembraId:int}")]
    public async Task<IActionResult> Actualizar(int siembraId, ActualizarSiembraRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (request.LoteId <= 0)
        {
            return BadRequest("El Lote es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.Producto))
        {
            return BadRequest("El Producto es obligatorio.");
        }

        if (request.FechaFin < request.FechaInicio)
        {
            return BadRequest("La Fecha de Fin no puede ser anterior a la Fecha de Inicio.");
        }

        var actualizado = await siembraRepository.ActualizarAsync(siembraId, request);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpGet("{siembraId:int}/insumos")]
    public async Task<ActionResult<IReadOnlyList<SiembraInsumoDto>>> ObtenerInsumos(int siembraId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var insumos = await siembraRepository.ObtenerInsumosAsync(siembraId);
        return Ok(insumos);
    }

    [HttpPost("{siembraId:int}/insumos")]
    public async Task<ActionResult<SiembraInsumoDto>> AgregarInsumo(int siembraId, CrearSiembraInsumoRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (!string.IsNullOrWhiteSpace(request.Tipo) && !TiposInsumoValidos.Contains(request.Tipo))
        {
            return BadRequest("Tipo de insumo invalido.");
        }

        var insumo = await siembraRepository.AgregarInsumoAsync(siembraId, request);
        return Ok(insumo);
    }

    [HttpDelete("{siembraId:int}/insumos/{insumoId:int}")]
    public async Task<IActionResult> EliminarInsumo(int siembraId, int insumoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var eliminado = await siembraRepository.EliminarInsumoAsync(siembraId, insumoId);
        return eliminado ? NoContent() : NotFound();
    }

    [HttpGet("{siembraId:int}/documentos")]
    public async Task<ActionResult<IReadOnlyList<SiembraDocumentoDto>>> ObtenerDocumentos(int siembraId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var documentos = await siembraRepository.ObtenerDocumentosAsync(siembraId);
        return Ok(documentos);
    }

    [HttpPost("{siembraId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<SiembraDocumentoDto>> SubirDocumento(int siembraId, IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest("Debes adjuntar un archivo.");
        }

        var siembraCarpeta = Path.Combine(_uploadsRoot, siembraId.ToString());
        Directory.CreateDirectory(siembraCarpeta);

        var nombreEnDisco = $"{Guid.NewGuid()}_{Path.GetFileName(archivo.FileName)}";
        var rutaCompleta = Path.Combine(siembraCarpeta, nombreEnDisco);

        await using (var stream = System.IO.File.Create(rutaCompleta))
        {
            await archivo.CopyToAsync(stream);
        }

        var documento = await siembraRepository.AgregarDocumentoAsync(siembraId, archivo.FileName, rutaCompleta, usuario.UsuarioId);
        return Ok(documento);
    }

    [HttpGet("{siembraId:int}/documentos/{documentoId:int}/descargar")]
    public async Task<IActionResult> DescargarDocumento(int siembraId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await siembraRepository.ObtenerRutaDocumentoAsync(siembraId, documentoId);
        if (ruta is null || !System.IO.File.Exists(ruta))
        {
            return NotFound();
        }

        var bytes = await System.IO.File.ReadAllBytesAsync(ruta);
        var nombreOriginal = Path.GetFileName(ruta).Split('_', 2).Last();
        return File(bytes, "application/octet-stream", nombreOriginal);
    }

    [HttpDelete("{siembraId:int}/documentos/{documentoId:int}")]
    public async Task<IActionResult> EliminarDocumento(int siembraId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await siembraRepository.ObtenerRutaDocumentoAsync(siembraId, documentoId);
        var eliminado = await siembraRepository.EliminarDocumentoAsync(siembraId, documentoId);

        if (eliminado && ruta is not null && System.IO.File.Exists(ruta))
        {
            System.IO.File.Delete(ruta);
        }

        return eliminado ? NoContent() : NotFound();
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
