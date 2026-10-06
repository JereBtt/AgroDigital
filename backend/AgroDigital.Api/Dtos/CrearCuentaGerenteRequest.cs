namespace AgroDigital.Api.Dtos;

/// <summary>Alta de un Gerente por el Admin. El correo es obligatorio: ahi se envia la invitacion.</summary>
public sealed record CrearCuentaGerenteRequest(string Responsable, string? CorreoElectronico);
