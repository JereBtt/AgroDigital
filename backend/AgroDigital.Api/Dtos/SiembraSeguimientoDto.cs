namespace AgroDigital.Api.Dtos;

public class SiembraSeguimientoDto
{
    public int SiembraSeguimientoId { get; set; }
    public int SiembraId { get; set; }
    public DateTime Fecha { get; set; }
    public decimal? Longitud { get; set; }
    public decimal? Latitud { get; set; }
    public string? Incidencia { get; set; }
    public bool? PerdidaEconomica { get; set; }
    public bool? AplicacionAgroquimicos { get; set; }
    public string Observaciones { get; set; } = string.Empty;
}

public class CrearSiembraSeguimientoRequest
{
    public DateTime? Fecha { get; set; }
    public decimal? Longitud { get; set; }
    public decimal? Latitud { get; set; }
    public string? Incidencia { get; set; }
    public bool? PerdidaEconomica { get; set; }
    public bool? AplicacionAgroquimicos { get; set; }
    public string Observaciones { get; set; } = string.Empty;
}

public class ActualizarSiembraSeguimientoRequest
{
    public DateTime? Fecha { get; set; }
    public decimal? Longitud { get; set; }
    public decimal? Latitud { get; set; }
    public string? Incidencia { get; set; }
    public bool? PerdidaEconomica { get; set; }
    public bool? AplicacionAgroquimicos { get; set; }
    public string Observaciones { get; set; } = string.Empty;
}
