namespace AgroDigital.Api.Dtos;

/// <summary>Empresas y rol por empresa que tendra el usuario dentro del grupo del Gerente.</summary>
public sealed record ActualizarAccesosUsuarioRequest(IReadOnlyList<EmpresaRolRequest>? Empresas);
