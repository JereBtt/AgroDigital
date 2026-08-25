namespace AgroDigital.Api.Dtos;

public sealed record CuentaGerenteInicialDto(
    int Id,
    string Responsable,
    string Usuario,
    string Estado,
    string GrupoGestion,
    DateTime FechaCreacion,
    DateTime? FechaVencimiento
);
