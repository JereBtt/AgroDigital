namespace AgroDigital.Api.Dtos;

/// <summary>Resultado de un envio de correo, para mostrarle al Admin.</summary>
public sealed record EnvioCorreoDto(bool Enviado, string Mensaje);

/// <summary>Respuesta de "Reenviar invitacion".</summary>
public sealed record ReenviarInvitacionResponse(CuentaGerenteInicialDto Cuenta, EnvioCorreoDto Envio);

/// <summary>El Gerente abre el enlace del correo: el front envia el token que vino en la URL.</summary>
public sealed record ActivarGerenteRequest(string? Token);

/// <summary>
/// Igual que LoginResponse, mas el correo de la invitacion para precargarlo
/// en el formulario de registro del Gerente.
/// </summary>
public sealed record ActivarGerenteResponse(
    string Usuario,
    string Nombre,
    string Rol,
    string Token,
    bool DebeCompletarRegistro,
    string? CorreoElectronico
);
