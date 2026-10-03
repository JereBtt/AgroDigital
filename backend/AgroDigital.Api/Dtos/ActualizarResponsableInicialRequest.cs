namespace AgroDigital.Api.Dtos;

/// <summary>
/// Edicion de un acceso pendiente. CorreoElectronico es opcional: si viene vacio se
/// conserva el actual; si cambia, se invalida el enlace enviado al correo anterior.
/// </summary>
public sealed record ActualizarResponsableInicialRequest(string Responsable, string? CorreoElectronico);
