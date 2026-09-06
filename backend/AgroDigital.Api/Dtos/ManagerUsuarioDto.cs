namespace AgroDigital.Api.Dtos;

public sealed record ManagerUsuarioDto(
    int UsuarioId,
    string Nombre,
    string Apellido,
    string Telefono,
    string CorreoElectronico,
    string RolGeneral,
    bool TieneRolGeneral,
    bool Activo,
    DateTime FechaAlta,
    IReadOnlyList<ManagerUsuarioEquipoDto> Equipos
);

public sealed record ManagerUsuarioEquipoDto(
    int EmpresaId,
    string EmpresaNombre,
    string Rol,
    bool Activo
);
