using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/siembras/{siembraId:int}/seguimientos")]
public class SeguimientosController(
    ISeguimientoRepository seguimientoRepository,
    ISiembraRepository siembraRepository,
    ILoteRepository loteRepository,
    IAuthTokenService authTokenService,
    IWebHostEnvironment environment,
    IPermisosService permisos) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "seguimientos");

    private static readonly string[] IncidenciasValidas = ["Plaga", "Maleza", "Enfermedad", "Ninguna"];
    private static readonly string[] TiposRegistroValidos = ["Siniestro", "Posemergente", "Refertilizacion"];
    private static readonly string[] SiniestrosValidos =
    [
        "Granizo", "Sequia / Estres hidrico", "Helada tardia", "Anegamiento / Inundacion",
        "Plagas de implantacion", "Fitotoxicidad por agroquimicos", "Encostramiento del suelo",
        "Falla de germinacion", "Incendio"
    ];
    private static readonly string[] AlcancesValidos = ["Parcial", "Total"];
    private static readonly string[] UnidadesInsumoValidas = ["Litros", "Kg"];

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
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Siembra, siembraId, RolesPermiso.RegistroCampo, "registrar seguimientos");

        var siembra = await siembraRepository.ObtenerPorIdAsync(siembraId);
        if (siembra is null)
        {
            return NotFound();
        }
        if (siembra.Deshabilitada) return Conflict("La siembra deshabilitada se conserva como historial y no admite nuevos seguimientos.");

        if (!string.Equals(siembra.EstadoSiembra, "Finalizado", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Primero debes finalizar la siembra para registrar seguimientos.");
        }

        var lote = await loteRepository.ObtenerPorIdAsync(siembra.LoteId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (lote is null) return NotFound();
        var validationError = ValidarRegistro(request, siembra.FechaInicio, lote.Coordenadas, siembra.CantidadHectareasTrabajadas);
        if (validationError is not null) return BadRequest(validationError);

        var seguimiento = await seguimientoRepository.CrearAsync(siembraId, request, siembra.CantidadHectareasTrabajadas, usuario.UsuarioId);
        return seguimiento is null ? NotFound() : Ok(seguimiento);
    }

    [HttpPut("{seguimientoId:int}")]
    public async Task<IActionResult> Actualizar(int siembraId, int seguimientoId, ActualizarSiembraSeguimientoRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.Seguimiento, seguimientoId, "editar seguimientos");

        var siembra = await siembraRepository.ObtenerPorIdAsync(siembraId);
        if (siembra is null) return NotFound();
        if (siembra.Deshabilitada) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");

        var lote = await loteRepository.ObtenerPorIdAsync(siembra.LoteId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (lote is null) return NotFound();
        var validationError = ValidarRegistro(request, siembra.FechaInicio, lote.Coordenadas, siembra.CantidadHectareasTrabajadas);
        if (validationError is not null) return BadRequest(validationError);

        var actual = await seguimientoRepository.ObtenerPorIdAsync(siembraId, seguimientoId);
        if (actual is null) return NotFound();
        if (actual.TipoRegistro != request.TipoRegistro) return BadRequest("No se puede cambiar el tipo de registro.");

        var actualizado = await seguimientoRepository.ActualizarAsync(siembraId, seguimientoId, request, siembra.CantidadHectareasTrabajadas);
        return actualizado ? NoContent() : NotFound();
    }

    [HttpDelete("{seguimientoId:int}")]
    public async Task<IActionResult> Eliminar(int siembraId, int seguimientoId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.Seguimiento, seguimientoId, "eliminar seguimientos");
        if (await SiembraDeshabilitadaAsync(siembraId)) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");

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
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Siembra, siembraId, RolesPermiso.Estructura, "finalizar el seguimiento");
        if (await SiembraDeshabilitadaAsync(siembraId)) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");
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
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.Seguimiento, seguimientoId, "cargar insumos en seguimientos");
        if (await SiembraDeshabilitadaAsync(siembraId)) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");

        if (!TiposInsumoValidos.Contains(request.Tipo ?? string.Empty))
        {
            return BadRequest("Tipo de insumo invalido.");
        }
        if (string.IsNullOrWhiteSpace(request.Marca) || string.IsNullOrWhiteSpace(request.Variedad) || request.CantidadAplicada is null || request.CantidadAplicada <= 0 || !UnidadesInsumoValidas.Contains(request.UnidadMedida ?? string.Empty))
            return BadRequest("Completá marca, droga, cantidad mayor que cero y unidad Litros o Kg.");

        var insumo = await seguimientoRepository.AgregarInsumoAsync(seguimientoId, request);
        return Ok(insumo);
    }

    [HttpDelete("{seguimientoId:int}/insumos/{insumoId:int}")]
    public async Task<IActionResult> EliminarInsumo(int siembraId, int seguimientoId, int insumoId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.Seguimiento, seguimientoId, "eliminar insumos de seguimientos");
        if (await SiembraDeshabilitadaAsync(siembraId)) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");
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
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.Seguimiento, seguimientoId, "adjuntar documentos a seguimientos");
        if (await SiembraDeshabilitadaAsync(siembraId)) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");

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
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.Seguimiento, seguimientoId, "eliminar documentos de seguimientos");
        if (await SiembraDeshabilitadaAsync(siembraId)) return Conflict("La siembra deshabilitada se conserva como historial y no admite cambios.");

        var ruta = await seguimientoRepository.ObtenerRutaDocumentoAsync(seguimientoId, documentoId);
        var eliminado = await seguimientoRepository.EliminarDocumentoAsync(seguimientoId, documentoId);

        if (eliminado && ruta is not null && System.IO.File.Exists(ruta))
        {
            System.IO.File.Delete(ruta);
        }

        return eliminado ? NoContent() : NotFound();
    }

    private async Task<bool> SiembraDeshabilitadaAsync(int siembraId) =>
        (await siembraRepository.ObtenerPorIdAsync(siembraId))?.Deshabilitada == true;

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

    private static string? ValidarRegistro(CrearSiembraSeguimientoRequest request, DateTime fechaInicioSiembra, IReadOnlyList<LoteCoordenadaDto> coordenadasLote, decimal? hectareasSembradas)
    {
        if (!TiposRegistroValidos.Contains(request.TipoRegistro))
            return "Tipo de seguimiento invalido.";

        if (request.Fecha is null)
            return "La fecha del seguimiento es obligatoria.";

        if (request.TipoRegistro == "Refertilizacion")
        {
            if (request.Fecha.Value.Date <= fechaInicioSiembra.Date || request.Fecha.Value.Date > fechaInicioSiembra.Date.AddMonths(4))
                return $"La fecha debe ser posterior a la siembra y no superar los cuatro meses desde {fechaInicioSiembra:dd/MM/yyyy}.";
            if (hectareasSembradas is null or <= 0)
                return "La siembra no tiene hectáreas sembradas válidas.";
            if (request.UreaKgHa is null or < 1 or > 500)
                return "La urea debe estar entre 1 y 500 kg/ha.";
            if (request.HectareasHora is null or <= 0)
                return "Las hectáreas por hora deben ser mayores que cero.";
            if (request.HectareasHora > 10000)
                return "Las hectáreas por hora exceden el máximo admitido.";
            return null;
        }

        if (request.Latitud is null || request.Longitud is null)
            return "Debes marcar el punto del seguimiento en el mapa.";

        if (!GeoUtils.PuntoDentroDelPoligono(request.Latitud.Value, request.Longitud.Value, coordenadasLote))
            return "El punto del seguimiento debe ubicarse dentro del polígono del lote.";

        var fecha = request.Fecha.Value.Date;
        if (fecha <= fechaInicioSiembra.Date || fecha > fechaInicioSiembra.Date.AddMonths(6))
            return $"La fecha debe ser posterior a la siembra y no superar los seis meses desde {fechaInicioSiembra:dd/MM/yyyy}.";

        if (string.IsNullOrWhiteSpace(request.Observaciones))
            return "Las observaciones son obligatorias.";

        if (!AlcancesValidos.Contains(request.Alcance ?? string.Empty))
            return "El alcance debe ser Parcial o Total.";

        if (request.TipoRegistro == "Siniestro")
        {
            if (!SiniestrosValidos.Contains(request.Siniestro ?? string.Empty))
                return "Siniestro invalido.";
            if (!string.IsNullOrWhiteSpace(request.Incidencia))
                return "Un siniestro no puede registrar un motivo de aplicacion.";
            return null;
        }

        if (!IncidenciasValidas.Where(valor => valor != "Ninguna").Contains(request.Incidencia ?? string.Empty))
            return "Motivo de aplicacion invalido.";

        if (request.AplicacionAgroquimicos != true)
            return "El posemergente requiere registrar agroquimicos.";

        return null;
    }

    private static string? ValidarRegistro(ActualizarSiembraSeguimientoRequest request, DateTime fechaInicioSiembra, IReadOnlyList<LoteCoordenadaDto> coordenadasLote, decimal? hectareasSembradas) =>
        ValidarRegistro(new CrearSiembraSeguimientoRequest
        {
            Fecha = request.Fecha,
            Longitud = request.Longitud,
            Latitud = request.Latitud,
            TipoRegistro = request.TipoRegistro,
            Siniestro = request.Siniestro,
            Alcance = request.Alcance,
            Incidencia = request.Incidencia,
            PerdidaEconomica = request.PerdidaEconomica,
            AplicacionAgroquimicos = request.AplicacionAgroquimicos,
            Observaciones = request.Observaciones,
            UreaKgHa = request.UreaKgHa,
            HectareasHora = request.HectareasHora
        }, fechaInicioSiembra, coordenadasLote, hectareasSembradas);
}
