namespace AgroDigital.Api.Dtos;

public class CosechaDocumentoDto
{
    public int CosechaDocumentoId { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public DateTime FechaCarga { get; set; }
    public string? CargadoPor { get; set; }
}
