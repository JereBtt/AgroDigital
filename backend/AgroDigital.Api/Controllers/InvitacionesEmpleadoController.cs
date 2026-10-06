using System.Net.Mail;
using System.Security.Cryptography;
using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Invitacion de empleados por correo. Solo el Gerente del grupo.
///
///   GET  api/manager/invitaciones                 invitaciones pendientes y vencidas
///   POST api/manager/invitaciones                 { correoElectronico, nombre? }
///   POST api/manager/invitaciones/{id}/reenviar   nueva OTP (la anterior deja de servir)
///   POST api/manager/invitaciones/{id}/cancelar
///
/// Cada invitacion es una OTP de un solo uso asociada al correo invitado: al
/// solicitar el acceso se valida que el correo coincida (AuthController).
/// </summary>
[ApiController]
[Route("api/manager/invitaciones")]
public sealed class InvitacionesEmpleadoController(
    IInvitacionEmpleadoRepository repository,
    IPasswordHasher passwordHasher,
    IAuthTokenService authTokenService,
    IEmailService emailService,
    IOptions<EmailSettings> emailSettings) : ControllerBase
{
    private const int DiasVigencia = 7;
    private const int SegundosEntreReenvios = 60;
    private const int LargoMaximoCorreo = 160;
    private const int LargoMaximoNombre = 150;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<InvitacionEmpleadoDto>>> Listar()
    {
        var (grupo, error) = await ObtenerGrupoAsync();
        if (grupo is null) return error!;

        return Ok(await repository.ListarPendientesAsync(grupo.GrupoGestionId));
    }

    [HttpPost]
    public async Task<ActionResult<InvitacionEmpleadoResponse>> Crear([FromBody] CrearInvitacionEmpleadoRequest request)
    {
        var (grupo, error) = await ObtenerGrupoAsync();
        if (grupo is null) return error!;

        if (string.IsNullOrWhiteSpace(request.CorreoElectronico))
        {
            return BadRequest("El correo electrónico es obligatorio: ahí se envía la invitación.");
        }

        var correo = request.CorreoElectronico.Trim().ToLowerInvariant();
        if (!EsCorreoValido(correo))
        {
            return BadRequest("Ingresá un correo electrónico válido.");
        }

        var nombre = string.IsNullOrWhiteSpace(request.Nombre) ? null : request.Nombre.Trim();
        if (nombre is { Length: > LargoMaximoNombre })
        {
            return BadRequest($"El nombre no puede superar los {LargoMaximoNombre} caracteres.");
        }

        switch (await repository.ObtenerSituacionCorreoAsync(grupo.GrupoGestionId, correo))
        {
            case SituacionCorreoInvitacion.YaEsMiembro:
                return Conflict("Esa persona ya forma parte de tu grupo de gestión.");
            case SituacionCorreoInvitacion.SolicitudPendiente:
                return Conflict("Esa persona ya envió una solicitud de acceso. Revisala en Solicitudes pendientes.");
            case SituacionCorreoInvitacion.InvitacionVigente:
                return Conflict("Ya hay una invitación vigente para ese correo. Podés reenviarla desde la lista de invitaciones.");
        }

        var otp = CrearOtp();
        var invitacion = await repository.CrearAsync(
            grupo.GrupoGestionId, UsuarioId, correo, nombre, passwordHasher.Hash(otp), DateTime.UtcNow.AddDays(DiasVigencia));

        return Ok(await EnviarAsync(grupo, invitacion, otp));
    }

    [HttpPost("{invitacionId:int}/reenviar")]
    public async Task<ActionResult<InvitacionEmpleadoResponse>> Reenviar(int invitacionId)
    {
        var (grupo, error) = await ObtenerGrupoAsync();
        if (grupo is null) return error!;

        var actual = await repository.ObtenerAsync(invitacionId, grupo.GrupoGestionId);
        if (actual is null)
        {
            return NotFound("No se encontró la invitación.");
        }

        if (actual.FechaUltimoEnvio is { } ultimo && DateTime.UtcNow - ultimo < TimeSpan.FromSeconds(SegundosEntreReenvios))
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, "Esperá un minuto antes de volver a enviar la invitación.");
        }

        var otp = CrearOtp();
        var renovada = await repository.RenovarAsync(
            invitacionId, grupo.GrupoGestionId, passwordHasher.Hash(otp), DateTime.UtcNow.AddDays(DiasVigencia));

        if (renovada is null)
        {
            return Conflict("La invitación ya fue usada o cancelada. Actualizá la lista.");
        }

        return Ok(await EnviarAsync(grupo, renovada, otp));
    }

    [HttpPost("{invitacionId:int}/cancelar")]
    public async Task<ActionResult> Cancelar(int invitacionId)
    {
        var (grupo, error) = await ObtenerGrupoAsync();
        if (grupo is null) return error!;

        if (!await repository.CancelarAsync(invitacionId, grupo.GrupoGestionId))
        {
            return NotFound("La invitación no existe o ya fue usada o cancelada.");
        }

        return Ok(new { mensaje = "Invitación cancelada. La OTP enviada ya no sirve." });
    }

    // =====================================================================

    private async Task<InvitacionEmpleadoResponse> EnviarAsync(GrupoInvitacion grupo, InvitacionEmpleadoDto invitacion, string otp)
    {
        var url = emailSettings.Value.UrlAplicacion.TrimEnd('/');
        var enlace = $"{url}/?unirse={Uri.EscapeDataString(grupo.Codigo)}&otp={Uri.EscapeDataString(otp)}&correo={Uri.EscapeDataString(invitacion.CorreoElectronico)}";

        var correo = PlantillasCorreo.InvitacionEmpleado(
            invitacion.Nombre, grupo.NombreGerente, grupo.Empresas, grupo.Codigo, otp, enlace, invitacion.FechaVencimiento);

        var resultado = await emailService.EnviarAsync(
            invitacion.CorreoElectronico, invitacion.Nombre ?? invitacion.CorreoElectronico, correo.Asunto, correo.Html, correo.Texto);

        var actualizada = await repository.RegistrarEnvioAsync(
            invitacion.Id, invitacion.CorreoElectronico, correo.Asunto, resultado.Enviado, resultado.Error, UsuarioId) ?? invitacion;

        var envio = resultado.Enviado
            ? new EnvioCorreoDto(true, $"Se envió la invitación a {invitacion.CorreoElectronico}.")
            : new EnvioCorreoDto(false, "La invitación se creó, pero no se pudo enviar el correo. Reintentá con \"Reenviar\" o compartí el código y la OTP manualmente.");

        return new InvitacionEmpleadoResponse(actualizada, grupo.Codigo, otp, envio);
    }

    private int UsuarioId { get; set; }

    /// <summary>Valida la sesion (solo Gerente) y obtiene su grupo de gestion activo.</summary>
    private async Task<(GrupoInvitacion? Grupo, ActionResult? Error)> ObtenerGrupoAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            || !authTokenService.TryValidate(header["Bearer ".Length..].Trim(), out var usuario)
            || usuario is null)
        {
            return (null, Unauthorized("Sesion no valida."));
        }

        if (usuario.Rol != "Gerente")
        {
            return (null, StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede invitar empleados."));
        }

        var grupo = await repository.ObtenerGrupoDelGerenteAsync(usuario.UsuarioId);
        if (grupo is null)
        {
            return (null, NotFound("No se encontró un grupo de gestión activo para este gerente."));
        }

        UsuarioId = usuario.UsuarioId;
        return (grupo, null);
    }

    private static bool EsCorreoValido(string correo)
    {
        if (correo.Length > LargoMaximoCorreo || !MailAddress.TryCreate(correo, out var direccion))
        {
            return false;
        }

        var arroba = correo.LastIndexOf('@');
        return direccion.Address == correo && arroba > 0 && correo.IndexOf('.', arroba) > arroba + 1;
    }

    /// <summary>Mismo formato que la OTP manual (ManagerController): OTP-XXXX-XXXX.</summary>
    private static string CrearOtp()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        string Bloque() => new(Enumerable.Range(0, 4).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
        return $"OTP-{Bloque()}-{Bloque()}";
    }
}
