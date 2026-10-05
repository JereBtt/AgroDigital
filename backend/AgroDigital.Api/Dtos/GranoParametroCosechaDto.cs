namespace AgroDigital.Api.Dtos;

/// <summary>
/// Tolerancia de perdida por cosechadora de un grano para una empresa.
/// Combina la referencia global (dbo.GranoToleranciasCosecha) con el ajuste
/// propio de la empresa (dbo.GranoParametrosCosecha), si lo tiene.
/// </summary>
public class GranoParametroCosechaDto
{
    /// <summary>Id del ajuste de la empresa; null si se usa la referencia.</summary>
    public int? GranoParametroCosechaId { get; set; }
    public int EmpresaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public decimal ToleranciaKgHa { get; set; }
    public decimal FactorAlta { get; set; }
    public decimal LimiteMediaKgHa { get; set; }
    /// <summary>true si la empresa cargo un valor propio.</summary>
    public bool Personalizado { get; set; }
    public decimal? ToleranciaReferenciaKgHa { get; set; }
    public decimal? PmgReferenciaG { get; set; }
    public string? FuenteReferencia { get; set; }
    public DateTime? FechaModificacion { get; set; }
}

/// <summary>Crea o actualiza el ajuste de la empresa para un grano.</summary>
public class GuardarGranoParametroCosechaRequest
{
    public int EmpresaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public decimal ToleranciaKgHa { get; set; }
    public decimal FactorAlta { get; set; } = 1.5m;
}
