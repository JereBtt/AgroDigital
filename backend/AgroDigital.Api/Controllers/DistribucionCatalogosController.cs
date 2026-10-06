using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Catalogos de Distribucion (transportistas, choferes, camiones, destinos) y parametros por grano.
/// Los catalogos no se eliminan: se desactivan con Activo = false (los envios historicos los usan).
/// </summary>
[ApiController]
[Route("api/distribucion-catalogos")]
public class DistribucionCatalogosController(
    IDistribucionCatalogoRepository catalogoRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    private static readonly string[] TiposDestino = ["Acopiadora", "Cooperativa", "Puerto", "Industria", "Otro"];

    // ---------- Transportistas ----------

    [HttpGet("transportistas")]
    public Task<ActionResult> ObtenerTransportistas([FromQuery] int empresaId, [FromQuery] bool incluirInactivos = false) =>
        Ejecutar(async u => Ok(await catalogoRepository.ObtenerTransportistasAsync(empresaId, incluirInactivos, u.UsuarioId, EsAdmin(u))));

    [HttpPost("transportistas")]
    public Task<ActionResult> CrearTransportista(GuardarTransportistaRequest request) =>
        GuardarTransportista(null, request);

    [HttpPut("transportistas/{transportistaId:int}")]
    public Task<ActionResult> ActualizarTransportista(int transportistaId, GuardarTransportistaRequest request) =>
        GuardarTransportista(transportistaId, request);

    private Task<ActionResult> GuardarTransportista(int? id, GuardarTransportistaRequest request) =>
        Ejecutar(async u =>
        {
            if (request.EmpresaId <= 0) return BadRequest("Debe indicar la empresa.");
            if (Texto(request.RazonSocial, 150) is { } e1) return BadRequest($"Razon social: {e1}");
            if (request.Cuit?.Trim().Length > 13) return BadRequest("El CUIT admite hasta 13 caracteres.");
            if (request.Telefono?.Trim().Length > 30) return BadRequest("El telefono admite hasta 30 caracteres.");
            return Ok(await catalogoRepository.GuardarTransportistaAsync(id, request, u.UsuarioId, EsAdmin(u)));
        });

    // ---------- Choferes ----------

    [HttpGet("choferes")]
    public Task<ActionResult> ObtenerChoferes([FromQuery] int empresaId, [FromQuery] bool incluirInactivos = false) =>
        Ejecutar(async u => Ok(await catalogoRepository.ObtenerChoferesAsync(empresaId, incluirInactivos, u.UsuarioId, EsAdmin(u))));

    [HttpPost("choferes")]
    public Task<ActionResult> CrearChofer(GuardarChoferRequest request) => GuardarChofer(null, request);

    [HttpPut("choferes/{choferId:int}")]
    public Task<ActionResult> ActualizarChofer(int choferId, GuardarChoferRequest request) => GuardarChofer(choferId, request);

    private Task<ActionResult> GuardarChofer(int? id, GuardarChoferRequest request) =>
        Ejecutar(async u =>
        {
            if (request.EmpresaId <= 0) return BadRequest("Debe indicar la empresa.");
            if (Texto(request.Nombre, 100) is { } e1) return BadRequest($"Nombre: {e1}");
            if (Texto(request.Apellido, 100) is { } e2) return BadRequest($"Apellido: {e2}");
            if (Texto(request.Telefono, 30) is { } e3) return BadRequest($"Telefono: {e3}");
            var dni = DistribucionCatalogoRepository.NormalizarDni(request.Dni ?? string.Empty);
            if (dni.Length is < 7 or > 9) return BadRequest("El DNI debe tener entre 7 y 9 digitos.");
            return Ok(await catalogoRepository.GuardarChoferAsync(id, request, u.UsuarioId, EsAdmin(u)));
        });

    // ---------- Camiones ----------

    [HttpGet("camiones")]
    public Task<ActionResult> ObtenerCamiones([FromQuery] int empresaId, [FromQuery] bool incluirInactivos = false) =>
        Ejecutar(async u => Ok(await catalogoRepository.ObtenerCamionesAsync(empresaId, incluirInactivos, u.UsuarioId, EsAdmin(u))));

    [HttpPost("camiones")]
    public Task<ActionResult> CrearCamion(GuardarCamionRequest request) => GuardarCamion(null, request);

    [HttpPut("camiones/{camionId:int}")]
    public Task<ActionResult> ActualizarCamion(int camionId, GuardarCamionRequest request) => GuardarCamion(camionId, request);

    private Task<ActionResult> GuardarCamion(int? id, GuardarCamionRequest request) =>
        Ejecutar(async u =>
        {
            if (request.EmpresaId <= 0) return BadRequest("Debe indicar la empresa.");
            var patente = DistribucionCatalogoRepository.NormalizarPatente(request.Patente ?? string.Empty);
            if (patente.Length is < 6 or > 10) return BadRequest("La patente debe tener entre 6 y 10 letras o numeros.");
            if (Texto(request.Marca, 60) is { } e1) return BadRequest($"Marca: {e1}");
            if (Texto(request.Modelo, 60) is { } e2) return BadRequest($"Modelo: {e2}");
            return Ok(await catalogoRepository.GuardarCamionAsync(id, request, u.UsuarioId, EsAdmin(u)));
        });

    // ---------- Destinos ----------

    [HttpGet("destinos")]
    public Task<ActionResult> ObtenerDestinos([FromQuery] int empresaId, [FromQuery] bool incluirInactivos = false) =>
        Ejecutar(async u => Ok(await catalogoRepository.ObtenerDestinosAsync(empresaId, incluirInactivos, u.UsuarioId, EsAdmin(u))));

    [HttpPost("destinos")]
    public Task<ActionResult> CrearDestino(GuardarDestinoRequest request) => GuardarDestino(null, request);

    [HttpPut("destinos/{destinoId:int}")]
    public Task<ActionResult> ActualizarDestino(int destinoId, GuardarDestinoRequest request) => GuardarDestino(destinoId, request);

    private Task<ActionResult> GuardarDestino(int? id, GuardarDestinoRequest request) =>
        Ejecutar(async u =>
        {
            if (request.EmpresaId <= 0) return BadRequest("Debe indicar la empresa.");
            if (Texto(request.Nombre, 150) is { } e1) return BadRequest($"Nombre: {e1}");
            if (!TiposDestino.Contains(request.TipoDestino?.Trim())) return BadRequest("Tipo de destino invalido.");
            if (Texto(request.Pais, 100) is { } e2) return BadRequest($"Pais: {e2}");
            if (Texto(request.Provincia, 100) is { } e3) return BadRequest($"Provincia: {e3}");
            if (Texto(request.Ciudad, 100) is { } e4) return BadRequest($"Ciudad: {e4}");
            return Ok(await catalogoRepository.GuardarDestinoAsync(id, request, u.UsuarioId, EsAdmin(u)));
        });

    // ---------- Parametros por grano (Gerente y Encargado) ----------

    [HttpGet("parametros")]
    public Task<ActionResult> ObtenerParametros([FromQuery] int empresaId) =>
        Ejecutar(async u => Ok(await catalogoRepository.ObtenerParametrosAsync(empresaId, u.UsuarioId, EsAdmin(u))));

    [HttpPut("parametros")]
    public Task<ActionResult> GuardarParametro(GuardarGranoParametroDistribucionRequest request) =>
        Ejecutar(async u =>
        {
            if (request.EmpresaId <= 0) return BadRequest("Debe indicar la empresa.");
            if (Texto(request.Producto, 60) is { } e1) return BadRequest($"Grano: {e1}");
            if (request.ManipuleoPct is < 0 or >= 10) return BadRequest("El manipuleo debe estar entre 0 y 10 %.");
            if (request.ToleranciaMateriasExtranasPct is < 0 or >= 100) return BadRequest("La tolerancia de materias extranas debe estar entre 0 y 100 %.");
            if (request.DesvioMedioPp <= 0 || request.DesvioAltoPp <= request.DesvioMedioPp)
                return BadRequest("El umbral Alto debe ser mayor que el Medio, y ambos mayores a cero.");
            return Ok(await catalogoRepository.GuardarParametroAsync(request, u.UsuarioId, EsAdmin(u)));
        });

    // ---------- Infraestructura ----------

    private static string? Texto(string? valor, int maximo) =>
        string.IsNullOrWhiteSpace(valor) ? "es obligatorio."
        : valor.Trim().Length > maximo ? $"admite hasta {maximo} caracteres."
        : null;

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
