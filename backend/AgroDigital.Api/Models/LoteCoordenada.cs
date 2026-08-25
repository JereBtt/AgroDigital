namespace AgroDigital.Api.Models;

public class LoteCoordenada
{
    public int LoteCoordenadaId { get; set; }
    public int LoteId { get; set; }
    public int Orden { get; set; }
    public decimal Latitud { get; set; }
    public decimal Longitud { get; set; }
}
