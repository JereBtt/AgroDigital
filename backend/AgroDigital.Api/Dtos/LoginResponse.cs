namespace AgroDigital.Api.Dtos;

public sealed record LoginResponse(
    string Usuario,
    string Nombre,
    string Rol,
    string Token,
    bool DebeCompletarRegistro
);
