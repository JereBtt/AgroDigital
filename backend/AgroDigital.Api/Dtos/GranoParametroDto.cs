namespace AgroDigital.Api.Dtos;

/// <summary>
/// Criterio agronomico de una empresa para un grano y tipo de silo
/// (dbo.GranoParametrosAlmacenamiento). Lo define el ingeniero.
/// </summary>
public class GranoParametroDto
{
    public int GranoParametroAlmacenamientoId { get; set; }
    public int EmpresaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public decimal UmbralHumedad { get; set; }
    public decimal MargenTemperaturaC { get; set; }
    public int FrecuenciaControlDias { get; set; }

    /// <summary>Humedad base de comercializacion del grano, como referencia (puede no existir).</summary>
    public decimal? HumedadBaseComercializacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
}

/// <summary>Alta o modificacion: si ya existe la combinacion empresa + grano + tipo de silo, se actualiza.</summary>
public class GuardarGranoParametroRequest
{
    public int EmpresaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string TipoSilo { get; set; } = string.Empty;
    public decimal UmbralHumedad { get; set; }
    public decimal MargenTemperaturaC { get; set; }
    public int FrecuenciaControlDias { get; set; }
}

/// <summary>Valor normativo global (dbo.GranoBasesComercializacion), solo lectura.</summary>
public class GranoBaseComercializacionDto
{
    public string Producto { get; set; } = string.Empty;
    public decimal HumedadBase { get; set; }
    public string FuenteNormativa { get; set; } = string.Empty;
}
