namespace AgroDigital.Api.Dtos;

public sealed record SolicitudUsuarioDto(
    int SolicitudUsuarioId,
    int UsuarioId,
    string Nombre,
    string Apellido,
    string Telefono,
    string CorreoElectronico,
    string Estado,
    DateTime FechaCreacion
);
