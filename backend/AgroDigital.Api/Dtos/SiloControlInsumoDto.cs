namespace AgroDigital.Api.Dtos;

public class SiloControlInsumoDto
{
    public int SiloControlInsumoId { get; set; }
    public int SiloControlId { get; set; }
    public DateOnly? FechaAplicacion { get; set; }
    public string? Marca { get; set; }
    public string? Tipo { get; set; }
    public decimal? CantidadAplicada { get; set; }
}

public class CrearSiloControlInsumoRequest
{
    public DateOnly? FechaAplicacion { get; set; }
    public string? Marca { get; set; }
    public string? Tipo { get; set; }
    public decimal? CantidadAplicada { get; set; }
}
