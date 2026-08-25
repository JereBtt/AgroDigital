namespace AgroDigital.Api.Dtos;

public sealed record LoginRequest(
    string Usuario,
    string Password
);
