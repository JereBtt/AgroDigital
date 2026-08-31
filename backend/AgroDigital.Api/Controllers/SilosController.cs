using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SilosController(ISiloRepository siloRepository, IAuthTokenService authTokenService, IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "silos");

    private static readonly string[] TiposPlagaValidos = ["Roedores", "Insectos", "Hongos"];

    private static readonly string[] TiposInsumoValidos =
    [
        "Herbicidas", "Insecticidas", "Fungicidas", "Acaricidas",
        "Nematicidas", "Raticidas", "Bactericidas", "Molusquicidas"
    ];

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SiloDto>>> ObtenerTodos()
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var silos = await siloRepository.ObtenerTodosAsync();
        return Ok(silos);
    }

    [HttpGet("{siloId:int}")]
    public async Task<ActionResult<SiloDto>> ObtenerPorId(int siloId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var silo = await siloRepository.ObtenerPorIdAsync(siloId);
        return silo is null ? NotFound() : Ok(silo);
    }

    [HttpPost]
    public async Task<ActionResult<SiloDto>> Crear(CrearSiloRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (string.IsNullOrWhiteSpace(request.Nombre)
            || string.IsNullOrWhiteSpace(request.TipoSilo)
            || string.IsNullOrWhiteSpace(request.Pais)
            || string.IsNullOrWhiteSpace(request.Provincia)
            || string.IsNullOrWhiteSpace(request.Ciudad))
        {
            return BadRequest("Nombre, Tipo de Silo, Capacidad Maxima y Ubicacion son obligatorios.");
        }

        if (request.TipoSilo != "Chapa" && request.TipoSilo != "Bolson")
        {
            return BadRequest("Tipo de Silo debe ser 'Chapa' o 'Bolson'.");
        }

        if (request.CapacidadMax <= 0)
        {
            return BadRequest("La Capacidad Maxima debe ser mayor a cero.");
        }

        var silo = await siloRepository.CrearAsync(request, usuario.UsuarioId);
        return CreatedAtAction(nameof(ObtenerPorId), new { siloId = silo.SiloId }, silo);
    }

    [HttpPut("{siloId:int}")]
    public async Task<IActionResult> Actualizar(int siloId, ActualizarSiloRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (request.TipoSilo != "Chapa" && request.TipoSilo != "Bolson")
        {
            return BadRequest("Tipo de Silo debe ser 'Chapa' o 'Bolson'.");
        }

        var actualizado = await siloRepository.ActualizarAsync(siloId, request);
        return actualizado ? NoContent() : NotFound();
    }

    // ---------- Controles ----------

    [HttpGet("{siloId:int}/controles")]
    public async Task<ActionResult<IReadOnlyList<SiloControlDto>>> ObtenerControles(int siloId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var controles = await siloRepository.ObtenerControlesAsync(siloId);
        return Ok(controles);
    }

    [HttpGet("{siloId:int}/controles/{controlId:int}")]
    public async Task<ActionResult<SiloControlDto>> ObtenerControlPorId(int siloId, int controlId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var control = await siloRepository.ObtenerControlPorIdAsync(siloId, controlId);
        return control is null ? NotFound() : Ok(control);
    }

    [HttpPost("{siloId:int}/controles")]
    public async Task<ActionResult<SiloControlDto>> RegistrarControl(int siloId, CrearSiloControlRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (string.IsNullOrWhiteSpace(request.EstadoGrano))
        {
            return BadRequest("El Estado del grano es obligatorio.");
        }

        var control = await siloRepository.RegistrarControlAsync(siloId, request, usuario.UsuarioId);
        return control is null ? NotFound() : Ok(control);
    }

    [HttpPut("{siloId:int}/controles/{controlId:int}")]
    public async Task<IActionResult> ActualizarControl(int siloId, int controlId, ActualizarSiloControlRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (string.IsNullOrWhiteSpace(request.EstadoGrano))
        {
            return BadRequest("El Estado del grano es obligatorio.");
        }

        var actualizado = await siloRepository.ActualizarControlAsync(siloId, controlId, request);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpDelete("{siloId:int}/controles/{controlId:int}")]
    public async Task<IActionResult> EliminarControl(int siloId, int controlId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var rutas = await siloRepository.ObtenerRutasDocumentosDeControlAsync(controlId);
        var eliminado = await siloRepository.EliminarControlAsync(siloId, controlId);

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

    // ---------- Incidencias (por control) ----------

    [HttpGet("{siloId:int}/controles/{controlId:int}/incidencias")]
    public async Task<ActionResult<IReadOnlyList<SiloControlIncidenciaDto>>> ObtenerIncidencias(int siloId, int controlId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var incidencias = await siloRepository.ObtenerIncidenciasAsync(controlId);
        return Ok(incidencias);
    }

    [HttpPost("{siloId:int}/controles/{controlId:int}/incidencias")]
    public async Task<ActionResult<SiloControlIncidenciaDto>> AgregarIncidencia(int siloId, int controlId, CrearSiloControlIncidenciaRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (string.IsNullOrWhiteSpace(request.TipoPlaga) || !TiposPlagaValidos.Contains(request.TipoPlaga))
        {
            return BadRequest("Tipo de Plaga debe ser 'Roedores', 'Insectos' o 'Hongos'.");
        }

        if (string.IsNullOrWhiteSpace(request.Observaciones))
        {
            return BadRequest("Las Observaciones son obligatorias.");
        }

        var incidencia = await siloRepository.AgregarIncidenciaAsync(controlId, request);
        return Ok(incidencia);
    }

    [HttpDelete("{siloId:int}/controles/{controlId:int}/incidencias/{incidenciaId:int}")]
    public async Task<IActionResult> EliminarIncidencia(int siloId, int controlId, int incidenciaId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var eliminado = await siloRepository.EliminarIncidenciaAsync(controlId, incidenciaId);
        return eliminado ? NoContent() : NotFound();
    }

    // ---------- Insumos (por control) ----------

    [HttpGet("{siloId:int}/controles/{controlId:int}/insumos")]
    public async Task<ActionResult<IReadOnlyList<SiloControlInsumoDto>>> ObtenerInsumos(int siloId, int controlId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var insumos = await siloRepository.ObtenerInsumosAsync(controlId);
        return Ok(insumos);
    }

    [HttpPost("{siloId:int}/controles/{controlId:int}/insumos")]
    public async Task<ActionResult<SiloControlInsumoDto>> AgregarInsumo(int siloId, int controlId, CrearSiloControlInsumoRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        if (!string.IsNullOrWhiteSpace(request.Tipo) && !TiposInsumoValidos.Contains(request.Tipo))
        {
            return BadRequest("Tipo de insumo invalido.");
        }

        var insumo = await siloRepository.AgregarInsumoAsync(controlId, request);
        return Ok(insumo);
    }

    [HttpDelete("{siloId:int}/controles/{controlId:int}/insumos/{insumoId:int}")]
    public async Task<IActionResult> EliminarInsumo(int siloId, int controlId, int insumoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var eliminado = await siloRepository.EliminarInsumoAsync(controlId, insumoId);
        return eliminado ? NoContent() : NotFound();
    }

    // ---------- Documentos (por control) ----------

    [HttpGet("{siloId:int}/controles/{controlId:int}/documentos")]
    public async Task<ActionResult<IReadOnlyList<SiloDocumentoDto>>> ObtenerDocumentos(int siloId, int controlId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;
        var documentos = await siloRepository.ObtenerDocumentosAsync(controlId);
        return Ok(documentos);
    }

    [HttpPost("{siloId:int}/controles/{controlId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<SiloDocumentoDto>> SubirDocumento(int siloId, int controlId, IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest("Debes adjuntar un archivo.");
        }

        var controlCarpeta = Path.Combine(_uploadsRoot, siloId.ToString(), controlId.ToString());
        Directory.CreateDirectory(controlCarpeta);

        var nombreEnDisco = $"{Guid.NewGuid()}_{Path.GetFileName(archivo.FileName)}";
        var rutaCompleta = Path.Combine(controlCarpeta, nombreEnDisco);

        await using (var stream = System.IO.File.Create(rutaCompleta))
        {
            await archivo.CopyToAsync(stream);
        }

        var documento = await siloRepository.AgregarDocumentoAsync(controlId, archivo.FileName, rutaCompleta, usuario.UsuarioId);
        return Ok(documento);
    }

    [HttpGet("{siloId:int}/controles/{controlId:int}/documentos/{documentoId:int}/descargar")]
    public async Task<IActionResult> DescargarDocumento(int siloId, int controlId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await siloRepository.ObtenerRutaDocumentoAsync(controlId, documentoId);
        if (ruta is null || !System.IO.File.Exists(ruta))
        {
            return NotFound();
        }

        var bytes = await System.IO.File.ReadAllBytesAsync(ruta);
        var nombreOriginal = Path.GetFileName(ruta).Split('_', 2).Last();
        return File(bytes, "application/octet-stream", nombreOriginal);
    }

    [HttpDelete("{siloId:int}/controles/{controlId:int}/documentos/{documentoId:int}")]
    public async Task<IActionResult> EliminarDocumento(int siloId, int controlId, int documentoId)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var ruta = await siloRepository.ObtenerRutaDocumentoAsync(controlId, documentoId);
        var eliminado = await siloRepository.EliminarDocumentoAsync(controlId, documentoId);

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
