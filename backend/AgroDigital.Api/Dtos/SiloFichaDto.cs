namespace AgroDigital.Api.Dtos;

/// <summary>
/// SILO-03: ficha del silo. Reemplaza al detalle simple y reune en una sola
/// respuesta lo que muestran sus pestanas: Resumen, Movimientos y Controles.
/// </summary>
public class SiloFichaDto
{
    public SiloDto Silo { get; set; } = new();

    /// <summary>Partidas con saldo, de la mas antigua a la mas nueva (orden FIFO).</summary>
    public IReadOnlyList<PartidaDto> Partidas { get; set; } = [];

    /// <summary>Controles en orden cronologico, para el grafico de humedad y temperatura.</summary>
    public IReadOnlyList<SiloControlPuntoDto> Controles { get; set; } = [];

    /// <summary>Documentos cargados en todos los controles del silo, del mas reciente al mas antiguo.</summary>
    public IReadOnlyList<SiloDocumentoDto> Documentos { get; set; } = [];

    /// <summary>Movimientos de Almacenamiento del silo, del mas reciente al mas antiguo.</summary>
    public IReadOnlyList<AlmacenamientoDto> Movimientos { get; set; } = [];

    public decimal CapacidadLibre => Math.Max(0, Silo.CapacidadMax - Silo.CantidadGranoAlmacenado);
}

public class SiloControlPuntoDto
{
    public int SiloControlId { get; set; }
    public DateTime Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public string? Resultado { get; set; }
}
