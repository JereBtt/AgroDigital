namespace AgroDigital.Api.Dtos;

public class SiloDocumentoDto
{
    public int SiloDocumentoId { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public DateTime FechaCarga { get; set; }
    public string? CargadoPor { get; set; }

    // Solo en la ficha del silo (pestana Documentacion): de que control es cada documento.
    public int? SiloControlId { get; set; }
    public DateTime? FechaControl { get; set; }
}
