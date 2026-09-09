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
    IReadOnlyList<ManagerUsuarioEmpresaDto> Empresas
);

public sealed record ManagerUsuarioEmpresaDto(
    int EmpresaId,
    string EmpresaNombre,
    string Rol,
    bool Activo
);
