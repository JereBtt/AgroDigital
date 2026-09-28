namespace AgroDigital.Api.Dtos;

/// <summary>
/// ALM-05: stock actual de una empresa, por grano y por silo, con las
/// partidas que lo componen y las cosechas que todavia tienen grano sin destino.
/// </summary>
public class StockActualDto
{
    public IReadOnlyList<StockGranoDto> Granos { get; set; } = [];
    public IReadOnlyList<StockSiloDto> Silos { get; set; } = [];
    public IReadOnlyList<SaldoCosechaDto> CosechasConSaldo { get; set; } = [];
    public decimal KgTotales { get; set; }
    public decimal CapacidadTotal { get; set; }
}

public class StockGranoDto
{
    public string Producto { get; set; } = string.Empty;
    public decimal Kg { get; set; }
    public int CantidadSilos { get; set; }
}

public class StockSiloDto
{
    public int SiloId { get; set; }
    public int? EmpresaId { get; set; }
    public string? Codigo { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public string? Producto { get; set; }
    public string EstadoOperativo { get; set; } = string.Empty;
    public string? LoteNombre { get; set; }
    public decimal CapacidadMax { get; set; }
    public decimal Kg { get; set; }
    public decimal PorcentajeOcupacion => CapacidadMax > 0 ? Math.Round(Kg / CapacidadMax * 100, 1) : 0;

    /// <summary>Antiguedad promedio ponderada por kg de las partidas con saldo.</summary>
    public int? DiasAntiguedadPromedio { get; set; }

    public DateOnly? UltimoControlFecha { get; set; }
    public string? UltimoControlResultado { get; set; }
    public DateOnly? FechaProximoControl { get; set; }
    public IReadOnlyList<PartidaDto> Partidas { get; set; } = [];
}

public class PartidaDto
{
    public int PartidaId { get; set; }
    public int SiloId { get; set; }
    public int? CosechaId { get; set; }
    public string? CosechaNombre { get; set; }
    public int? CampaniaId { get; set; }
    public string? CampaniaNombre { get; set; }
    public string? LoteNombre { get; set; }
    public string? Producto { get; set; }
    public DateOnly FechaIngreso { get; set; }
    public decimal KgIniciales { get; set; }
    public decimal KgRestantes { get; set; }
    public int DiasAlmacenado { get; set; }
}

/// <summary>
/// Saldo de una cosecha: lo cosechado menos lo ya almacenado.
/// KgDistribuidosDirecto queda en 0 hasta que exista el modulo de Distribucion.
/// </summary>
public class SaldoCosechaDto
{
    public int CosechaId { get; set; }
    public int? EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Producto { get; set; } = string.Empty;
    public int LoteId { get; set; }
    public string? LoteNombre { get; set; }
    public int? CampaniaId { get; set; }
    public string? CampaniaNombre { get; set; }
    public string Estado { get; set; } = string.Empty;
    public DateOnly FechaInicio { get; set; }
    public decimal? KgCosechados { get; set; }
    public decimal KgAlmacenados { get; set; }
    public decimal KgDistribuidosDirecto { get; set; }
    public decimal KgDisponibles => KgCosechados is null ? 0 : Math.Max(0, KgCosechados.Value - KgAlmacenados - KgDistribuidosDirecto);
}

/// <summary>Silo candidato para un ingreso, con el motivo si no se puede usar.</summary>
public class SiloDestinoDto
{
    public int SiloId { get; set; }
    public string? Codigo { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public string? Producto { get; set; }
    public string EstadoOperativo { get; set; } = string.Empty;
    public decimal CapacidadMax { get; set; }
    public decimal Kg { get; set; }
    public decimal CapacidadLibre => Math.Max(0, CapacidadMax - Kg);
    public bool Compatible { get; set; }
    public string? MotivoNoCompatible { get; set; }
}
