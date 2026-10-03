namespace AgroDigital.Api.Dtos;

public sealed record CuentaGerenteInicialDto(
    int Id,
    string Responsable,
    string Usuario,
    string Estado,
    string GrupoGestion,
    DateTime FechaCreacion,
    DateTime? FechaVencimiento,
    // Invitacion por correo (25_invitaciones_gerente_correo.sql)
    string? CorreoElectronico,
    string? EstadoEnvio,
    DateTime? FechaUltimoEnvio,
    int CantidadEnvios
);
