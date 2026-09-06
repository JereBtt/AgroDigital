namespace AgroDigital.Api.Dtos;

public class SiloDto
{
    public int SiloId { get; set; }
    public int? LoteId { get; set; }
    public string? LoteNombre { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public decimal CapacidadMax { get; set; }
    public string? Producto { get; set; }
    public decimal CantidadGranoAlmacenado { get; set; }
    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
    public bool Activo { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }

    public decimal NivelOcupacionPorcentaje =>
        CapacidadMax > 0 ? Math.Round(CantidadGranoAlmacenado / CapacidadMax * 100, 2) : 0;
}
