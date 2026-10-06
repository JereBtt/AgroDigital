using AgroDigital.Api.Dtos;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AgroDigital.Api.Controllers;

/// <summary>
/// Activacion de la cuenta de un Gerente desde el enlace del correo de invitacion.
/// POST api/auth/activar-gerente  { "token": "..." }
///
/// Si el token es valido, devuelve una sesion igual a la del login con contrasenia
/// temporal (DebeCompletarRegistro = true), asi el front muestra la bienvenida y el
/// registro del Gerente que ya existen, con el correo de la invitacion precargado.
///
/// El enlace funciona mientras el acceso este "Pendiente de primer ingreso" y vigente.
/// Al completar el registro, el acceso pasa a "Usado" y el enlace deja de servir.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class ActivacionGerenteController(
    IAdminRepository adminRepository,
    IAuthTokenService authTokenService) : ControllerBase
{
    // Mismo mensaje para token inexistente, vencido, usado o deshabilitado:
    // no se revela cual de los casos es.
    private const string EnlaceInvalido =
        "El enlace de activación no es válido o ya venció. Pedile al administrador de AgroDigital que te envíe uno nuevo.";

    [HttpPost("activar-gerente")]
    public async Task<ActionResult<ActivarGerenteResponse>> ActivarGerente([FromBody] ActivarGerenteRequest request)
    {
        if (!TokensActivacion.FormatoValido(request.Token))
        {
            return BadRequest(EnlaceInvalido);
        }

        var resultado = await adminRepository.ObtenerUsuarioPorTokenActivacionAsync(TokensActivacion.Hash(request.Token!));
        if (resultado is null)
        {
            return BadRequest(EnlaceInvalido);
        }

        var (usuario, correoInvitacion) = resultado.Value;
        var nombre = string.Join(' ', new[] { usuario.Nombre, usuario.Apellido }.Where(v => !string.IsNullOrWhiteSpace(v)));

        return Ok(new ActivarGerenteResponse(
            usuario.Usuario,
            nombre,
            usuario.Rol,
            authTokenService.CreateToken(usuario),
            usuario.DebeCambiarPassword,
            correoInvitacion));
    }
}
