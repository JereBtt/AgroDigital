namespace AgroDigital.Api.Dtos;

public class CrearSiloRequest
{
    public int? LoteId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public decimal CapacidadMax { get; set; }
    public string? Producto { get; set; }
    public decimal? CantidadGranoAlmacenado { get; set; }
    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
}
