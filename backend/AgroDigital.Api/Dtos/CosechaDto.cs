namespace AgroDigital.Api.Dtos;

/*
    Contratos del modulo Cosechas (29_cosechas_rediseno.sql).

    Dos estados independientes, igual que Siembras:
      - Estado (de la cosecha): En curso -> Finalizado, con fecha real y resultado.
      - EstadoControl (control de perdidas / Tirada de Aros):
        Sin controles -> En curso (primera tirada) -> Finalizado (Finalizar control).
*/

public class CosechaDto
{
    public int CosechaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int? SiembraId { get; set; }
    public string? SiembraNombre { get; set; }
    public int LoteId { get; set; }
    public string LoteNombre { get; set; } = string.Empty;
    public int? EmpresaId { get; set; }
    public string? Empresa { get; set; }
    public string? CampaniaNombre { get; set; }
    public string Producto { get; set; } = string.Empty;

    public DateTime FechaInicio { get; set; }
    /// <summary>Fecha tentativa de fin, cargada al registrar. No se reemplaza al finalizar.</summary>
    public DateTime FechaFin { get; set; }
    public DateTime? FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }

    public decimal? CantidadGranoCosechado { get; set; }
    public decimal? CantidadHectareasTrabajadas { get; set; }
    public decimal? HumedadGrano { get; set; }
    public decimal? Impurezas { get; set; }
    public string? ResponsableACargo { get; set; }
    public decimal? RindeKgHa { get; set; }
    public decimal? RindeSecoKgHa { get; set; }
    public decimal? HumedadBaseAplicada { get; set; }
    public decimal? HectareasHora { get; set; }

    public string? TipoServicio { get; set; }
    public string? Contratista { get; set; }
    public string? Cosechadora { get; set; }
    public decimal? AnchoCabezalM { get; set; }

    public string Estado { get; set; } = string.Empty;
    public string EstadoControl { get; set; } = "Sin controles";

    /// <summary>Superficie sembrada (de la siembra o, si falta, del lote): tope del avance.</summary>
    public decimal? HectareasSembradas { get; set; }

    // Avance segun partes diarios (dbo.vw_CosechasAvance)
    public int CantidadPartes { get; set; }
    public decimal HectareasCosechadas { get; set; }
    public decimal KgAcumulados { get; set; }
    public decimal? HumedadPromedioPct { get; set; }
    public decimal KgASilo { get; set; }
    public decimal KgDistribucionDirecta { get; set; }
    public decimal KgPendientes { get; set; }
    public DateTime? FechaUltimoParte { get; set; }

    // Resumen del control de perdidas
    public int CantidadTiradas { get; set; }
    public decimal? PerdidaPromedioKgHa { get; set; }
    public string? UltimaSeveridad { get; set; }
}

/// <summary>Alta: todo lo de la siembra (lote, grano, campania, empresa) lo resuelve la API.</summary>
public class CrearCosechaRequest
{
    public int SiembraId { get; set; }
    public DateTime FechaInicio { get; set; }
    /// <summary>Fecha tentativa de fin.</summary>
    public DateTime FechaFin { get; set; }
    public string? ResponsableACargo { get; set; }
    public string? TipoServicio { get; set; }
    public string? Contratista { get; set; }
    public string? Cosechadora { get; set; }
    public decimal? AnchoCabezalM { get; set; }
}

/// <summary>
/// Edicion. La siembra no se cambia. Los campos de resultado solo se aplican si la
/// cosecha ya esta Finalizada; en una cosecha En curso se ignoran.
/// </summary>
public class ActualizarCosechaRequest
{
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string? ResponsableACargo { get; set; }
    public string? TipoServicio { get; set; }
    public string? Contratista { get; set; }
    public string? Cosechadora { get; set; }
    public decimal? AnchoCabezalM { get; set; }

    public DateTime? FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal? CantidadGranoCosechado { get; set; }
    public decimal? CantidadHectareasTrabajadas { get; set; }
    public decimal? HumedadGrano { get; set; }
    public decimal? Impurezas { get; set; }
    public decimal? HectareasHora { get; set; }
}

/// <summary>Cierre de la cosecha. El rinde y el rinde seco los calcula la API.</summary>
public class FinalizarCosechaRequest
{
    public DateTime FechaFinReal { get; set; }
    public string? JustificacionDesvioFin { get; set; }
    public decimal CantidadGranoCosechado { get; set; }
    public decimal CantidadHectareasTrabajadas { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal? Impurezas { get; set; }
    public decimal HectareasHora { get; set; }
    /// <summary>Si el control de perdidas esta En curso, cerrarlo en el mismo paso.</summary>
    public bool FinalizarControl { get; set; }
}

/// <summary>Siembra finalizada, ultima de su cadena y sin cosecha: se puede cosechar.</summary>
public class SiembraParaCosechaDto
{
    public int SiembraId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoRegistro { get; set; } = "Siembra";
    public int LoteId { get; set; }
    public string LoteNombre { get; set; } = string.Empty;
    public int? EmpresaId { get; set; }
    public string? Empresa { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string? CampaniaNombre { get; set; }
    public DateTime FechaFinReal { get; set; }
    public decimal? HectareasSembradas { get; set; }
    public decimal? PMG { get; set; }
}

// =====================================================================
// Tirada de Aros
// =====================================================================

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
    public decimal? GranosPrecosecha { get; set; }
    public decimal PMG { get; set; }
    public string? PmgOrigen { get; set; }
    public decimal? PerdidaPrecosechaKgHa { get; set; }
    public decimal PerdidaCabezalKgHa { get; set; }
    public decimal PerdidaColaKgHa { get; set; }
    public decimal PerdidaTotalKgHa { get; set; }
    public string Severidad { get; set; } = string.Empty;
    /// <summary>Tolerancia con la que se clasifico (null en tiradas anteriores al rediseno).</summary>
    public decimal? ToleranciaAplicadaKgHa { get; set; }
    public decimal? FactorAltaAplicado { get; set; }
    public bool AjustoMaquinaria { get; set; }
    public string? Observaciones { get; set; }
    public int? CreadoPorUsuarioId { get; set; }
}

public class CrearCosechaTiradaAroRequest
{
    public DateTime Fecha { get; set; }
    public decimal? Latitud { get; set; }
    public decimal? Longitud { get; set; }
    public int AroCabezal { get; set; }
    public int AroCola1 { get; set; }
    public int AroCola2 { get; set; }
    public int AroCola3 { get; set; }
    /// <summary>Promedio de granos por aro antes del paso de la cosechadora (opcional).</summary>
    public decimal? GranosPrecosecha { get; set; }
    /// <summary>Sin valor se usa el PMG de la siembra y, si falta, el de referencia del grano.</summary>
    public decimal? PMG { get; set; }
    public bool AjustoMaquinaria { get; set; }
    public string? Observaciones { get; set; }
}

public class ActualizarCosechaTiradaAroRequest : CrearCosechaTiradaAroRequest
{
}

/// <summary>Parametros con los que se clasifican las tiradas de una cosecha.</summary>
public class ParametrosPerdidaCosechaDto
{
    public string Producto { get; set; } = string.Empty;
    public decimal ToleranciaKgHa { get; set; }
    public decimal FactorAlta { get; set; }
    /// <summary>Por encima de este valor la perdida es Alta (Tolerancia x FactorAlta).</summary>
    public decimal LimiteMediaKgHa { get; set; }
    /// <summary>Empresa (ajuste propio), Referencia (INTA PRECOP) o General (grano sin referencia).</summary>
    public string Origen { get; set; } = string.Empty;
    public string? FuenteReferencia { get; set; }
    public decimal? PmgSiembra { get; set; }
    public decimal? PmgReferencia { get; set; }
    public decimal AreaAroM2 { get; set; }
}

// =====================================================================
// Partes diarios de avance
// =====================================================================

public class CosechaParteDto
{
    public int CosechaParteId { get; set; }
    public int CosechaId { get; set; }
    public DateTime Fecha { get; set; }
    public decimal Hectareas { get; set; }
    public decimal KgCosechados { get; set; }
    public decimal RindeKgHa { get; set; }
    public decimal HumedadPct { get; set; }
    /// <summary>Silo, Distribucion directa o Pendiente.</summary>
    public string Destino { get; set; } = string.Empty;
    public int? SiloId { get; set; }
    public string? SiloNombre { get; set; }
    public int? AlmacenamientoId { get; set; }
    public string? Observaciones { get; set; }
    public int? CreadoPorUsuarioId { get; set; }
    public string? CargadoPor { get; set; }
}

public class CrearCosechaParteRequest
{
    public DateTime Fecha { get; set; }
    public decimal Hectareas { get; set; }
    public decimal KgCosechados { get; set; }
    public decimal HumedadPct { get; set; }
    public string Destino { get; set; } = string.Empty;
    public int? SiloId { get; set; }
    public string? Observaciones { get; set; }
}

public class ActualizarCosechaParteRequest : CrearCosechaParteRequest
{
}
