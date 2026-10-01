namespace AgroDigital.Api.Dtos;

/// <summary>
/// ALM-08: ajuste de stock. "Positivo" suma grano (diferencia de medicion);
/// "Negativo" lo descuenta (merma por secado, diferencia de medicion o deterioro).
/// Solo lo registra el Encargado de la empresa.
/// </summary>
public class RegistrarAjusteRequest
{
    public int SiloId { get; set; }
    public DateOnly Fecha { get; set; }
    public string Sentido { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public string Motivo { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
}

/// <summary>ALM-06: transferencia de grano entre dos silos de la misma empresa.</summary>
public class RegistrarTransferenciaRequest
{
    public int SiloOrigenId { get; set; }
    public int SiloDestinoId { get; set; }
    public DateOnly Fecha { get; set; }
    public decimal Cantidad { get; set; }

    /// <summary>Texto libre (por ejemplo, "vaciado del bolson antes del vencimiento"). Se guarda en Observaciones.</summary>
    public string? Motivo { get; set; }
}

/// <summary>Los dos movimientos que genera una transferencia, vinculados por TransferenciaId.</summary>
public class TransferenciaResultadoDto
{
    public Guid TransferenciaId { get; set; }
    public AlmacenamientoDto Egreso { get; set; } = new();
    public AlmacenamientoDto Ingreso { get; set; } = new();
}

public class AlmacenamientoDocumentoDto
{
    public int AlmacenamientoDocumentoId { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public DateTime FechaCarga { get; set; }
    public string? CargadoPor { get; set; }
}
