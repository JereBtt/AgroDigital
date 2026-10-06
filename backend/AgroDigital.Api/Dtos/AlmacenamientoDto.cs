namespace AgroDigital.Api.Dtos;

public class AlmacenamientoDto
{
    public int AlmacenamientoId { get; set; }
    public int SiloId { get; set; }
    public int? EmpresaId { get; set; }
    public string? SiloCodigo { get; set; }
    public int? CosechaId { get; set; }
    public int? CampaniaId { get; set; }
    public decimal? HumedadIngreso { get; set; }
    public decimal? Impurezas { get; set; }

    /// <summary>Motivo del egreso manual o del ajuste.</summary>
    public string? Motivo { get; set; }

    /// <summary>Identifica los dos movimientos (egreso e ingreso) de una misma transferencia.</summary>
    public Guid? TransferenciaId { get; set; }
    public string SiloNombre { get; set; } = string.Empty;
    public string? SiloProducto { get; set; }
    public DateOnly Fecha { get; set; }
    public string TipoMovimiento { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public decimal StockAnterior { get; set; }
    public decimal StockResultante { get; set; }
    public string Origen { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
    public string? Campania { get; set; }
    public string? Cosecha { get; set; }
    public string? Producto { get; set; }
    public string? CreadoPorNombre { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
}
