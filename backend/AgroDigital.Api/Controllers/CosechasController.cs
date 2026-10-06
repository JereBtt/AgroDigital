using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/*
    Modulo Cosechas.

    Permisos (28_permisos_autor_seguimientos.sql):
      - Consulta: cualquier rol de la empresa.
      - Alta, edicion, finalizar cosecha, finalizar control y documentos: Gerente y Encargado.
      - Tiradas de aros y partes diarios: Gerente, Encargado y Empleado de campo
        (el Empleado de campo solo edita o elimina lo que cargo el).

    Errores: 400 regla de negocio, 409 estado incompatible o duplicado,
    403 rol sin permiso, 404 inexistente o de otra empresa.
*/
[ApiController]
[Route("api/[controller]")]
public class CosechasController(
    ICosechaRepository cosechaRepository,
    ILoteRepository loteRepository,
    IAuthTokenService authTokenService,
    IWebHostEnvironment environment,
    IPermisosService permisos) : ControllerBase
{
    private static readonly string[] RolesConsulta = ["Gerente", "Encargado", "EmpleadoCampo", "EmpleadoAdministrativo"];
    private static readonly string[] TiposServicio = ["Propia", "Contratada"];
    private static readonly string[] DestinosParte = ["Silo", "Distribucion directa", "Pendiente"];
    private const int MesesMaximoCosecha = 6;

    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "cosechas");

    // =====================================================================
    // Consulta
    // =====================================================================

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CosechaDto>>> ObtenerTodos()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        return Ok(await cosechaRepository.ObtenerTodosAsync(usuario.UsuarioId, EsAdmin(usuario)));
    }

    /// <summary>Siembras que se pueden cosechar: finalizadas, ultimas de su cadena y sin cosecha.</summary>
    [HttpGet("siembras-disponibles")]
    public async Task<ActionResult<IReadOnlyList<SiembraParaCosechaDto>>> ObtenerSiembrasDisponibles()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        return Ok(await cosechaRepository.ObtenerSiembrasDisponiblesAsync(usuario.UsuarioId, EsAdmin(usuario)));
    }

    [HttpGet("{cosechaId:int}")]
    public async Task<ActionResult<CosechaDto>> ObtenerPorId(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesConsulta, "consultar cosechas");

        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        return cosecha is null ? NotFound() : Ok(cosecha);
    }

    // =====================================================================
    // Alta, edicion y cierre
    // =====================================================================

    [HttpPost]
    public async Task<IActionResult> Crear(CrearCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarAlta(request);
        if (validacion is not null) return BadRequest(validacion);

        await permisos.ExigirAsync(usuario, RecursoOperativo.Siembra, request.SiembraId, RolesPermiso.Estructura, "registrar cosechas");

        return await EjecutarAsync(async () =>
        {
            var cosecha = await cosechaRepository.CrearAsync(request, usuario.UsuarioId);
            return CreatedAtAction(nameof(ObtenerPorId), new { cosechaId = cosecha.CosechaId }, cosecha);
        });
    }

    [HttpPut("{cosechaId:int}")]
    public async Task<IActionResult> Actualizar(int cosechaId, ActualizarCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarEdicion(request);
        if (validacion is not null) return BadRequest(validacion);

        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.Estructura, "editar cosechas");

        return await EjecutarAsync(async () =>
            await cosechaRepository.ActualizarAsync(cosechaId, request) ? NoContent() : (IActionResult)NotFound());
    }

    [HttpPost("{cosechaId:int}/finalizar")]
    public async Task<IActionResult> Finalizar(int cosechaId, FinalizarCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarFinalizacion(request);
        if (validacion is not null) return BadRequest(validacion);

        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.Estructura, "finalizar cosechas");

        return await EjecutarAsync(async () =>
        {
            await cosechaRepository.FinalizarAsync(cosechaId, request);
            return NoContent();
        });
    }

    // =====================================================================
    // Control de perdidas (Tirada de Aros)
    // =====================================================================

    [HttpGet("{cosechaId:int}/tirada-aros")]
    public async Task<ActionResult<IReadOnlyList<CosechaTiradaAroDto>>> ObtenerTiradas(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesConsulta, "consultar tiradas de aros");
        return Ok(await cosechaRepository.ObtenerTiradasAsync(cosechaId));
    }

    /// <summary>Tolerancia, factor de severidad y PMG con que se clasifican las tiradas de la cosecha.</summary>
    [HttpGet("{cosechaId:int}/tirada-aros/parametros")]
    public async Task<IActionResult> ObtenerParametrosPerdida(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesConsulta, "consultar tiradas de aros");
        return await EjecutarAsync(async () => Ok(await cosechaRepository.ObtenerParametrosPerdidaAsync(cosechaId)));
    }

    [HttpPost("{cosechaId:int}/tirada-aros")]
    public async Task<IActionResult> AgregarTirada(int cosechaId, CrearCosechaTiradaAroRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.RegistroCampo, "registrar tiradas de aros");

        var validacion = await ValidarTiradaAsync(cosechaId, request, usuario);
        if (validacion is not null) return BadRequest(validacion);

        return await EjecutarAsync(async () => Ok(await cosechaRepository.AgregarTiradaAsync(cosechaId, request, usuario.UsuarioId)));
    }

    [HttpPut("{cosechaId:int}/tirada-aros/{tiradaId:int}")]
    public async Task<IActionResult> ActualizarTirada(int cosechaId, int tiradaId, ActualizarCosechaTiradaAroRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.TiradaAros, tiradaId, "editar tiradas de aros");

        var validacion = await ValidarTiradaAsync(cosechaId, request, usuario);
        if (validacion is not null) return BadRequest(validacion);

        return await EjecutarAsync(async () =>
            await cosechaRepository.ActualizarTiradaAsync(cosechaId, tiradaId, request) ? NoContent() : (IActionResult)NotFound());
    }

    [HttpDelete("{cosechaId:int}/tirada-aros/{tiradaId:int}")]
    public async Task<IActionResult> EliminarTirada(int cosechaId, int tiradaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.TiradaAros, tiradaId, "eliminar tiradas de aros");

        return await EjecutarAsync(async () =>
            await cosechaRepository.EliminarTiradaAsync(cosechaId, tiradaId) ? NoContent() : (IActionResult)NotFound());
    }

    /// <summary>Cierra el control de perdidas: no se cargan mas tiradas. No finaliza la cosecha.</summary>
    [HttpPost("{cosechaId:int}/control/finalizar")]
    public async Task<IActionResult> FinalizarControl(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.Estructura, "finalizar el control de pérdidas");

        return await EjecutarAsync(async () =>
        {
            await cosechaRepository.FinalizarControlAsync(cosechaId);
            return NoContent();
        });
    }

    // =====================================================================
    // Partes diarios de avance
    // =====================================================================

    [HttpGet("{cosechaId:int}/partes")]
    public async Task<ActionResult<IReadOnlyList<CosechaParteDto>>> ObtenerPartes(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesConsulta, "consultar partes de cosecha");
        return Ok(await cosechaRepository.ObtenerPartesAsync(cosechaId));
    }

    [HttpPost("{cosechaId:int}/partes")]
    public async Task<IActionResult> AgregarParte(int cosechaId, CrearCosechaParteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarParte(request);
        if (validacion is not null) return BadRequest(validacion);

        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.RegistroCampo, "registrar partes de cosecha");

        return await EjecutarAsync(async () => Ok(await cosechaRepository.AgregarParteAsync(cosechaId, request, usuario.UsuarioId)));
    }

    [HttpPut("{cosechaId:int}/partes/{parteId:int}")]
    public async Task<IActionResult> ActualizarParte(int cosechaId, int parteId, ActualizarCosechaParteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = ValidarParte(request);
        if (validacion is not null) return BadRequest(validacion);

        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.ParteCosecha, parteId, "editar partes de cosecha");

        return await EjecutarAsync(async () =>
            await cosechaRepository.ActualizarParteAsync(cosechaId, parteId, request) ? NoContent() : (IActionResult)NotFound());
    }

    [HttpDelete("{cosechaId:int}/partes/{parteId:int}")]
    public async Task<IActionResult> EliminarParte(int cosechaId, int parteId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirEdicionRegistroCampoAsync(usuario, RecursoOperativo.ParteCosecha, parteId, "eliminar partes de cosecha");

        return await EjecutarAsync(async () =>
            await cosechaRepository.EliminarParteAsync(cosechaId, parteId) ? NoContent() : (IActionResult)NotFound());
    }

    // =====================================================================
    // Documentacion
    // =====================================================================

    [HttpGet("{cosechaId:int}/documentos")]
    public async Task<ActionResult<IReadOnlyList<CosechaDocumentoDto>>> ObtenerDocumentos(int cosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesConsulta, "consultar documentos de cosechas");
        return Ok(await cosechaRepository.ObtenerDocumentosAsync(cosechaId));
    }

    [HttpPost("{cosechaId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<CosechaDocumentoDto>> SubirDocumento(int cosechaId, IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.Estructura, "adjuntar documentos a cosechas");

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
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesConsulta, "descargar documentos de cosechas");

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
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        await permisos.ExigirAsync(usuario, RecursoOperativo.Cosecha, cosechaId, RolesPermiso.Estructura, "eliminar documentos de cosechas");

        var ruta = await cosechaRepository.ObtenerRutaDocumentoAsync(cosechaId, documentoId);
        var eliminado = await cosechaRepository.EliminarDocumentoAsync(cosechaId, documentoId);

        if (eliminado && ruta is not null && System.IO.File.Exists(ruta))
        {
            System.IO.File.Delete(ruta);
        }

        return eliminado ? NoContent() : NotFound();
    }

    // =====================================================================
    // Validaciones de formato (las que dependen de la base estan en el repositorio)
    // =====================================================================

    private static string? ValidarAlta(CrearCosechaRequest request)
    {
        if (request.SiembraId <= 0) return "Seleccioná la siembra a cosechar.";
        return ValidarDatosGenerales(request.FechaInicio, request.FechaFin, request.ResponsableACargo,
            request.TipoServicio, request.Contratista, request.Cosechadora, request.AnchoCabezalM);
    }

    private static string? ValidarEdicion(ActualizarCosechaRequest request)
    {
        var general = ValidarDatosGenerales(request.FechaInicio, request.FechaFin, request.ResponsableACargo,
            request.TipoServicio, request.Contratista, request.Cosechadora, request.AnchoCabezalM);
        if (general is not null) return general;

        if (request.CantidadGranoCosechado is <= 0) return "La cantidad de grano cosechado debe ser mayor a cero.";
        if (request.CantidadHectareasTrabajadas is <= 0) return "Las hectáreas trabajadas deben ser mayores a cero.";
        if (request.HumedadGrano is < 0 or >= 100) return "La humedad del grano debe estar entre 0 y 100 %.";
        if (request.Impurezas is < 0 or >= 100) return "Las impurezas deben estar entre 0 y 100 %.";
        if (request.HectareasHora is <= 0) return "Las hectáreas por hora deben ser mayores a cero.";
        if (request.JustificacionDesvioFin?.Trim().Length > 1000) return "La justificación admite hasta 1000 caracteres.";
        return null;
    }

    private static string? ValidarDatosGenerales(
        DateTime fechaInicio, DateTime fechaFin, string? responsable, string? tipoServicio,
        string? contratista, string? cosechadora, decimal? anchoCabezal)
    {
        if (fechaInicio == default) return "La fecha de inicio es obligatoria.";
        if (fechaFin == default) return "La fecha tentativa de fin es obligatoria.";
        if (fechaFin.Date < fechaInicio.Date) return "La fecha tentativa de fin no puede ser anterior a la fecha de inicio.";
        if (fechaFin.Date > fechaInicio.Date.AddMonths(MesesMaximoCosecha))
            return $"La fecha tentativa de fin no puede superar los {MesesMaximoCosecha} meses desde el inicio.";
        if (string.IsNullOrWhiteSpace(responsable)) return "El responsable a cargo es obligatorio.";
        if (responsable.Trim().Length > 150) return "El responsable admite hasta 150 caracteres.";
        if (!string.IsNullOrWhiteSpace(tipoServicio) && !TiposServicio.Contains(tipoServicio))
            return "El tipo de servicio debe ser Propia o Contratada.";
        if (contratista?.Trim().Length > 150) return "El contratista admite hasta 150 caracteres.";
        if (cosechadora?.Trim().Length > 150) return "La cosechadora admite hasta 150 caracteres.";
        if (anchoCabezal is <= 0 or > 30) return "El ancho de cabezal debe ser mayor a 0 y hasta 30 m.";
        return null;
    }

    private static string? ValidarFinalizacion(FinalizarCosechaRequest request)
    {
        if (request.FechaFinReal == default) return "La fecha real de finalización es obligatoria.";
        if (request.CantidadGranoCosechado <= 0) return "La cantidad de grano cosechado debe ser mayor a cero.";
        if (request.CantidadHectareasTrabajadas <= 0) return "Las hectáreas trabajadas deben ser mayores a cero.";
        if (request.HumedadGrano is < 0 or >= 100) return "La humedad del grano debe estar entre 0 y 100 %.";
        if (request.Impurezas is < 0 or >= 100) return "Las impurezas deben estar entre 0 y 100 %.";
        if (request.HectareasHora <= 0) return "Las hectáreas por hora deben ser mayores a cero.";
        if (request.JustificacionDesvioFin?.Trim().Length > 1000) return "La justificación admite hasta 1000 caracteres.";
        return null;
    }

    private async Task<string?> ValidarTiradaAsync(int cosechaId, CrearCosechaTiradaAroRequest request, AuthenticatedUser usuario)
    {
        if (request.Fecha == default) return "La fecha del control es obligatoria.";
        if (request.AroCabezal < 0) return "El Aro Cabezal no puede ser negativo.";
        if (request.AroCola1 < 0 || request.AroCola2 < 0 || request.AroCola3 < 0) return "Los Aros Cola no pueden tener valores negativos.";
        if (request.GranosPrecosecha is < 0) return "Los granos de precosecha no pueden ser negativos.";
        if (request.PMG is <= 0 or > 1000) return "El PMG debe ser mayor a cero y hasta 1000 g.";
        if (request.Observaciones?.Trim().Length > 1000) return "Las observaciones admiten hasta 1000 caracteres.";
        if (request.Latitud is null || request.Longitud is null) return "Marcá en el mapa el punto donde se hizo la medición.";

        // El punto debe estar dentro del lote (misma regla que el seguimiento de siembra).
        var cosecha = await cosechaRepository.ObtenerPorIdAsync(cosechaId);
        if (cosecha is null) return "La cosecha no existe.";

        var lote = await loteRepository.ObtenerPorIdAsync(cosecha.LoteId, usuario.UsuarioId, EsAdmin(usuario));
        if (lote is not null && lote.Coordenadas.Count >= 3
            && !GeoUtils.PuntoDentroDelPoligono(request.Latitud.Value, request.Longitud.Value, lote.Coordenadas))
        {
            return "El punto de medición debe ubicarse dentro del polígono del lote.";
        }

        return null;
    }

    private static string? ValidarParte(CrearCosechaParteRequest request)
    {
        if (request.Fecha == default) return "La fecha del parte es obligatoria.";
        if (request.Hectareas <= 0) return "Las hectáreas del parte deben ser mayores a cero.";
        if (request.KgCosechados <= 0) return "Los kg cosechados deben ser mayores a cero.";
        if (request.HumedadPct is < 0 or >= 100) return "La humedad debe estar entre 0 y 100 %.";
        if (!DestinosParte.Contains(request.Destino)) return "El destino debe ser Silo, Distribucion directa o Pendiente.";
        if (request.Destino == "Silo" && request.SiloId is null or <= 0) return "Seleccioná el silo de destino.";
        if (request.Observaciones?.Trim().Length > 1000) return "Las observaciones admiten hasta 1000 caracteres.";
        return null;
    }

    // =====================================================================
    // Utilidades
    // =====================================================================

    /// <summary>Traduce las excepciones de negocio del repositorio a 400 / 409.</summary>
    private async Task<IActionResult> EjecutarAsync(Func<Task<IActionResult>> accion)
    {
        try
        {
            return await accion();
        }
        catch (ReglaCosechaException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (ConflictoCosechaException ex)
        {
            return Conflict(ex.Message);
        }
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
