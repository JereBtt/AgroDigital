namespace AgroDigital.Api.Dtos;

public class CampaniaDto
{
    public int CampaniaId { get; set; }
    public int? EmpresaId { get; set; }
    public string? EmpresaNombre { get; set; }
    public string? Periodo { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string? Observaciones { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
    public List<CampaniaCombinacionDto> Combinaciones { get; set; } = [];
}

public class CampaniaCombinacionDto
{
    public int CampaniaCombinacionId { get; set; }
    public int CampaniaId { get; set; }
    public int LoteId { get; set; }
    public string LoteNombre { get; set; } = string.Empty;
    public decimal? LoteHectareas { get; set; }
    public string? LoteZona { get; set; }
    public string? CultivoAntecesor { get; set; }
    public string Producto { get; set; } = string.Empty;
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string Estado { get; set; } = "Pendiente";
    public string EtapaActual { get; set; } = "Sin etapa";
}

public class CampaniaConsultaDto : CampaniaCombinacionDto
{
    public int? EmpresaId { get; set; }
    public string? EmpresaNombre { get; set; }
    public string? Periodo { get; set; }
    public string CampaniaNombre { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
}

public class CrearCampaniaRequest
{
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string? Observaciones { get; set; }
    public List<CrearCampaniaCombinacionRequest> Combinaciones { get; set; } = [];
}

public class CrearCampaniaCombinacionRequest
{
    public int LoteId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
}

public class ActualizarCampaniaRequest : CrearCampaniaRequest
{
}
