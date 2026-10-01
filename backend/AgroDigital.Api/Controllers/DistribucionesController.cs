using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Modulo Distribucion: envios por camion / Carta de Porte, recepcion y conciliacion de mermas.
/// Errores: 400 validacion, 403 rol sin permiso, 404 inexistente o de otra empresa, 409 CPE duplicada.
/// </summary>
[ApiController]
[Route("api/distribuciones")]
public class DistribucionesController(
    IDistribucionRepository distribucionRepository,
    IAuthTokenService authTokenService,
    IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "distribuciones");

    private static readonly string[] OrigenesValidos = ["Cosecha", "Silo"];

    // ---------- Consultas (cualquier rol de la empresa) ----------

    // DIST-02: tabla principal, una fila por camion.
    [HttpGet("camiones")]
    public Task<ActionResult> ObtenerCamiones(
        [FromQuery] int? empresaId, [FromQuery] int? campaniaId, [FromQuery] string? estado,
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta) =>
        Ejecutar(async usuario => Ok(await distribucionRepository.ObtenerCamionesAsync(
            empresaId, campaniaId, estado, desde, hasta, usuario.UsuarioId, EsAdmin(usuario))));

    [HttpGet("indicadores")]
    public Task<ActionResult> ObtenerIndicadores(
        [FromQuery] int empresaId, [FromQuery] int? campaniaId, [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta) =>
        Ejecutar(async usuario =>
        {
            if (empresaId <= 0) return BadRequest("Debe indicar la empresa.");
            return Ok(await distribucionRepository.ObtenerIndicadoresAsync(
                empresaId, campaniaId, desde, hasta, usuario.UsuarioId, EsAdmin(usuario)));
        });

    // Kg que se pueden despachar (para el formulario de registro).
    [HttpGet("disponibilidad")]
    public Task<ActionResult> ObtenerDisponibilidad([FromQuery] int empresaId, [FromQuery] int? siloId, [FromQuery] int? cosechaId) =>
        Ejecutar(async usuario =>
        {
            if (empresaId <= 0) return BadRequest("Debe indicar la empresa.");
            if ((siloId is null) == (cosechaId is null)) return BadRequest("Indica un silo o una cosecha (solo uno).");
            return Ok(await distribucionRepository.ObtenerDisponibilidadAsync(
                empresaId, siloId, cosechaId, usuario.UsuarioId, EsAdmin(usuario)));
        });

    // DIST-03: detalle del envio.
    [HttpGet("{distribucionId:int}")]
    public Task<ActionResult> ObtenerPorId(int distribucionId) =>
        Ejecutar(async usuario =>
        {
            var envio = await distribucionRepository.ObtenerPorIdAsync(distribucionId, usuario.UsuarioId, EsAdmin(usuario));
            return envio is null ? NotFound() : Ok(envio);
        });

    // Detalle del camion con trazabilidad lote -> silo -> camion -> destino.
    [HttpGet("camiones/{distribucionCamionId:int}")]
    public Task<ActionResult> ObtenerTrazabilidad(int distribucionCamionId) =>
        Ejecutar(async usuario =>
        {
            var traza = await distribucionRepository.ObtenerTrazabilidadCamionAsync(distribucionCamionId, usuario.UsuarioId, EsAdmin(usuario));
            return traza is null ? NotFound() : Ok(traza);
        });

    // ---------- Alta y modificaciones (Encargado y Empleado Administrativo) ----------

    // DIST-01: registrar el envio con todos sus camiones.
    [HttpPost]
    public Task<ActionResult> Registrar(CrearDistribucionRequest request) =>
        Ejecutar(async usuario =>
        {
            var validacion = ValidarAlta(request);
            if (validacion is not null) return BadRequest(validacion);

            var envio = await distribucionRepository.RegistrarAsync(request, usuario.UsuarioId, EsAdmin(usuario));
            return CreatedAtAction(nameof(ObtenerPorId), new { distribucionId = envio.DistribucionId }, envio);
        });

    [HttpPut("{distribucionId:int}")]
    public Task<ActionResult> Actualizar(int distribucionId, ActualizarDistribucionRequest request) =>
        Ejecutar(async usuario =>
        {
            if (string.IsNullOrWhiteSpace(request.ResponsableACargo) || request.ResponsableACargo.Trim().Length > 150)
                return BadRequest("El responsable a cargo es obligatorio (hasta 150 caracteres).");
            if (request.Observaciones?.Trim().Length > 1000) return BadRequest("Las observaciones admiten hasta 1000 caracteres.");

            await distribucionRepository.ActualizarAsync(distribucionId, request, usuario.UsuarioId, EsAdmin(usuario));
            return NoContent();
        });

    // Solo datos logisticos: los kg despachados no se editan.
    [HttpPut("camiones/{distribucionCamionId:int}")]
    public Task<ActionResult> ActualizarLogistica(int distribucionCamionId, ActualizarCamionLogisticaRequest request) =>
        Ejecutar(async usuario =>
        {
            var validacion = ValidarLogistica(request.ChoferId, request.CamionId, request.DestinoId, request.CodigoCpe, request.NroTicketBalanza);
            if (validacion is not null) return BadRequest(validacion);

            await distribucionRepository.ActualizarLogisticaCamionAsync(distribucionCamionId, request, usuario.UsuarioId, EsAdmin(usuario));
            return NoContent();
        });

    [HttpPut("camiones/{distribucionCamionId:int}/recepcion")]
    public Task<ActionResult> RegistrarRecepcion(int distribucionCamionId, RegistrarRecepcionRequest request) =>
        Ejecutar(async usuario =>
        {
            if (request.FechaLlegada == default) return BadRequest("Debe indicar la fecha de llegada.");
            if (request.KgRecibidos <= 0) return BadRequest("Los kg recibidos deben ser mayores a cero.");

            await distribucionRepository.RegistrarRecepcionAsync(distribucionCamionId, request, usuario.UsuarioId, EsAdmin(usuario));
            return NoContent();
        });

    // Calcula la merma mientras el usuario completa el formulario (no guarda).
    [HttpPost("camiones/{distribucionCamionId:int}/conciliacion/previsualizar")]
    public Task<ActionResult> PrevisualizarConciliacion(int distribucionCamionId, ConciliarCamionRequest request) =>
        Ejecutar(async usuario =>
        {
            var validacion = ValidarConciliacion(request, exigirFecha: false);
            if (validacion is not null) return BadRequest(validacion);

            return Ok(await distribucionRepository.PrevisualizarConciliacionAsync(
                distribucionCamionId, request, usuario.UsuarioId, EsAdmin(usuario)));
        });

    // DIST-04: conciliar el camion con la liquidacion de la acopiadora.
    [HttpPut("camiones/{distribucionCamionId:int}/conciliacion")]
    public Task<ActionResult> Conciliar(int distribucionCamionId, ConciliarCamionRequest request) =>
        Ejecutar(async usuario =>
        {
            var validacion = ValidarConciliacion(request, exigirFecha: true);
            if (validacion is not null) return BadRequest(validacion);

            return Ok(await distribucionRepository.ConciliarAsync(
                distribucionCamionId, request, usuario.UsuarioId, EsAdmin(usuario)));
        });

    // ---------- Documentos (del envio o de un camion puntual) ----------

    [HttpGet("{distribucionId:int}/documentos")]
    public Task<ActionResult> ObtenerDocumentos(int distribucionId) =>
        Ejecutar(async usuario =>
        {
            if (await distribucionRepository.ObtenerPorIdAsync(distribucionId, usuario.UsuarioId, EsAdmin(usuario)) is null) return NotFound();
            return Ok(await distribucionRepository.ObtenerDocumentosAsync(distribucionId));
        });

    [HttpPost("{distribucionId:int}/documentos")]
    [RequestSizeLimit(20_000_000)]
    public Task<ActionResult> SubirDocumento(int distribucionId, IFormFile archivo, [FromQuery] int? distribucionCamionId) =>
        Ejecutar(async usuario =>
        {
            if (archivo is null || archivo.Length == 0) return BadRequest("Debes adjuntar un archivo.");
            await distribucionRepository.ExigirGestionAsync(distribucionId, usuario.UsuarioId, EsAdmin(usuario));

            var carpeta = Path.Combine(_uploadsRoot, distribucionId.ToString());
            Directory.CreateDirectory(carpeta);
            var rutaCompleta = Path.Combine(carpeta, $"{Guid.NewGuid()}_{Path.GetFileName(archivo.FileName)}");

            await using (var stream = System.IO.File.Create(rutaCompleta))
            {
                await archivo.CopyToAsync(stream);
            }

            try
            {
                return Ok(await distribucionRepository.AgregarDocumentoAsync(
                    distribucionId, distribucionCamionId, archivo.FileName, rutaCompleta, usuario.UsuarioId));
            }
            catch
            {
                System.IO.File.Delete(rutaCompleta);
                throw;
            }
        });

    [HttpGet("{distribucionId:int}/documentos/{documentoId:int}/descargar")]
    public Task<ActionResult> DescargarDocumento(int distribucionId, int documentoId) =>
        Ejecutar(async usuario =>
        {
            if (await distribucionRepository.ObtenerPorIdAsync(distribucionId, usuario.UsuarioId, EsAdmin(usuario)) is null) return NotFound();

            var ruta = await distribucionRepository.ObtenerRutaDocumentoAsync(distribucionId, documentoId);
            if (ruta is null || !System.IO.File.Exists(ruta)) return NotFound();

            var bytes = await System.IO.File.ReadAllBytesAsync(ruta);
            var nombreOriginal = Path.GetFileName(ruta).Split('_', 2).Last();
            return File(bytes, "application/octet-stream", nombreOriginal);
        });

    [HttpDelete("{distribucionId:int}/documentos/{documentoId:int}")]
    public Task<ActionResult> EliminarDocumento(int distribucionId, int documentoId) =>
        Ejecutar(async usuario =>
        {
            await distribucionRepository.ExigirGestionAsync(distribucionId, usuario.UsuarioId, EsAdmin(usuario));

            var ruta = await distribucionRepository.ObtenerRutaDocumentoAsync(distribucionId, documentoId);
            var eliminado = await distribucionRepository.EliminarDocumentoAsync(distribucionId, documentoId);
            if (eliminado && ruta is not null && System.IO.File.Exists(ruta))
            {
                System.IO.File.Delete(ruta);
            }

            return eliminado ? NoContent() : NotFound();
        });

    // ---------- Validaciones ----------

    private static string? ValidarAlta(CrearDistribucionRequest request)
    {
        if (request.EmpresaId <= 0) return "Debe indicar la empresa.";
        if (!OrigenesValidos.Contains(request.OrigenGrano)) return "El origen del grano debe ser 'Cosecha' o 'Silo'.";
        if (request.OrigenGrano == "Cosecha" && request.CosechaId is not > 0) return "Indica la cosecha de la que sale el grano.";
        if (request.OrigenGrano == "Silo" && request.SiloId is not > 0) return "Indica el silo de origen.";
        if (request.FechaSalida == default) return "Debe indicar la fecha de salida.";
        if (request.FechaSalida > DateOnly.FromDateTime(DateTime.Today)) return "La fecha de salida no puede ser posterior a hoy.";
        if (string.IsNullOrWhiteSpace(request.ResponsableACargo) || request.ResponsableACargo.Trim().Length > 150)
            return "El responsable a cargo es obligatorio (hasta 150 caracteres).";
        if (request.Observaciones?.Trim().Length > 1000) return "Las observaciones admiten hasta 1000 caracteres.";
        if (request.Camiones.Count == 0) return "Agrega al menos un camion al envio.";
        if (request.Camiones.Count > 100) return "Un envio admite hasta 100 camiones.";

        foreach (var camion in request.Camiones)
        {
            var validacion = ValidarLogistica(camion.ChoferId, camion.CamionId, camion.DestinoId, camion.CodigoCpe, camion.NroTicketBalanza);
            if (validacion is not null) return validacion;
            if (camion.KgDespachados <= 0) return "Los kg despachados de cada camion deben ser mayores a cero.";
        }

        return null;
    }

    private static string? ValidarLogistica(int choferId, int camionId, int destinoId, string? codigoCpe, string? ticket)
    {
        if (choferId <= 0) return "Indica el chofer.";
        if (camionId <= 0) return "Indica el camion.";
        if (destinoId <= 0) return "Indica el destino.";
        if (string.IsNullOrWhiteSpace(codigoCpe) || codigoCpe.Trim().Length > 30)
            return "El codigo de Carta de Porte es obligatorio (hasta 30 caracteres).";
        if (ticket?.Trim().Length > 30) return "El numero de ticket de balanza admite hasta 30 caracteres.";
        return null;
    }

    private static string? ValidarConciliacion(ConciliarCamionRequest request, bool exigirFecha)
    {
        if (exigirFecha && request.FechaLlegada == default) return "Debe indicar la fecha de llegada.";
        if (request.KgRecibidos <= 0) return "Los kg recibidos deben ser mayores a cero.";
        if (request.KgNetosLiquidados <= 0) return "Los kg netos liquidados deben ser mayores a cero.";
        if (request.KgNetosLiquidados > request.KgRecibidos) return "El neto liquidado no puede superar lo recibido en destino.";
        if (request.HumedadDestino is < 0 or > 100) return "La humedad debe estar entre 0 y 100 %.";
        if (request.MateriasExtranasDestino is < 0 or > 100) return "Las materias extranas deben estar entre 0 y 100 %.";
        if (request.NroLiquidacion?.Trim().Length > 40) return "El numero de liquidacion admite hasta 40 caracteres.";
        if (request.Observaciones?.Trim().Length > 1000) return "Las observaciones admiten hasta 1000 caracteres.";
        return null;
    }

    // ---------- Infraestructura ----------

    /// <summary>Autentica y traduce la convencion de excepciones del repositorio a codigos HTTP.</summary>
    private async Task<ActionResult> Ejecutar(Func<AuthenticatedUser, Task<ActionResult>> accion)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        try
        {
            return await accion(usuario);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (ConflictoDistribucionException ex)
        {
            return Conflict(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
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
