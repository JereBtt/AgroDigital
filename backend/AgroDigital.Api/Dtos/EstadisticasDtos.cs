namespace AgroDigital.Api.Dtos;

// =====================================================================
// Silos y almacenamiento
// =====================================================================

public class EstadisticasAlmacenamientoDto
{
    // Al dia de hoy (no dependen del periodo)
    public decimal StockKg { get; set; }
    public int SilosConGrano { get; set; }
    public decimal? AntiguedadPromedioDias { get; set; }
    public decimal KgMas180Dias { get; set; }
    public IReadOnlyList<AntiguedadGranoDto> Antiguedad { get; set; } = [];

    // Segun el periodo
    public decimal KgIngresados { get; set; }
    public decimal KgMerma { get; set; }
    public decimal? MermaPct { get; set; }
    public IReadOnlyList<MermaMotivoDto> Mermas { get; set; } = [];
    public IReadOnlyList<FlujoMensualDto> FlujoMensual { get; set; } = [];

    public int ControlesProgramados { get; set; }
    public int ControlesEnTermino { get; set; }
    public decimal? ControlesEnTerminoPct { get; set; }
    public decimal? AtrasoPromedioDias { get; set; }
    public IReadOnlyList<CumplimientoSiloDto> ControlesPorSilo { get; set; } = [];

    /// <summary>Granos con stock o movimientos en la empresa, para el filtro de grano.</summary>
    public IReadOnlyList<string> GranosDisponibles { get; set; } = [];
}

public class AntiguedadGranoDto
{
    public string Producto { get; set; } = string.Empty;
    public decimal Kg0a30 { get; set; }
    public decimal Kg31a90 { get; set; }
    public decimal Kg91a180 { get; set; }
    public decimal KgMas180 { get; set; }
    public decimal KgTotal { get; set; }
}

public class FlujoMensualDto
{
    public int Anio { get; set; }
    public int Mes { get; set; }
    public decimal IngresosKg { get; set; }
    public decimal EgresosDistribucionKg { get; set; }
    /// <summary>Consumo interno, semilla propia, deterioro y ajustes negativos.</summary>
    public decimal EgresosOtrosKg { get; set; }
    public decimal StockCierreKg { get; set; }
}

public class MermaMotivoDto
{
    public string Motivo { get; set; } = string.Empty;
    public decimal Kg { get; set; }
    public decimal Pct { get; set; }
}

public class CumplimientoSiloDto
{
    public int SiloId { get; set; }
    public string Silo { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public int Programados { get; set; }
    public int EnTermino { get; set; }
    public decimal Pct { get; set; }
    public decimal? AtrasoPromedioDias { get; set; }
}

// =====================================================================
// Distribucion
// =====================================================================

public class EstadisticasDistribucionDto
{
    // Segun el periodo
    public decimal KgDespachados { get; set; }
    public int CantidadCamiones { get; set; }
    public int CantidadDestinos { get; set; }
    public decimal? MermaRealPct { get; set; }
    public decimal? MermaEsperadaPct { get; set; }
    public decimal? DesvioPp { get; set; }
    public string? NivelDesvio { get; set; }
    public decimal? KgSinJustificar { get; set; }
    public decimal? KgSinJustificarBalanza { get; set; }
    public decimal? KgSinJustificarCalidad { get; set; }

    public IReadOnlyList<MermaAcopiadoraDto> MermaPorAcopiadora { get; set; } = [];
    public IReadOnlyList<KgDestinoDto> KgPorDestino { get; set; } = [];
    public IReadOnlyList<BalanzaTransportistaDto> BalanzaPorTransportista { get; set; } = [];

    // Al dia de hoy
    public int CamionesRecibidosSinConciliar { get; set; }
    public int CamionesEnTransito { get; set; }
}

public class MermaAcopiadoraDto
{
    public int DestinoId { get; set; }
    public string Destino { get; set; } = string.Empty;
    public decimal KgDespachados { get; set; }
    public decimal MermaRealPct { get; set; }
    public decimal MermaEsperadaPct { get; set; }
    public decimal DesvioPp { get; set; }
    public string NivelDesvio { get; set; } = string.Empty;
}

public class KgDestinoDto
{
    public int DestinoId { get; set; }
    public string Destino { get; set; } = string.Empty;
    public decimal Kg { get; set; }
    public decimal Pct { get; set; }
}

public class BalanzaTransportistaDto
{
    public string Transportista { get; set; } = string.Empty;
    public decimal DiferenciaKg { get; set; }
    public decimal DiferenciaPct { get; set; }
    public decimal KgDespachados { get; set; }
}
