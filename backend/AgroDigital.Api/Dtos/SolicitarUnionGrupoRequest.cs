namespace AgroDigital.Api.Dtos;

/// <summary>
/// Solicitud para unirse a un grupo de gestion con codigo + OTP.
/// Con UsuarioExistente = true la persona ya tiene cuenta en AgroDigital: solo se
/// piden correo, contrasenia actual, codigo y OTP, y se usan los datos de su cuenta.
/// </summary>
public sealed record SolicitarUnionGrupoRequest(
    string? Nombre,
    string? Apellido,
    string? Telefono,
    string? CorreoElectronico,
    string? Password,
    string? RepetirPassword,
    string? GrupoGestionCodigo,
    string? Otp,
    bool UsuarioExistente = false
);
