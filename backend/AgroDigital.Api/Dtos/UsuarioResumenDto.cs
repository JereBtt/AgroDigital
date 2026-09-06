namespace AgroDigital.Api.Dtos;

public class UsuarioResumenDto
{
    public int UsuarioId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Apellido { get; set; }
    public string Rol { get; set; } = string.Empty;
}
