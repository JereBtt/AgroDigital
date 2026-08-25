namespace AgroDigital.Api.Models;

public class Lote
{
    public int LoteId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
    public string Condicion { get; set; } = string.Empty;
    public decimal Hectareas { get; set; }
    public decimal SuperficieTotal { get; set; }
    public bool Activo { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
    public List<LoteCoordenada> Coordenadas { get; set; } = [];
}
