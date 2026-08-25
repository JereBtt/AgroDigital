namespace AgroDigital.Api.Dtos;

public sealed record ActualizarPerfilUsuarioRequest(
    string Nombre,
    string Apellido,
    string Telefono,
    string CorreoElectronico
);
