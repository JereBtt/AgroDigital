namespace AgroDigital.Api.Dtos;

public sealed record CambiarPasswordPerfilRequest(
    string PasswordActual,
    string PasswordNueva,
    string RepetirPasswordNueva
);
