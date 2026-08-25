namespace AgroDigital.Api.Models;

public sealed class UsuarioLogin
{
    public int UsuarioId { get; set; }
    public string Usuario { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Rol { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Apellido { get; set; }
    public string? Telefono { get; set; }
    public string? CorreoElectronico { get; set; }
    public bool DebeCambiarPassword { get; set; }
    public bool Activo { get; set; }
}
