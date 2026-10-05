using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Tolerancias de perdida de cosecha por grano (Tirada de Aros).
/// Las consulta cualquier usuario de la empresa; las ajusta el Gerente o el Encargado.
/// </summary>
[ApiController]
[Route("api/grano-parametros/cosecha")]
public class GranoParametrosCosechaController(
    IGranoParametroCosechaRepository repository,
    IAuthTokenService authTokenService,
    IPermisosService permisos) : ControllerBase
{
    private static readonly string[] RolesConsulta = ["Gerente", "Encargado", "EmpleadoCampo", "EmpleadoAdministrativo"];

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GranoParametroCosechaDto>>> Obtener([FromQuery] int empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (empresaId <= 0) return BadRequest("Debe indicar la empresa.");

        await permisos.ExigirAsync(usuario, RecursoOperativo.Empresa, empresaId, RolesConsulta, "consultar los parámetros de cosecha");
        return Ok(await repository.ObtenerAsync(empresaId));
    }

    [HttpPut]
    public async Task<ActionResult<GranoParametroCosechaDto>> Guardar(GuardarGranoParametroCosechaRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var validacion = Validar(request);
        if (validacion is not null) return BadRequest(validacion);

        await permisos.ExigirAsync(usuario, RecursoOperativo.Empresa, request.EmpresaId, RolesPermiso.Estructura, "modificar los parámetros de cosecha");
        return Ok(await repository.GuardarAsync(request, usuario.UsuarioId));
    }

    /// <summary>Quita el ajuste de la empresa: el grano vuelve a la referencia INTA PRECOP.</summary>
    [HttpDelete("{granoParametroCosechaId:int}")]
    public async Task<IActionResult> Eliminar(int granoParametroCosechaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;

        var empresaId = await repository.ObtenerEmpresaIdAsync(granoParametroCosechaId);
        if (empresaId is null) return NotFound();

        await permisos.ExigirAsync(usuario, RecursoOperativo.Empresa, empresaId.Value, RolesPermiso.Estructura, "modificar los parámetros de cosecha");
        return await repository.EliminarAsync(granoParametroCosechaId) ? NoContent() : NotFound();
    }

    private static string? Validar(GuardarGranoParametroCosechaRequest request)
    {
        if (request.EmpresaId <= 0) return "Debe indicar la empresa.";
        if (string.IsNullOrWhiteSpace(request.Producto) || request.Producto.Trim().Length > 60) return "El grano es obligatorio (hasta 60 caracteres).";
        if (request.ToleranciaKgHa is <= 0 or > 1000) return "La tolerancia debe ser mayor a 0 y hasta 1000 kg/ha.";
        if (request.FactorAlta is <= 1 or > 5) return "El factor de severidad debe ser mayor a 1 y hasta 5.";
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
