namespace AgroDigital.Api.Dtos;

public class ActualizarSiloRequest : ISiloFormulario
{
    public int? LoteId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public decimal CapacidadMax { get; set; }
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

    /// <summary>
    /// Se ignora: el grano del silo lo mantiene Almacenamiento segun sus movimientos.
    /// Se conserva para que la pantalla actual, que lo reenvia, no falle.
    /// </summary>
    public string? Producto { get; set; }

    /// <summary>
    /// Se ignora: la baja y el mantenimiento se manejan con PUT api/silos/{id}/estado.
    /// Se conserva para que la pantalla actual, que lo reenvia, no falle.
    /// </summary>
    public bool? Activo { get; set; }
}
