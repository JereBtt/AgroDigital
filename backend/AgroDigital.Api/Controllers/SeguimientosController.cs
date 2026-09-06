using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/siembras/{siembraId:int}/seguimientos")]
public class SeguimientosController(ISeguimientoRepository seguimientoRepository, IAuthTokenService authTokenService, IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "seguimientos");

    private static readonly string[] IncidenciasValidas = ["Plaga", "Maleza", "Enfermedad", "Ninguna"];

    private static readonly string[] TiposInsumoValidos =
    [
        "Herbicidas", "Insecticidas", "Fungicidas", "Acaricidas",
        "Nematicidas", "Raticidas", "Bactericidas", "Molusquicidas"
    ];

    // ---------- Recorridas ----------

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SiembraSeguimientoDto>>> ObtenerTodos(int siembraId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var seguimientos = await seguimientoRepository.ObtenerTodosAsync(siembraId);
        return Ok(seguimientos);
    }

    [HttpGet("{seguimientoId:int}")]
    public async Task<ActionResult<SiembraSeguimientoDto>> ObtenerPorId(int siembraId, int seguimientoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var seguimiento = await seguimientoRepository.ObtenerPorIdAsync(siembraId, seguimientoId);
        return seguimiento is null ? NotFound() : Ok(seguimiento);
    }

    [HttpPost]
    public async Task<ActionResult<SiembraSeguimientoDto>> Crear(int siembraId, CrearSiembraSeguimientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (string.IsNullOrWhiteSpace(request.Observaciones))
        {
            return BadRequest("Las Observaciones son obligatorias.");
        }

        if (!string.IsNullOrWhiteSpace(request.Incidencia) && !IncidenciasValidas.Contains(request.Incidencia))
        {
            return BadRequest("Incidencia invalida.");
        }

        var seguimiento = await seguimientoRepository.CrearAsync(siembraId, request);
        return seguimiento is null ? NotFound() : Ok(seguimiento);
    }

    [HttpPut("{seguimientoId:int}")]
    public async Task<IActionResult> Actualizar(int siembraId, int seguimientoId, ActualizarSiembraSeguimientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (string.IsNullOrWhiteSpace(request.Observaciones))
        {
            return BadRequest("Las Observaciones son obligatorias.");
        }

        if (!string.IsNullOrWhiteSpace(request.Incidencia) && !IncidenciasValidas.Contains(request.Incidencia))
        {
            return BadRequest("Incidencia invalida.");
        }

        var actualizado = await seguimientoRepository.ActualizarAsync(siembraId, seguimientoId, request);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpDelete("{seguimientoId:int}")]
    public async Task<IActionResult> Eliminar(int siembraId, int seguimientoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var rutas = await seguimientoRepository.ObtenerRutasDocumentosDeSeguimientoAsync(seguimientoId);
        var eliminado = await seguimientoRepository.EliminarAsync(siembraId, seguimientoId);

        if (eliminado)
        {
            foreach (var ruta in rutas)
            {
                if (System.IO.File.Exists(ruta))
                {
                    System.IO.File.Delete(ruta);
                }
            }
        }

        return eliminado ? NoContent() : NotFound();
    }

    [HttpPost("finalizar")]
    public async Task<IActionResult> Finalizar(int siembraId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var finalizado = await seguimientoRepository.FinalizarAsync(siembraId);
        return finalizado ? NoContent() : NotFound();
    }

    // ---------- Insumos (por recorrida) ----------

    [HttpGet("{seguimientoId:int}/insumos")]
    public async Task<ActionResult<IReadOnlyList<SeguimientoInsumoDto>>> ObtenerInsumos(int siembraId, int seguimientoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var insumos = await seguimientoRepository.ObtenerInsumosAsync(seguimientoId);
        return Ok(insumos);
    }

    [HttpPost("{seguimientoId:int}/insumos")]
    public async Task<ActionResult<SeguimientoInsumoDto>> AgregarInsumo(int siembraId, int seguimientoId, CrearSeguimientoInsumoRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (!string.IsNullOrWhiteSpace(request.Tipo) && !TiposInsumoValidos.Contains(request.Tipo))
        {
            return BadRequest("Tipo de insumo invalido.");
        }

        var insumo = await seguimientoRepository.AgregarInsumoAsync(seguimientoId, request);
        return Ok(insumo);
    }

    [HttpDelete("{seguimientoId:int}/insumos/{insumoId:int}")]
    public async Task<IActionResult> EliminarInsumo(int siembraId, int seguimientoId, int insumoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var eliminado = await seguimientoRepository.EliminarInsumoAsync(seguimientoId, insumoId);
        return eliminado ? NoContent() : NotFound();
    }

    // ---------- Documentos (por recorrida) ----------

    [HttpGet("{seguimientoId:int}/documentos")]
    public async Task<ActionResult<IReadOnlyList<SeguimientoDocumentoDto>>> ObtenerDocumentos(int siembraId, int seguimientoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var documentos = await seguimientoRepository.ObtenerDocumentosAsync(seguimientoId);
        return Ok(documentos);
    }

    [HttpPost("{seguimientoId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<SeguimientoDocumentoDto>> SubirDocumento(int siembraId, int seguimientoId, IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest("Debes adjuntar un archivo.");
        }

        var carpeta = Path.Combine(_uploadsRoot, siembraId.ToString(), seguimientoId.ToString());
        Directory.CreateDirectory(carpeta);

        var nombreEnDisco = $"{Guid.NewGuid()}_{Path.GetFileName(archivo.FileName)}";
        var rutaCompleta = Path.Combine(carpeta, nombreEnDisco);

        await using (var stream = System.IO.File.Create(rutaCompleta))
        {
            await archivo.CopyToAsync(stream);
        }

        var documento = await seguimientoRepository.AgregarDocumentoAsync(seguimientoId, archivo.FileName, rutaCompleta, usuario.UsuarioId);
        return Ok(documento);
    }

    [HttpGet("{seguimientoId:int}/documentos/{documentoId:int}/descargar")]
    public async Task<IActionResult> DescargarDocumento(int siembraId, int seguimientoId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await seguimientoRepository.ObtenerRutaDocumentoAsync(seguimientoId, documentoId);
        if (ruta is null || !System.IO.File.Exists(ruta))
        {
            return NotFound();
        }

        var bytes = await System.IO.File.ReadAllBytesAsync(ruta);
        var nombreOriginal = Path.GetFileName(ruta).Split('_', 2).Last();
        return File(bytes, "application/octet-stream", nombreOriginal);
    }

    [HttpDelete("{seguimientoId:int}/documentos/{documentoId:int}")]
    public async Task<IActionResult> EliminarDocumento(int siembraId, int seguimientoId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await seguimientoRepository.ObtenerRutaDocumentoAsync(seguimientoId, documentoId);
        var eliminado = await seguimientoRepository.EliminarDocumentoAsync(seguimientoId, documentoId);

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
