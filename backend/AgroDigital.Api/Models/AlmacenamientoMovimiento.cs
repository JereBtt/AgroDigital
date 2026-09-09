namespace AgroDigital.Api.Models;

public class AlmacenamientoMovimiento
{
    public int AlmacenamientoId { get; set; }
    public int SiloId { get; set; }
    public DateOnly Fecha { get; set; }
    public string TipoMovimiento { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public decimal StockAnterior { get; set; }
    public decimal StockResultante { get; set; }
    public string Origen { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
    public string? Campania { get; set; }
    public string? Cosecha { get; set; }
    public int? CreadoPorUsuarioId { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
}
