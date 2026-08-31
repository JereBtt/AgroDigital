namespace AgroDigital.Api.Dtos;

public class SeguimientoInsumoDto
{
    public int SeguimientoInsumoId { get; set; }
    public DateOnly? FechaAplicacion { get; set; }
    public string? Marca { get; set; }
    public string? Tipo { get; set; }
    public string? Variedad { get; set; }
    public decimal? CantidadAplicada { get; set; }
}

public class CrearSeguimientoInsumoRequest
{
    public DateOnly? FechaAplicacion { get; set; }
    public string? Marca { get; set; }
    public string? Tipo { get; set; }
    public string? Variedad { get; set; }
    public decimal? CantidadAplicada { get; set; }
}

public class SeguimientoDocumentoDto
{
    public int SeguimientoDocumentoId { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public DateTime FechaCarga { get; set; }
    public string? CargadoPor { get; set; }
}
