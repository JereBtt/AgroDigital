namespace AgroDigital.Api.Dtos;

public class SiembraDto
{
    public int SiembraId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int LoteId { get; set; }
    public string LoteNombre { get; set; } = string.Empty;
    public string? CampaniaNombre { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string? Empresa { get; set; }
    public string TipoRegistro { get; set; } = "Siembra";
    public int? SiembraOriginalId { get; set; }
    public string? SiembraOriginalNombre { get; set; }
    public string? TipoResiembra { get; set; }
    public string? Siniestro { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public DateTime? FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal? HectareasHora { get; set; }
    public string? VariedadSemilla { get; set; }
    public decimal? PMG { get; set; }
    public decimal? DensidadSiembra { get; set; }
    public decimal? Profundidad { get; set; }
    public decimal? CantidadHectareasTrabajadas { get; set; }
    public decimal? UreaKgHa { get; set; }
    public decimal? CantidadSemillas { get; set; }
    public string? ResponsableACargo { get; set; }
    public DateTime? FechaMuestreo { get; set; }
    public DateTime? FechaAnalisis { get; set; }
    public int? CantidadMuestras { get; set; }
    public string? ProductoAntecesor { get; set; }
    public string? ObservacionesPreSiembra { get; set; }
    public string EstadoSiembra { get; set; } = "En curso";
    public string Estado { get; set; } = string.Empty;
}

public class CrearSiembraRequest
{
    public int LoteId { get; set; }
    public string? CampaniaNombre { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string? Empresa { get; set; }
    public string TipoRegistro { get; set; } = "Siembra";
    public int? SiembraOriginalId { get; set; }
    public string? TipoResiembra { get; set; }
    public string? Siniestro { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string? VariedadSemilla { get; set; }
    public decimal? PMG { get; set; }
    public decimal? DensidadSiembra { get; set; }
    public decimal? Profundidad { get; set; }
    public decimal? CantidadHectareasTrabajadas { get; set; }
    public decimal? UreaKgHa { get; set; }
    public decimal? CantidadSemillas { get; set; }
    public string? ResponsableACargo { get; set; }
    public DateTime? FechaMuestreo { get; set; }
    public DateTime? FechaAnalisis { get; set; }
    public int? CantidadMuestras { get; set; }
    public string? ProductoAntecesor { get; set; }
    public string? ObservacionesPreSiembra { get; set; }
}

public class ActualizarSiembraRequest : CrearSiembraRequest
{
}

public class FinalizarSiembraRequest
{
    public DateTime FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal HectareasHora { get; set; }
}
