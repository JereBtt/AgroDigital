namespace AgroDigital.Api.Dtos;

public class LoteDto
{
    public int LoteId { get; set; }
    public int? EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
    public string Condicion { get; set; } = string.Empty;
    public string CultivoAnterior { get; set; } = string.Empty;
    public string? CultivoAnteriorCampania { get; set; }
    public string? CultivoActual { get; set; }
    public string EstadoCultivo { get; set; } = "Sin cultivo";
    public decimal Hectareas { get; set; }
    public decimal SuperficieTotal { get; set; }
    public bool Activo { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
    public List<LoteCoordenadaDto> Coordenadas { get; set; } = [];
    public List<LoteCultivoHistorialDto> HistorialCultivos { get; set; } = [];
}

public class LoteCultivoHistorialDto
{
    public string Campania { get; set; } = string.Empty;
    public string Cultivo { get; set; } = string.Empty;
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public string EstadoCultivo { get; set; } = string.Empty;
}
