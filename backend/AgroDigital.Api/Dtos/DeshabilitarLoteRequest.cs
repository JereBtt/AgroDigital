using System.ComponentModel.DataAnnotations;

namespace AgroDigital.Api.Dtos;

public class DeshabilitarLoteRequest
{
    [Required]
    public string Motivo { get; set; } = string.Empty;
    [StringLength(500)]
    public string? Detalle { get; set; }
    public string? Siniestro { get; set; }
    public DateTime? FechaSiniestro { get; set; }
}

public sealed class DeshabilitarSiembraRequest : DeshabilitarLoteRequest
{
    public bool? AfectarInvierno { get; set; }
}
