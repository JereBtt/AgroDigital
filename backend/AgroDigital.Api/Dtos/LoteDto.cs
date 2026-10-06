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
    public List<LoteDeshabilitacionDto> HistorialDeshabilitaciones { get; set; } = [];
}

public class LoteDeshabilitacionDto
{
    public int LoteDeshabilitacionId { get; set; }
    public string RegistroId { get; set; } = string.Empty;
    public string TipoRegistro { get; set; } = "Lote";
    public string? CicloEstacional { get; set; }
    public string? Producto { get; set; }
    public bool LoteDeshabilitado { get; set; }
    public int? SiembraId { get; set; }
    public string Motivo { get; set; } = string.Empty;
    public string? Detalle { get; set; }
    public string? Siniestro { get; set; }
    public DateTime? FechaSiniestro { get; set; }
    public DateTime FechaCreacion { get; set; }
}

public class LoteCultivoHistorialDto
{
    public string Campania { get; set; } = string.Empty;
    public string Cultivo { get; set; } = string.Empty;
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public string EstadoCultivo { get; set; } = string.Empty;
}
