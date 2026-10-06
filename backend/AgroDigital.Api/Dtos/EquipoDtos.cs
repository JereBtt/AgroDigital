namespace AgroDigital.Api.Dtos;

/// <summary>Lo que ve un usuario que no es Gerente en Usuarios: su propio acceso.</summary>
public sealed record MiAccesoDto(
    string Nombre,
    string CorreoElectronico,
    string RolGeneral,
    // true si es Encargado en al menos una empresa: puede consultar el equipo.
    bool PuedeVerEquipo,
    IReadOnlyList<MiGrupoDto> Grupos
);

public sealed record MiGrupoDto(
    int GrupoGestionId,
    string Codigo,
    string Nombre,
    string Gerente,
    string? GerenteCorreo,
    IReadOnlyList<MiEmpresaAccesoDto> Empresas
);

public sealed record MiEmpresaAccesoDto(
    int EmpresaId,
    string Nombre,
    string Rol,
    bool EsPrincipal
);
