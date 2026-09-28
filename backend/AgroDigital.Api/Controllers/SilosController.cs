using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SilosController(
    ISiloRepository siloRepository,
    ILoteRepository loteRepository,
    IAlmacenamientoRepository almacenamientoRepository,
    IAuthTokenService authTokenService,
    IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "silos");

    private static readonly string[] TiposPlagaValidos = ["Roedores", "Insectos", "Hongos"];
    private static readonly string[] EstadosElegibles = ["En mantenimiento", "Dado de baja", "Activo"];
    private static readonly string[] EstadosGranoValidos = ["Bueno", "Regular", "Deteriorado"];

    private static readonly string[] TiposInsumoValidos =
    [
        "Herbicidas", "Insecticidas", "Fungicidas", "Acaricidas",
        "Nematicidas", "Raticidas", "Bactericidas", "Molusquicidas"
    ];

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SiloDto>>> ObtenerTodos()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var silos = await siloRepository.ObtenerTodosAsync(usuario.UsuarioId, usuario.Rol == "Admin");
        return Ok(silos);
    }

    [HttpGet("{siloId:int}")]
    public async Task<ActionResult<SiloDto>> ObtenerPorId(int siloId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var silo = await siloRepository.ObtenerPorIdAsync(siloId, usuario.UsuarioId, usuario.Rol == "Admin");
        return silo is null ? NotFound() : Ok(silo);
    }

    // SILO-03: ficha del silo (datos, partidas, serie de controles y movimientos).
    [HttpGet("{siloId:int}/ficha")]
    public async Task<ActionResult<SiloFichaDto>> ObtenerFicha(int siloId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var ficha = await siloRepository.ObtenerFichaAsync(siloId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (ficha is null) return NotFound();

        // El acceso ya se valido con el silo; los movimientos salen de Almacenamiento.
        ficha.Movimientos = await almacenamientoRepository.ObtenerPorSiloAsync(siloId);
        return Ok(ficha);
    }

    [HttpPost]
    public async Task<ActionResult<SiloDto>> Crear(CrearSiloRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var esAdmin = usuario.Rol == "Admin";

        var validacion = await ValidarFormularioAsync(request, usuario.UsuarioId, esAdmin);
        if (validacion is not null) return BadRequest(validacion);

        // Paso 4 del wizard: grano inicial opcional.
        if (request.CantidadGranoAlmacenado is < 0)
        {
            return BadRequest("La cantidad de grano inicial no puede ser negativa.");
        }

        if (request.CantidadGranoAlmacenado is > 0)
        {
            if (string.IsNullOrWhiteSpace(request.Producto))
            {
                return BadRequest("Indica el grano que ya tiene el silo.");
            }

            if (request.CantidadGranoAlmacenado > request.CapacidadMax)
            {
                return BadRequest("El grano inicial no puede superar la capacidad maxima del silo.");
            }
        }

        SiloDto silo;
        try
        {
            silo = await siloRepository.CrearAsync(request, usuario.UsuarioId, esAdmin);
        }
        catch (SiloNombreDuplicadoException ex)
        {
            return Conflict(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        // ALM-04: si el silo se dio de alta con stock inicial, genera el
        // Ingreso automatico en Almacenamiento (visible desde Consultar
        // Almacenamientos aunque no se haya cargado desde esa pantalla).
        if (request.CantidadGranoAlmacenado is > 0)
        {
            await almacenamientoRepository.RegistrarMovimientoAutomaticoAsync(
                silo.SiloId,
                tipoMovimiento: "Ingreso",
                cantidad: request.CantidadGranoAlmacenado.Value,
                origen: "AltaSilo",
                observaciones: "Ingreso automatico por alta de silo con stock inicial.",
                usuario.UsuarioId);
        }

        return CreatedAtAction(nameof(ObtenerPorId), new { siloId = silo.SiloId }, silo);
    }

    [HttpPut("{siloId:int}")]
    public async Task<IActionResult> Actualizar(int siloId, ActualizarSiloRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        var esAdmin = usuario.Rol == "Admin";

        var validacion = await ValidarFormularioAsync(request, usuario.UsuarioId, esAdmin);
        if (validacion is not null) return BadRequest(validacion);

        try
        {
            var actualizado = await siloRepository.ActualizarAsync(siloId, request, usuario.UsuarioId, esAdmin);
            return actualizado ? NoContent() : NotFound();
        }
        catch (SiloNombreDuplicadoException ex)
        {
            return Conflict(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // SILO-07: poner en mantenimiento, dar de baja o reactivar un silo.
    [HttpPut("{siloId:int}/estado")]
    public async Task<IActionResult> CambiarEstado(int siloId, CambiarEstadoSiloRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var estado = request.Estado?.Trim() ?? string.Empty;
        if (!EstadosElegibles.Contains(estado))
        {
            return BadRequest("El estado debe ser 'En mantenimiento', 'Dado de baja' o 'Activo'.");
        }

        try
        {
            var actualizado = await siloRepository.CambiarEstadoAsync(siloId, estado, usuario.UsuarioId, usuario.Rol == "Admin");
            return actualizado ? NoContent() : NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>
    /// Validaciones del formulario de silo, comunes al alta y a la edicion.
    /// Devuelve el mensaje de error, o null si todo esta bien.
    /// </summary>
    private async Task<string?> ValidarFormularioAsync(ISiloFormulario request, int usuarioId, bool esAdmin)
    {
        if (string.IsNullOrWhiteSpace(request.Nombre)
            || string.IsNullOrWhiteSpace(request.TipoSilo)
            || string.IsNullOrWhiteSpace(request.Pais)
            || string.IsNullOrWhiteSpace(request.Provincia)
            || string.IsNullOrWhiteSpace(request.Ciudad))
        {
            return "Nombre, Tipo de Silo, Capacidad Maxima y Ubicacion son obligatorios.";
        }

        if (request.Nombre.Trim().Length > 100)
        {
            return "El nombre admite hasta 100 caracteres.";
        }

        if (request.TipoSilo != "Chapa" && request.TipoSilo != "Bolson")
        {
            return "Tipo de Silo debe ser 'Chapa' o 'Bolson'.";
        }

        if (request.CapacidadMax <= 0)
        {
            return "La Capacidad Maxima debe ser mayor a cero.";
        }

        // Caracteristicas segun el tipo (los campos del otro tipo se ignoran).
        if (request.TipoSilo == "Chapa")
        {
            if (request.DiametroM is <= 0) return "El diametro debe ser mayor a cero.";
            if (request.AlturaM is <= 0) return "La altura debe ser mayor a cero.";
        }
        else
        {
            if (request.LargoM is null or <= 0) return "El largo del bolson es obligatorio y debe ser mayor a cero.";
            if (request.DiametroBolsonPies is null or <= 0) return "El diametro del bolson es obligatorio.";
            if (request.FechaEmbolsado is null) return "La fecha de embolsado es obligatoria.";
            if (request.FechaEmbolsado > DateOnly.FromDateTime(DateTime.Today)) return "La fecha de embolsado no puede ser posterior a hoy.";
            if (request.FechaVencimientoEstimada is not null && request.FechaVencimientoEstimada < request.FechaEmbolsado)
                return "El vencimiento estimado no puede ser anterior al embolsado.";
            if (request.IdentificacionEnLote?.Trim().Length > 120) return "La identificacion en el lote admite hasta 120 caracteres.";
        }

        // Ubicacion georreferenciada: los dos valores o ninguno.
        if (request.Latitud.HasValue != request.Longitud.HasValue)
        {
            return "Marca el punto del silo en el mapa (faltan coordenadas).";
        }

        if (request.Latitud is < -90 or > 90 || request.Longitud is < -180 or > 180)
        {
            return "Las coordenadas del silo no son validas.";
        }

        if (request.LoteId.HasValue)
        {
            var lote = await loteRepository.ObtenerPorIdAsync(request.LoteId.Value, usuarioId, esAdmin);
            if (lote is null)
            {
                return "El lote indicado no existe o no pertenece a tus empresas.";
            }

            // Misma validacion que Seguimientos: el punto tiene que caer dentro del lote.
            if (request.Latitud.HasValue && lote.Coordenadas.Count >= 3
                && !GeoUtils.PuntoDentroDelPoligono(request.Latitud.Value, request.Longitud!.Value, lote.Coordenadas))
            {
                return $"El punto del silo debe ubicarse dentro del poligono del lote {lote.Nombre}.";
            }
        }

        return null;
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

        var fecha = request.Fecha ?? DateTime.Now;
        var validacion = ValidarControl(request.HumedadGrano, request.Temperatura, request.EstadoGrano, fecha, request.FechaProximoControl);
        if (validacion is not null) return BadRequest(validacion);

        var contexto = await siloRepository.ObtenerContextoControlAsync(siloId, fecha, null, usuario.UsuarioId, usuario.Rol == "Admin");
        if (contexto is null) return NotFound();

        var evaluacion = EvaluadorControlSilo.Evaluar(contexto, request.HumedadGrano, request.Temperatura, request.EstadoGrano, request.RoturaBolsa, fecha);
        var fechaProximo = request.FechaProximoControl ?? evaluacion.FechaProximoControlSugerida;

        var control = await siloRepository.RegistrarControlAsync(siloId, request, usuario.UsuarioId, evaluacion.Resultado, fechaProximo);
        return control is null ? NotFound() : Ok(control);
    }

    // SILO-04: evalua un control sin guardarlo, para mostrar el resultado en vivo.
    // controlId se indica al editar, para comparar contra el control anterior a ese.
    [HttpPost("{siloId:int}/controles/evaluar")]
    public async Task<ActionResult<EvaluacionControlDto>> EvaluarControl(int siloId, CrearSiloControlRequest request, [FromQuery] int? controlId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var fecha = request.Fecha ?? DateTime.Now;
        var estado = string.IsNullOrWhiteSpace(request.EstadoGrano) ? "Bueno" : request.EstadoGrano;

        var contexto = await siloRepository.ObtenerContextoControlAsync(siloId, fecha, controlId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (contexto is null) return NotFound();

        return Ok(EvaluadorControlSilo.Evaluar(contexto, request.HumedadGrano, request.Temperatura, estado, request.RoturaBolsa, fecha));
    }

    [HttpPut("{siloId:int}/controles/{controlId:int}")]
    public async Task<IActionResult> ActualizarControl(int siloId, int controlId, ActualizarSiloControlRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var fecha = request.Fecha ?? DateTime.Now;
        var validacion = ValidarControl(request.HumedadGrano, request.Temperatura, request.EstadoGrano, fecha, request.FechaProximoControl);
        if (validacion is not null) return BadRequest(validacion);

        var contexto = await siloRepository.ObtenerContextoControlAsync(siloId, fecha, controlId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (contexto is null) return NotFound();

        var evaluacion = EvaluadorControlSilo.Evaluar(contexto, request.HumedadGrano, request.Temperatura, request.EstadoGrano, request.RoturaBolsa, fecha);
        var fechaProximo = request.FechaProximoControl ?? evaluacion.FechaProximoControlSugerida;

        var actualizado = await siloRepository.ActualizarControlAsync(siloId, controlId, request, evaluacion.Resultado, fechaProximo);
        return actualizado ? NoContent() : NotFound();
    }

    private static string? ValidarControl(decimal humedad, decimal temperatura, string estadoGrano, DateTime fecha, DateOnly? fechaProximo)
    {
        if (string.IsNullOrWhiteSpace(estadoGrano))
        {
            return "El Estado del grano es obligatorio.";
        }

        if (!EstadosGranoValidos.Contains(estadoGrano.Trim()))
        {
            return "El Estado del grano debe ser 'Bueno', 'Regular' o 'Deteriorado'.";
        }

        if (humedad is < 0 or > 100)
        {
            return "La humedad del grano debe estar entre 0 y 100 %.";
        }

        if (temperatura is < -30 or > 80)
        {
            return "La temperatura debe estar entre -30 y 80 °C.";
        }

        if (fechaProximo.HasValue && fechaProximo.Value <= DateOnly.FromDateTime(fecha))
        {
            return "La fecha del proximo control debe ser posterior a la del control.";
        }

        return null;
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
