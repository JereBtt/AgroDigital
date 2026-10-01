namespace AgroDigital.Api.Dtos;

/// <summary>
/// Empresa a la que pertenece el usuario logueado (dbo.UsuarioEmpresas), con su rol en ella.
/// Misma forma que ManagerEmpresaDto, para que el selector de empresa del frontend
/// funcione igual para el Gerente y para el resto de los roles.
/// </summary>
public sealed record MiEmpresaDto(
    int EmpresaId,
    string Nombre,
    bool EsPrincipal,
    bool Activo,
    string Rol
);
