namespace AgroDigital.Api.Dtos;

public sealed record SolicitudUsuarioDto(
    int SolicitudUsuarioId,
    int UsuarioId,
    string Nombre,
    string Apellido,
    string Telefono,
    string CorreoElectronico,
    string Estado,
    DateTime FechaCreacion,
    // Empresa de la invitacion usada (NULL en solicitudes sin empresa)
    int? EmpresaId = null,
    string? EmpresaNombre = null
);
