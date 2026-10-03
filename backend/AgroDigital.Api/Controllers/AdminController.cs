using System.Globalization;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AdminController : ControllerBase
{
    private const string EstadoPendiente = "Pendiente de primer ingreso";
    private const int DiasVigenciaAcceso = 7;
    private const int SegundosEntreReenvios = 60;
    private const int LargoMaximoCorreo = 160;

    private readonly IAdminRepository _adminRepository;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IAuthTokenService _authTokenService;
    private readonly IEmailService _emailService;
    private readonly EmailSettings _emailSettings;

    public AdminController(
        IAdminRepository adminRepository,
        IPasswordHasher passwordHasher,
        IAuthTokenService authTokenService,
        IEmailService emailService,
        IOptions<EmailSettings> emailSettings)
    {
        _adminRepository = adminRepository;
        _passwordHasher = passwordHasher;
        _authTokenService = authTokenService;
        _emailService = emailService;
        _emailSettings = emailSettings.Value;
    }

    [HttpGet("cuentas-gerente")]
    public async Task<ActionResult<IReadOnlyList<CuentaGerenteInicialDto>>> ObtenerCuentasGerente()
    {
        if (!TryRequireAdmin(out _, out var error))
        {
            return error;
        }

        var cuentas = await _adminRepository.ObtenerCuentasGerenteAsync();
        return Ok(cuentas);
    }

    /// <summary>
    /// Alta de un Gerente: crea el acceso (usuario + contrasenia temporal de respaldo)
    /// y le envia un correo con el enlace de activacion. Si el correo falla, el acceso
    /// queda creado igual y el Admin puede reenviar o compartir las credenciales.
    /// </summary>
    [HttpPost("cuentas-gerente")]
    public async Task<ActionResult<CredencialGerenteInicialResponse>> CrearCuentaGerente([FromBody] CrearCuentaGerenteRequest request)
    {
        if (!TryRequireAdmin(out var admin, out var error))
        {
            return error;
        }

        if (string.IsNullOrWhiteSpace(request.Responsable))
        {
            return BadRequest("El responsable inicial es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.CorreoElectronico))
        {
            return BadRequest("El correo electrónico es obligatorio: ahí se envía la invitación.");
        }

        var correo = NormalizarCorreo(request.CorreoElectronico);
        if (!EsCorreoValido(correo))
        {
            return BadRequest("Ingresá un correo electrónico válido.");
        }

        if (await _adminRepository.CorreoEnUsoAsync(correo, null))
        {
            return Conflict("Ya existe un usuario o una invitación pendiente con ese correo electrónico.");
        }

        var responsable = request.Responsable.Trim();
        var usuario = await CrearUsuarioUnicoAsync(responsable);
        var passwordTemporal = CrearPasswordTemporal();
        var passwordHash = _passwordHasher.Hash(passwordTemporal);
        var fechaVencimiento = DateTime.UtcNow.AddDays(DiasVigenciaAcceso);
        var token = TokensActivacion.Generar();

        var cuenta = await _adminRepository.CrearCuentaGerenteAsync(
            responsable, usuario, correo, passwordHash, TokensActivacion.Hash(token), fechaVencimiento);

        var (cuentaActualizada, envio) = await EnviarInvitacionAsync(cuenta, token, admin.UsuarioId);
        return Ok(new CredencialGerenteInicialResponse(cuentaActualizada, passwordTemporal, envio));
    }

    /// <summary>
    /// Genera un enlace nuevo (el anterior deja de funcionar), renueva el vencimiento
    /// y vuelve a enviar el correo. Maximo un envio por minuto.
    /// </summary>
    [HttpPost("cuentas-gerente/{accesoId:int}/reenviar-invitacion")]
    public async Task<ActionResult<ReenviarInvitacionResponse>> ReenviarInvitacion(int accesoId)
    {
        if (!TryRequireAdmin(out var admin, out var error))
        {
            return error;
        }

        var cuenta = await _adminRepository.ObtenerCuentaGerenteAsync(accesoId);
        if (cuenta is null)
        {
            return NotFound("No se encontró el acceso gerente.");
        }

        if (cuenta.Estado != EstadoPendiente)
        {
            return Conflict("Solo se puede reenviar la invitación de un acceso pendiente de primer ingreso.");
        }

        if (string.IsNullOrWhiteSpace(cuenta.CorreoElectronico))
        {
            return BadRequest("El acceso no tiene correo electrónico. Editalo para cargarlo y después reenviá la invitación.");
        }

        if (cuenta.FechaUltimoEnvio is { } ultimo && DateTime.Now - ultimo < TimeSpan.FromSeconds(SegundosEntreReenvios))
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, "Esperá un minuto antes de volver a enviar la invitación.");
        }

        var token = TokensActivacion.Generar();
        var renovada = await _adminRepository.RenovarTokenActivacionAsync(
            accesoId, TokensActivacion.Hash(token), DateTime.UtcNow.AddDays(DiasVigenciaAcceso));

        if (renovada is null)
        {
            return Conflict("No se pudo renovar la invitación. Actualizá la lista e intentá de nuevo.");
        }

        var (cuentaActualizada, envio) = await EnviarInvitacionAsync(renovada, token, admin.UsuarioId);
        return Ok(new ReenviarInvitacionResponse(cuentaActualizada, envio));
    }

    [HttpPost("cuentas-gerente/{accesoId:int}/regenerar-password")]
    public async Task<ActionResult<CredencialGerenteInicialResponse>> RegenerarPassword(int accesoId)
    {
        if (!TryRequireAdmin(out _, out var error))
        {
            return error;
        }

        var passwordTemporal = CrearPasswordTemporal();
        var passwordHash = _passwordHasher.Hash(passwordTemporal);
        var fechaVencimiento = DateTime.UtcNow.AddDays(DiasVigenciaAcceso);

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
        if (!TryRequireAdmin(out _, out var error))
        {
            return error;
        }

        if (string.IsNullOrWhiteSpace(request.Responsable))
        {
            return BadRequest("El responsable inicial es obligatorio.");
        }

        string? correo = null;
        if (!string.IsNullOrWhiteSpace(request.CorreoElectronico))
        {
            correo = NormalizarCorreo(request.CorreoElectronico);
            if (!EsCorreoValido(correo))
            {
                return BadRequest("Ingresá un correo electrónico válido.");
            }

            if (await _adminRepository.CorreoEnUsoAsync(correo, accesoId))
            {
                return Conflict("Ya existe un usuario o una invitación pendiente con ese correo electrónico.");
            }
        }

        var responsable = request.Responsable.Trim();
        var usuarioInicial = await CrearUsuarioUnicoAsync(responsable);
        var cuenta = await _adminRepository.ActualizarResponsableAsync(accesoId, responsable, usuarioInicial, correo);
        if (cuenta is null)
        {
            return NotFound("Solo se puede editar un acceso pendiente de primer ingreso.");
        }

        return Ok(cuenta);
    }

    [HttpPost("cuentas-gerente/{accesoId:int}/deshabilitar")]
    public async Task<ActionResult<CuentaGerenteInicialDto>> DeshabilitarCuenta(int accesoId)
    {
        if (!TryRequireAdmin(out _, out var error))
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
        if (!TryRequireAdmin(out _, out var error))
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

    // =====================================================================
    // Envio de la invitacion
    // =====================================================================

    private async Task<(CuentaGerenteInicialDto Cuenta, EnvioCorreoDto Envio)> EnviarInvitacionAsync(
        CuentaGerenteInicialDto cuenta, string token, int adminUsuarioId)
    {
        var destinatario = cuenta.CorreoElectronico!;
        var enlace = $"{_emailSettings.UrlAplicacion.TrimEnd('/')}/?activar={Uri.EscapeDataString(token)}";
        var correo = PlantillasCorreo.InvitacionGerente(cuenta.Responsable, enlace, cuenta.FechaVencimiento);

        var resultado = await _emailService.EnviarAsync(destinatario, cuenta.Responsable, correo.Asunto, correo.Html, correo.Texto);

        var actualizada = await _adminRepository.RegistrarEnvioInvitacionAsync(
            cuenta.Id, destinatario, correo.Asunto, resultado.Enviado, resultado.Error, adminUsuarioId) ?? cuenta;

        var envio = resultado.Enviado
            ? new EnvioCorreoDto(true, $"Se envió la invitación a {destinatario}.")
            : new EnvioCorreoDto(false, "El acceso se creó, pero no se pudo enviar el correo. Reintentá con \"Reenviar invitación\" o compartí las credenciales manualmente.");

        return (actualizada, envio);
    }

    private static string NormalizarCorreo(string correo) => correo.Trim().ToLowerInvariant();

    private static bool EsCorreoValido(string correo)
    {
        if (correo.Length > LargoMaximoCorreo || !MailAddress.TryCreate(correo, out var direccion))
        {
            return false;
        }

        // MailAddress acepta "Nombre <correo>": se exige la direccion sola y con dominio.
        var arroba = correo.LastIndexOf('@');
        return direccion.Address == correo && arroba > 0 && correo.IndexOf('.', arroba) > arroba + 1;
    }

    private bool TryRequireAdmin(out AuthenticatedUser admin, out ActionResult error)
    {
        admin = null!;
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

        admin = usuario!;
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
