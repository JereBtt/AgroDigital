namespace AgroDigital.Api.Dtos;

public class CrearAlmacenamientoRequest
{
    public int SiloId { get; set; }
    public DateOnly Fecha { get; set; }
    public string TipoMovimiento { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public string? Observaciones { get; set; }
    public string? Campania { get; set; }
    public string? Cosecha { get; set; }
    public string? Producto { get; set; }

    // Ingreso vinculado a una cosecha real (lote, grano y campania salen de ahi).
    public int? CosechaId { get; set; }
    public decimal? HumedadIngreso { get; set; }
    public decimal? Impurezas { get; set; }

    /// <summary>Obligatorio en el egreso manual: Semilla propia, Consumo interno o Deterioro.</summary>
    public string? Motivo { get; set; }
}
