namespace AgroDigital.Api.Dtos;

public sealed class HabilitarLoteRequest
{
    // Sin siembras: flujo habitual. Restaurar: arrepentimiento. Nuevas: conserva el historial dado de baja.
    public string? Modo { get; set; }
}

public sealed class HabilitacionLoteDto
{
    public int? CampaniaId { get; set; }
    public string? CampaniaNombre { get; set; }
    public bool CampaniaActiva { get; set; }
    public bool TieneSiembras { get; set; }
    public bool PuedeRestaurar { get; set; }
    public string? Motivo { get; set; }
    public string? Detalle { get; set; }
    public string? Siniestro { get; set; }
    public DateTime? FechaSiniestro { get; set; }
    public string? UltimaSiembraNombre { get; set; }
    public string? UltimaSiembraTipo { get; set; }
    public string? UltimoCultivo { get; set; }
    internal int? UltimaBajaId { get; set; }
    internal int? UltimaSiembraId { get; set; }
    internal string? EstadoSeguimientoAnterior { get; set; }
    internal int? SeguimientoAutomaticoId { get; set; }
    internal string? Periodo { get; set; }
}
