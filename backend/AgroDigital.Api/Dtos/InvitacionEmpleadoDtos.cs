namespace AgroDigital.Api.Dtos;

/// <summary>Invitacion por correo a un empleado (una fila de GrupoGestionOtps con correo).</summary>
public sealed record InvitacionEmpleadoDto(
    int Id,
    string CorreoElectronico,
    string? Nombre,
    DateTime FechaCreacion,
    DateTime FechaVencimiento,
    // Pendiente o Vencida (las usadas y canceladas no se listan)
    string Estado,
    string? EstadoEnvio,
    DateTime? FechaUltimoEnvio,
    int CantidadEnvios
);

/// <summary>El Gerente invita a un empleado. Nombre es opcional (solo para el saludo del correo).</summary>
public sealed record CrearInvitacionEmpleadoRequest(string? CorreoElectronico, string? Nombre);

/// <summary>
/// Respuesta de crear o reenviar. La OTP se devuelve una sola vez como respaldo,
/// por si el correo no llega y el Gerente necesita compartirla a mano.
/// </summary>
public sealed record InvitacionEmpleadoResponse(
    InvitacionEmpleadoDto Invitacion,
    string GrupoGestionCodigo,
    string Otp,
    EnvioCorreoDto Envio
);
