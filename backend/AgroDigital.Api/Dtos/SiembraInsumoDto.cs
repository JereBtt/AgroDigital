namespace AgroDigital.Api.Dtos;

public class SiembraInsumoDto
{
    public int SiembraInsumoId { get; set; }
    public DateOnly? FechaAplicacion { get; set; }
    public string? Marca { get; set; }
    public string? Tipo { get; set; }
    public string? Variedad { get; set; }
    public decimal? CantidadAplicada { get; set; }
}

public class CrearSiembraInsumoRequest
{
    public DateOnly? FechaAplicacion { get; set; }
    public string? Marca { get; set; }
    public string? Tipo { get; set; }
    public string? Variedad { get; set; }
    public decimal? CantidadAplicada { get; set; }
}
