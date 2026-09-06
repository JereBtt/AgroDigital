namespace AgroDigital.Api.Dtos;

public class SiloControlIncidenciaDto
{
    public int SiloControlIncidenciaId { get; set; }
    public int SiloControlId { get; set; }
    public DateTime Fecha { get; set; }
    public string TipoPlaga { get; set; } = string.Empty;
    public string Observaciones { get; set; } = string.Empty;
}

public class CrearSiloControlIncidenciaRequest
{
    public string TipoPlaga { get; set; } = string.Empty;
    public string Observaciones { get; set; } = string.Empty;
}
