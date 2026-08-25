namespace AgroDigital.Api.Dtos;

public sealed record PerfilUsuarioResponse(
    int UsuarioId,
    string Usuario,
    string Nombre,
    string? Apellido,
    string? Telefono,
    string? CorreoElectronico,
    string Rol,
    bool Activo
);
