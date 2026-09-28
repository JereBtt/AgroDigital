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

    /// <summary>Normal / Atencion / Critico, calculado al guardar (EvaluadorControlSilo).</summary>
    public string? Resultado { get; set; }
    public DateOnly? FechaProximoControl { get; set; }
}

public class CrearSiloControlRequest
{
    public DateTime? Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public bool? RoturaBolsa { get; set; }
    public string? Observaciones { get; set; }

    /// <summary>Opcional: si viene, reemplaza la fecha sugerida por el evaluador.</summary>
    public DateOnly? FechaProximoControl { get; set; }
}

public class ActualizarSiloControlRequest
{
    public DateTime? Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public bool? RoturaBolsa { get; set; }
    public string? Observaciones { get; set; }

    /// <summary>Opcional: si viene, reemplaza la fecha sugerida por el evaluador.</summary>
    public DateOnly? FechaProximoControl { get; set; }
}

/// <summary>
/// Resultado de evaluar un control (sin guardarlo). Lo usa la pantalla para
/// mostrar el resultado en vivo mientras se cargan humedad y temperatura.
/// </summary>
public class EvaluacionControlDto
{
    public string Resultado { get; set; } = "Normal";
    public IReadOnlyList<string> Motivos { get; set; } = [];
    public DateOnly? FechaProximoControlSugerida { get; set; }
    public bool ParametrosConfigurados { get; set; }
    public string? Producto { get; set; }
    public decimal? UmbralHumedad { get; set; }
    public decimal? MargenTemperaturaC { get; set; }
    public int? FrecuenciaControlDias { get; set; }
    public decimal? TemperaturaAnterior { get; set; }
}
