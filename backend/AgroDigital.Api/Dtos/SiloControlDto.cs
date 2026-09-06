namespace AgroDigital.Api.Dtos;

public class SiloControlDto
{
    public int SiloControlId { get; set; }
    public int SiloId { get; set; }
    public DateTime Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public bool? RoturaBolsa { get; set; }
    public string? Observaciones { get; set; }
    public int CantidadIncidencias { get; set; }
    public int CantidadInsumos { get; set; }
}

public class CrearSiloControlRequest
{
    public DateTime? Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public bool? RoturaBolsa { get; set; }
    public string? Observaciones { get; set; }
}

public class ActualizarSiloControlRequest
{
    public DateTime? Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public bool? RoturaBolsa { get; set; }
    public string? Observaciones { get; set; }
}
