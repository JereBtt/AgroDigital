namespace AgroDigital.Api.Dtos;

/// <summary>
/// Respuesta del alta (y de regenerar contrasenia). La contrasenia temporal se sigue
/// devolviendo como respaldo por si el correo no llega. Envio es null cuando no se
/// intento enviar correo (ej. regenerar contrasenia).
/// </summary>
public sealed record CredencialGerenteInicialResponse(
    CuentaGerenteInicialDto Cuenta,
    string PasswordTemporal,
    EnvioCorreoDto? Envio = null
);
