namespace AgroDigital.Api.Dtos;

public sealed record AprobarSolicitudUsuarioRequest(
    string RolGeneral,
    bool AccesoATodas,
    IReadOnlyList<EmpresaRolRequest>? Empresas
);

public sealed record EmpresaRolRequest(int EmpresaId, string Rol);
