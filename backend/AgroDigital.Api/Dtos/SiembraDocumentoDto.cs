namespace AgroDigital.Api.Dtos;

public class SiembraDocumentoDto
{
    public int SiembraDocumentoId { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public DateTime FechaCarga { get; set; }
    public string? CargadoPor { get; set; }
}
