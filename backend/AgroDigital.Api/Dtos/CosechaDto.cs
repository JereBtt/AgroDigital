namespace AgroDigital.Api.Dtos;

public class CosechaDto
{
    public int CosechaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int? SiembraId { get; set; }
    public string? SiembraNombre { get; set; }
    public int LoteId { get; set; }
    public string LoteNombre { get; set; } = string.Empty;
    public string? CampaniaNombre { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string? Empresa { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public DateTime? FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal? CantidadGranoCosechado { get; set; }
    public decimal? CantidadHectareasTrabajadas { get; set; }
    public decimal? HumedadGrano { get; set; }
    public decimal? Impurezas { get; set; }
    public string? ResponsableACargo { get; set; }
    public decimal? RindeKgHa { get; set; }
    public string Estado { get; set; } = string.Empty;
}

public class CrearCosechaRequest
{
    public int? SiembraId { get; set; }
    public int LoteId { get; set; }
    public string? CampaniaNombre { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string? Empresa { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public DateTime? FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal? CantidadGranoCosechado { get; set; }
    public decimal? CantidadHectareasTrabajadas { get; set; }
    public decimal? HumedadGrano { get; set; }
    public decimal? Impurezas { get; set; }
    public string? ResponsableACargo { get; set; }
    public decimal? RindeKgHa { get; set; }
}

public class ActualizarCosechaRequest : CrearCosechaRequest
{
}

public class FinalizarCosechaRequest
{
    public DateTime FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal CantidadGranoCosechado { get; set; }
    public decimal CantidadHectareasTrabajadas { get; set; }
    public decimal? HumedadGrano { get; set; }
    public decimal? Impurezas { get; set; }
    public string? ResponsableACargo { get; set; }
    public decimal? RindeKgHa { get; set; }
}

public class CosechaTiradaAroDto
{
    public int CosechaTiradaAroId { get; set; }
    public int CosechaId { get; set; }
    public DateTime Fecha { get; set; }
    public decimal? Latitud { get; set; }
    public decimal? Longitud { get; set; }
    public int AroCabezal { get; set; }
    public int AroCola1 { get; set; }
    public int AroCola2 { get; set; }
    public int AroCola3 { get; set; }
    public decimal PMG { get; set; }
    public decimal PerdidaCabezalKgHa { get; set; }
    public decimal PerdidaColaKgHa { get; set; }
    public decimal PerdidaTotalKgHa { get; set; }
    public string Severidad { get; set; } = string.Empty;
    public bool AjustoMaquinaria { get; set; }
    public string? Observaciones { get; set; }
}

public class CrearCosechaTiradaAroRequest
{
    public DateTime Fecha { get; set; }
    public DateTime? FechaFinRealReferencia { get; set; }
    public decimal? Latitud { get; set; }
    public decimal? Longitud { get; set; }
    public int AroCabezal { get; set; }
    public int AroCola1 { get; set; }
    public int AroCola2 { get; set; }
    public int AroCola3 { get; set; }
    public decimal? PMG { get; set; }
    public bool AjustoMaquinaria { get; set; }
    public string? Observaciones { get; set; }
}

public class ActualizarCosechaTiradaAroRequest : CrearCosechaTiradaAroRequest
{
}
