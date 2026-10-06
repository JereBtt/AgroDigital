namespace AgroDigital.Api.Dtos;

public class SiloDto
{
    public int SiloId { get; set; }
    public int? EmpresaId { get; set; }
    public string? Codigo { get; set; }
    public string EstadoOperativo { get; set; } = "Vacio";
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

    // Caracteristicas y ubicacion (wizard de registro).
    public decimal? Latitud { get; set; }
    public decimal? Longitud { get; set; }
    public decimal? DiametroM { get; set; }
    public decimal? AlturaM { get; set; }
    public bool? TieneAireacion { get; set; }
    public bool? TieneTermometria { get; set; }
    public decimal? LargoM { get; set; }
    public decimal? DiametroBolsonPies { get; set; }
    public DateOnly? FechaEmbolsado { get; set; }
    public DateOnly? FechaVencimientoEstimada { get; set; }
    public string? IdentificacionEnLote { get; set; }

    // Tablero de silos (rediseno): ultimo control y antiguedad del grano.
    public DateOnly? UltimoControlFecha { get; set; }
    public string? UltimoControlResultado { get; set; }
    public DateOnly? FechaProximoControl { get; set; }

    /// <summary>Dias promedio que lleva guardado el grano, ponderado por kg de cada partida.</summary>
    public int? DiasAntiguedadPromedio { get; set; }

    public decimal NivelOcupacionPorcentaje =>
        CapacidadMax > 0 ? Math.Round(CantidadGranoAlmacenado / CapacidadMax * 100, 2) : 0;
}
