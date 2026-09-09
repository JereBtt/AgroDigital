namespace AgroDigital.Api.Dtos;

public class ActualizarAlmacenamientoRequest
{
    public DateOnly Fecha { get; set; }
    public string TipoMovimiento { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public string? Observaciones { get; set; }
    public string? Campania { get; set; }
    public string? Cosecha { get; set; }
}
