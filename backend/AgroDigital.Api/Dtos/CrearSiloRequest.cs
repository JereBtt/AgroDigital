namespace AgroDigital.Api.Dtos;

/// <summary>
/// Datos del formulario de silo que comparten el alta y la edicion (wizard de 4 pasos).
/// Permite validar ambos requests con la misma logica en el controller.
/// </summary>
public interface ISiloFormulario
{
    int? LoteId { get; }
    string Nombre { get; }
    string TipoSilo { get; }
    decimal CapacidadMax { get; }
    string Pais { get; }
    string Provincia { get; }
    string Ciudad { get; }

    // Ubicacion georreferenciada (punto en el mapa).
    decimal? Latitud { get; }
    decimal? Longitud { get; }

    // Silo de chapa.
    decimal? DiametroM { get; }
    decimal? AlturaM { get; }
    bool? TieneAireacion { get; }
    bool? TieneTermometria { get; }

    // Silo bolsa (bolson).
    decimal? LargoM { get; }
    decimal? DiametroBolsonPies { get; }
    DateOnly? FechaEmbolsado { get; }
    DateOnly? FechaVencimientoEstimada { get; }
    string? IdentificacionEnLote { get; }
}

public class CrearSiloRequest : ISiloFormulario
{
    public int? LoteId { get; set; }

    /// <summary>Empresa del silo. Si hay lote, se toma la del lote.</summary>
    public int? EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public decimal CapacidadMax { get; set; }

    // Paso 4 del wizard: grano inicial (opcional). Genera un Ingreso automatico.
    public string? Producto { get; set; }
    public decimal? CantidadGranoAlmacenado { get; set; }

    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;

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
}
