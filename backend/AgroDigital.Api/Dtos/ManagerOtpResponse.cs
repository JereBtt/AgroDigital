namespace AgroDigital.Api.Dtos;

public sealed record ManagerOtpResponse(
    string GrupoGestionCodigo,
    string Otp,
    DateTime FechaVencimiento
);
