using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SiembrasController(ISiembraRepository siembraRepository, ILoteRepository loteRepository, IAuthTokenService authTokenService, IWebHostEnvironment environment) : ControllerBase
{
    private readonly string _uploadsRoot = Path.Combine(environment.ContentRootPath, "App_Data", "siembras");
    private const int DiasDesvioRequiereJustificacion = 3;
    private static readonly DateTime FechaOperacionMinima = new(2026, 1, 1);
    private static readonly DateTime FechaOperacionMaxima = new(2027, 12, 31);

    private static readonly string[] TiposInsumoValidos =
    [
        "Herbicidas", "Insecticidas", "Fungicidas", "Acaricidas",
        "Nematicidas", "Raticidas", "Bactericidas", "Molusquicidas"
    ];

    private static readonly string[] SiniestrosResiembraValidos =
    [
        "Granizo",
        "Sequia / Estres hidrico",
        "Helada tardia",
        "Anegamiento / Inundacion",
        "Plagas de implantacion",
        "Fitotoxicidad por agroquimicos",
        "Encostramiento del suelo",
        "Falla de germinacion"
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

        var validation = ValidarSiembra(request);
        if (validation is not null) return validation;

        var lote = await loteRepository.ObtenerPorIdAsync(request.LoteId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (lote is null) return NotFound("Lote no disponible.");
        if (request.TipoRegistro == "Resiembra")
        {
            var original = await siembraRepository.ObtenerPorIdAsync(request.SiembraOriginalId!.Value);
            if (original is null || original.TipoRegistro == "Resiembra" || original.EstadoSiembra != "Finalizado" || original.Estado != "Finalizado"
                || original.LoteId != request.LoteId
                || !string.Equals(original.CampaniaNombre?.Trim(), request.CampaniaNombre?.Trim(), StringComparison.OrdinalIgnoreCase))
                return BadRequest("La resiembra requiere una siembra original y su seguimiento finalizados, del mismo lote y campaña.");
            if (original.FechaFinReal is null)
                return BadRequest("La siembra original debe tener fecha real de finalizacion.");
            var finOriginal = original.FechaFinReal.Value.Date;
            if (request.FechaInicio.Date < finOriginal || request.FechaInicio.Date > finOriginal.AddMonths(4))
                return BadRequest($"La resiembra debe iniciar entre {finOriginal:dd/MM/yyyy} y {finOriginal.AddMonths(4):dd/MM/yyyy}.");
            var periodo = System.Text.RegularExpressions.Regex.Match(original.CampaniaNombre ?? "", @"^\d{4}-(\d{4})(?:\s|$)");
            var finCampania = periodo.Success && int.TryParse(periodo.Groups[1].Value, out var anioFin) && anioFin > 0
                ? new DateTime(anioFin, 12, 31) : FechaOperacionMaxima;
            if (request.FechaFin.Date > finCampania)
                return BadRequest($"La fecha tentativa de fin no puede superar el {finCampania:dd/MM/yyyy}, fin del año de campaña.");
        }
        request.ProductoAntecesor = lote.HistorialCultivos.FirstOrDefault()?.Cultivo;
        try
        {
            var siembra = await siembraRepository.CrearAsync(request, usuario.UsuarioId);
            return CreatedAtAction(nameof(ObtenerPorId), new { siembraId = siembra.SiembraId }, siembra);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number == 50001)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPut("{siembraId:int}")]
    public async Task<IActionResult> Actualizar(int siembraId, ActualizarSiembraRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validation = ValidarSiembra(request);
        if (validation is not null) return validation;

        var lote = await loteRepository.ObtenerPorIdAsync(request.LoteId, usuario.UsuarioId, usuario.Rol == "Admin");
        if (lote is null) return NotFound("Lote no disponible.");
        if (request.TipoRegistro == "Resiembra")
        {
            var original = await siembraRepository.ObtenerPorIdAsync(request.SiembraOriginalId!.Value);
            if (original is null || original.TipoRegistro == "Resiembra" || original.EstadoSiembra != "Finalizado" || original.Estado != "Finalizado"
                || original.LoteId != request.LoteId
                || !string.Equals(original.CampaniaNombre?.Trim(), request.CampaniaNombre?.Trim(), StringComparison.OrdinalIgnoreCase))
                return BadRequest("La resiembra requiere una siembra original y su seguimiento finalizados, del mismo lote y campaña.");
            if (original.FechaFinReal is null)
                return BadRequest("La siembra original debe tener fecha real de finalizacion.");
            var finOriginal = original.FechaFinReal.Value.Date;
            if (request.FechaInicio.Date < finOriginal || request.FechaInicio.Date > finOriginal.AddMonths(4))
                return BadRequest($"La resiembra debe iniciar entre {finOriginal:dd/MM/yyyy} y {finOriginal.AddMonths(4):dd/MM/yyyy}.");
            var periodo = System.Text.RegularExpressions.Regex.Match(original.CampaniaNombre ?? "", @"^\d{4}-(\d{4})(?:\s|$)");
            var finCampania = periodo.Success && int.TryParse(periodo.Groups[1].Value, out var anioFin) && anioFin > 0
                ? new DateTime(anioFin, 12, 31) : FechaOperacionMaxima;
            if (request.FechaFin.Date > finCampania)
                return BadRequest($"La fecha tentativa de fin no puede superar el {finCampania:dd/MM/yyyy}, fin del año de campaña.");
        }
        request.ProductoAntecesor = lote.HistorialCultivos.FirstOrDefault()?.Cultivo;
        try
        {
            var actualizado = await siembraRepository.ActualizarAsync(siembraId, request);
            return actualizado ? NoContent() : NotFound();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number == 50001)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPost("{siembraId:int}/finalizar")]
    public async Task<IActionResult> FinalizarSiembra(int siembraId, FinalizarSiembraRequest request)
    {
        if (!TryGetAuthenticatedUser(out _, out var error)) return error;

        var siembra = await siembraRepository.ObtenerPorIdAsync(siembraId);
        if (siembra is null) return NotFound();

        var validation = ValidarFinalizacionSiembra(siembra, request);
        if (validation is not null) return validation;

        var actualizado = await siembraRepository.FinalizarSiembraAsync(siembraId, request);
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

        var validation = ValidarInsumo(request);
        if (validation is not null) return validation;

        var siembra = await siembraRepository.ObtenerPorIdAsync(siembraId);
        if (siembra is null) return NotFound();
        if (request.FechaAplicacion!.Value > DateOnly.FromDateTime(siembra.FechaInicio))
        {
            return BadRequest("La Fecha de aplicacion no puede ser posterior a la Fecha de Inicio de la siembra.");
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

    private ActionResult? ValidarSiembra(CrearSiembraRequest request)
    {
        if (request.LoteId <= 0) return BadRequest("El Lote es obligatorio.");
        if (string.IsNullOrWhiteSpace(request.Producto)) return BadRequest("El Grano es obligatorio.");
        if (request.FechaFin < request.FechaInicio) return BadRequest("La Fecha de Fin no puede ser anterior a la Fecha de Inicio.");
        var periodoCampania = System.Text.RegularExpressions.Regex.Match(request.CampaniaNombre ?? "", @"^(\d{4})-\d{4}(?:\s|$)");
        var fechaPreSiembraMinima = periodoCampania.Success && int.TryParse(periodoCampania.Groups[1].Value, out var anioCampania) && anioCampania > 0
            ? new DateTime(anioCampania, 1, 1)
            : FechaOperacionMinima;
        if (request.FechaMuestreo is not null && (request.FechaMuestreo.Value.Date < fechaPreSiembraMinima || request.FechaMuestreo.Value.Date > request.FechaInicio.Date)) return BadRequest($"La Fecha de Muestreo debe estar entre {fechaPreSiembraMinima:dd/MM/yyyy} y la Fecha de Inicio de siembra ({request.FechaInicio:dd/MM/yyyy}).");
        if (request.FechaAnalisis is not null && (request.FechaAnalisis.Value.Date < fechaPreSiembraMinima || request.FechaAnalisis.Value.Date > request.FechaInicio.Date)) return BadRequest($"La Fecha de Analisis debe estar entre {fechaPreSiembraMinima:dd/MM/yyyy} y la Fecha de Inicio de siembra ({request.FechaInicio:dd/MM/yyyy}).");
        if (request.FechaMuestreo is not null && request.FechaAnalisis is not null && request.FechaAnalisis < request.FechaMuestreo) return BadRequest("La Fecha de Analisis no puede ser anterior a la Fecha de Muestreo.");
        if (request.UreaKgHa is < 0) return BadRequest("La Urea por hectarea no puede ser negativa.");
        if (request.PMG is < 0 || request.DensidadSiembra is < 0 || request.Profundidad is < 0
            || request.CantidadHectareasTrabajadas is < 0 || request.CantidadSemillas is < 0)
            return BadRequest("Los valores numericos del detalle de siembra no pueden ser negativos.");
        if (request.CantidadMuestras is < 0) return BadRequest("La Cantidad de Muestras no puede ser negativa.");

        var tipoRegistro = string.IsNullOrWhiteSpace(request.TipoRegistro) ? "Siembra" : request.TipoRegistro.Trim();
        if (tipoRegistro is not ("Siembra" or "Resiembra")) return BadRequest("Selecciona si vas a registrar una siembra o una resiembra.");

        if (tipoRegistro == "Resiembra")
        {
            if (request.SiembraOriginalId is null or <= 0) return BadRequest("Selecciona la siembra original asociada a la resiembra.");
            if (request.TipoResiembra is not ("Total" or "Parcial")) return BadRequest("Selecciona si la resiembra es total o parcial.");
            if (string.IsNullOrWhiteSpace(request.Siniestro)) return BadRequest("Selecciona el siniestro que motivo la resiembra.");
            if (!SiniestrosResiembraValidos.Contains(request.Siniestro)) return BadRequest("Siniestro de resiembra invalido.");
        }

        return null;
    }

    private static ActionResult? ValidarInsumo(CrearSiembraInsumoRequest request)
    {
        if (request.FechaAplicacion is null) return new BadRequestObjectResult("La Fecha de aplicacion es obligatoria.");
        var fechaAplicacion = request.FechaAplicacion.Value.ToDateTime(TimeOnly.MinValue);
        if (fechaAplicacion < FechaOperacionMinima || fechaAplicacion > FechaOperacionMaxima) return new BadRequestObjectResult("La Fecha de aplicacion debe estar entre el 01/01/2026 y el 31/12/2027.");
        if (string.IsNullOrWhiteSpace(request.Marca)) return new BadRequestObjectResult("La Marca es obligatoria.");
        if (string.IsNullOrWhiteSpace(request.Tipo) || !TiposInsumoValidos.Contains(request.Tipo)) return new BadRequestObjectResult("Tipo de agroquimico invalido.");
        if (string.IsNullOrWhiteSpace(request.Variedad)) return new BadRequestObjectResult("La Variedad es obligatoria.");
        if (request.CantidadAplicada is null or <= 0) return new BadRequestObjectResult("La Cantidad aplicada debe ser mayor a cero.");
        if (request.UnidadMedida is not ("Litros" or "Kg")) return new BadRequestObjectResult("Selecciona Litros o Kg como unidad de medida.");
        return null;
    }

    private static ActionResult? ValidarFinalizacionSiembra(SiembraDto siembra, FinalizarSiembraRequest request)
    {
        if (request.FechaFinReal < siembra.FechaInicio) return new BadRequestObjectResult("La Fecha real de finalizacion no puede ser anterior a la Fecha de Inicio.");
        if (request.FechaFinReal.Date > siembra.FechaInicio.Date.AddMonths(6)) return new BadRequestObjectResult("La Fecha real de finalizacion no puede superar los 6 meses desde la Fecha de Inicio.");
        if (request.HectareasHora <= 0) return new BadRequestObjectResult("Las Hectareas hora deben ser mayores a cero.");

        var diasDesvio = Math.Abs((request.FechaFinReal.Date - siembra.FechaFin.Date).Days);
        if (diasDesvio > DiasDesvioRequiereJustificacion && string.IsNullOrWhiteSpace(request.JustificacionDesvioFin))
        {
            return new BadRequestObjectResult("La fecha real se aleja mas de 3 dias de la fecha tentativa. Debes registrar una justificacion.");
        }

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
