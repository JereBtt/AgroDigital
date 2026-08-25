namespace AgroDigital.Api.Dtos;

public sealed record SolicitarUnionGrupoRequest(
    string Nombre,
    string Apellido,
    string Telefono,
    string CorreoElectronico,
    string Password,
    string RepetirPassword,
    string GrupoGestionCodigo,
    string Otp
);
