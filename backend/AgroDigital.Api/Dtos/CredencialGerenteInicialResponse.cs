namespace AgroDigital.Api.Dtos;

public sealed record CredencialGerenteInicialResponse(
    CuentaGerenteInicialDto Cuenta,
    string PasswordTemporal
);
