using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AdminController : ControllerBase
{
    private readonly IAdminRepository _adminRepository;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IAuthTokenService _authTokenService;

    public AdminController(IAdminRepository adminRepository, IPasswordHasher passwordHasher, IAuthTokenService authTokenService)
    {
        _adminRepository = adminRepository;
        _passwordHasher = passwordHasher;
        _authTokenService = authTokenService;
    }

    [HttpGet("cuentas-gerente")]
    public async Task<ActionResult<IReadOnlyList<CuentaGerenteInicialDto>>> ObtenerCuentasGerente()
    {
        if (!TryRequireAdmin(out var error))
        {
            return error;
        }

        var cuentas = await _adminRepository.ObtenerCuentasGerenteAsync();
        return Ok(cuentas);
    }

    [HttpPost("cuentas-gerente")]
    public async Task<ActionResult<CredencialGerenteInicialResponse>> CrearCuentaGerente([FromBody] CrearCuentaGerenteRequest request)
    {
        if (!TryRequireAdmin(out var error))
        {
            return error;
        }

        if (string.IsNullOrWhiteSpace(request.Responsable))
        {
            return BadRequest("El responsable inicial es obligatorio.");
        }

        var responsable = request.Responsable.Trim();
        var usuario = await CrearUsuarioUnicoAsync(responsable);
        var passwordTemporal = CrearPasswordTemporal();
        var passwordHash = _passwordHasher.Hash(passwordTemporal);
        var fechaVencimiento = DateTime.UtcNow.AddDays(7);

        var cuenta = await _adminRepository.CrearCuentaGerenteAsync(responsable, usuario, passwordHash, fechaVencimiento);
        return Ok(new CredencialGerenteInicialResponse(cuenta, passwordTemporal));
    }

    [HttpPost("cuentas-gerente/{accesoId:int}/regenerar-password")]
    public async Task<ActionResult<CredencialGerenteInicialResponse>> RegenerarPassword(int accesoId)
    {
        if (!TryRequireAdmin(out var error))
        {
            return error;
        }

        var passwordTemporal = CrearPasswordTemporal();
        var passwordHash = _passwordHasher.Hash(passwordTemporal);
        var fechaVencimiento = DateTime.UtcNow.AddDays(7);

        var cuenta = await _adminRepository.RegenerarPasswordAsync(accesoId, passwordHash, fechaVencimiento);
        if (cuenta is null)
        {
            return NotFound("No se encontro una cuenta pendiente para regenerar.");
        }

        return Ok(new CredencialGerenteInicialResponse(cuenta, passwordTemporal));
    }

    [HttpPut("cuentas-gerente/{accesoId:int}/responsable")]
    public async Task<ActionResult<CuentaGerenteInicialDto>> ActualizarResponsable(int accesoId, [FromBody] ActualizarResponsableInicialRequest request)
    {
        if (!TryRequireAdmin(out var error))
        {
            return error;
        }

        if (string.IsNullOrWhiteSpace(request.Responsable))
        {
            return BadRequest("El responsable inicial es obligatorio.");
        }

        var responsable = request.Responsable.Trim();
        var usuarioInicial = await CrearUsuarioUnicoAsync(responsable);
        var cuenta = await _adminRepository.ActualizarResponsableAsync(accesoId, responsable, usuarioInicial);
        if (cuenta is null)
        {
            return NotFound("Solo se puede editar un acceso pendiente de primer ingreso.");
        }

        return Ok(cuenta);
    }

    [HttpPost("cuentas-gerente/{accesoId:int}/deshabilitar")]
    public async Task<ActionResult<CuentaGerenteInicialDto>> DeshabilitarCuenta(int accesoId)
    {
        if (!TryRequireAdmin(out var error))
        {
            return error;
        }

        var cuenta = await _adminRepository.CambiarHabilitacionAsync(accesoId, false);
        if (cuenta is null)
        {
            return NotFound("No se encontro el acceso gerente.");
        }

        return Ok(cuenta);
    }

    [HttpPost("cuentas-gerente/{accesoId:int}/habilitar")]
    public async Task<ActionResult<CuentaGerenteInicialDto>> HabilitarCuenta(int accesoId)
    {
        if (!TryRequireAdmin(out var error))
        {
            return error;
        }

        var cuenta = await _adminRepository.CambiarHabilitacionAsync(accesoId, true);
        if (cuenta is null)
        {
            return NotFound("No se encontro el acceso gerente.");
        }

        return Ok(cuenta);
    }

    private bool TryRequireAdmin(out ActionResult error)
    {
        error = Unauthorized("Sesion no valida.");

        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var token = header["Bearer ".Length..].Trim();
        if (!_authTokenService.TryValidate(token, out var usuario) || usuario?.Rol != "Admin")
        {
            return false;
        }

        error = Ok();
        return true;
    }

    private async Task<string> CrearUsuarioUnicoAsync(string responsable)
    {
        var slug = CrearSlug(responsable);

        for (var intento = 0; intento < 12; intento++)
        {
            var usuario = $"gerente-{slug}-{CrearToken(3).ToLowerInvariant()}";
            if (!await _adminRepository.ExisteUsuarioAsync(usuario))
            {
                return usuario;
            }
        }

        return $"gerente-{slug}-{Guid.NewGuid():N}"[..32];
    }

    private static string CrearSlug(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder();

        foreach (var character in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
            }
            else if (builder.Length > 0 && builder[^1] != '-')
            {
                builder.Append('-');
            }
        }

        var slug = builder.ToString().Trim('-');
        if (slug.Length > 18)
        {
            slug = slug[..18].Trim('-');
        }

        return string.IsNullOrWhiteSpace(slug) ? "responsable" : slug;
    }

    private static string CrearPasswordTemporal()
    {
        return $"ADI-{CrearToken(4)}-{CrearToken(4)}";
    }

    private static string CrearToken(int length)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, length)
            .Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)])
            .ToArray());
    }
}
