namespace AgroDigital.Api.Dtos;

public sealed record ManagerContextResponse(
    string GrupoGestionCodigo,
    string GrupoGestionNombre,
    int EmpresaPrincipalId,
    IReadOnlyList<ManagerEmpresaDto> Empresas,
    int SolicitudesPendientes
);

public sealed record ManagerEmpresaDto(
    int EmpresaId,
    string Nombre,
    bool EsPrincipal,
    bool Activo
);
