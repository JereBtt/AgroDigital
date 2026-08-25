namespace AgroDigital.Api.Dtos;

public sealed record CompletarRegistroGerenteRequest(
    string Nombre,
    string Apellido,
    string Telefono,
    string CorreoElectronico,
    string Password,
    string RepetirPassword,
    IReadOnlyList<string> Empresas
);
