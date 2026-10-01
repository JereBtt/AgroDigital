namespace AgroDigital.Api.Dtos;

// =====================================================================
// Consultas
// =====================================================================

/// <summary>Una fila por camion / Carta de Porte (dbo.vw_DistribucionCamiones).</summary>
public class DistribucionCamionDto
{
    public int DistribucionCamionId { get; set; }
    public int DistribucionId { get; set; }
    public int EmpresaId { get; set; }
    public string Distribucion { get; set; } = string.Empty;
    public int? CampaniaId { get; set; }
    public string? Campania { get; set; }
    public int? CosechaId { get; set; }
    public string? Cosecha { get; set; }
    public int? LoteId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string OrigenGrano { get; set; } = string.Empty;
    public int? SiloId { get; set; }
    public string? Silo { get; set; }
    public DateOnly FechaSalida { get; set; }
    public string ResponsableACargo { get; set; } = string.Empty;

    public string CodigoCpe { get; set; } = string.Empty;
    public string? NroTicketBalanza { get; set; }
    public int ChoferId { get; set; }
    public string Chofer { get; set; } = string.Empty;
    public int? TransportistaId { get; set; }
    public string? Transportista { get; set; }
    public int CamionId { get; set; }
    public string Patente { get; set; } = string.Empty;
    public int DestinoId { get; set; }
    public string Destino { get; set; } = string.Empty;

    public string Estado { get; set; } = string.Empty;
    public DateOnly? FechaLlegada { get; set; }
    /// <summary>Solo tiene sentido en estado Recibido: dias esperando la liquidacion.</summary>
    public int? DiasSinConciliar { get; set; }

    public decimal KgDespachados { get; set; }
    public decimal? KgRecibidos { get; set; }
    public decimal? KgNetosLiquidados { get; set; }
    public decimal? HumedadDestino { get; set; }
    public decimal? MateriasExtranasDestino { get; set; }
    public string? NroLiquidacion { get; set; }
    public string? Observaciones { get; set; }

    public decimal? DiferenciaBalanzaKg { get; set; }
    public decimal? DescuentoCalidadKg { get; set; }
    public decimal? MermaTotalKg { get; set; }
    public decimal? MermaEsperadaKg { get; set; }
    public decimal? MermaEsperadaPct { get; set; }
    public decimal? MermaNoJustificadaKg { get; set; }
    public decimal? DiferenciaBalanzaPct { get; set; }
    public decimal? MermaTotalPct { get; set; }
    public decimal? DesvioPp { get; set; }
    public string? NivelDesvio { get; set; }
    public int? AlmacenamientoEgresoId { get; set; }
}

/// <summary>Envio completo: cabecera, camiones y documentacion.</summary>
public class DistribucionDto
{
    public int DistribucionId { get; set; }
    public int EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int? CampaniaId { get; set; }
    public int? CosechaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public string OrigenGrano { get; set; } = string.Empty;
    public int? SiloId { get; set; }
    public DateOnly FechaSalida { get; set; }
    public string ResponsableACargo { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
    public string Estado { get; set; } = string.Empty;
    public int CantidadCamiones { get; set; }
    public decimal KgDespachados { get; set; }
    public IReadOnlyList<DistribucionCamionDto> Camiones { get; set; } = [];
    public IReadOnlyList<DistribucionDocumentoDto> Documentos { get; set; } = [];
}

/// <summary>Indicadores de la cabecera del modulo.</summary>
public class DistribucionIndicadoresDto
{
    public decimal KgDespachados { get; set; }
    public int CantidadCamiones { get; set; }
    public int CantidadDestinos { get; set; }

    /// <summary>Solo con una campania filtrada; sin campania quedan en null.</summary>
    public decimal? KgCosechados { get; set; }
    public decimal? PctDistribuido { get; set; }
    public decimal? PctEnSilos { get; set; }
    public decimal? PctSinDestino { get; set; }

    /// <summary>
    /// Merma agregada: solo para Gerente, Encargado y Admin (Manual, seccion Roles:
    /// los indicadores agregados no se comparten con los demas roles).
    /// </summary>
    public bool IncluyeMerma { get; set; }
    public decimal? MermaRealPct { get; set; }
    public decimal? MermaEsperadaPct { get; set; }
    public decimal? DesvioPp { get; set; }
    public decimal? KgSinJustificar { get; set; }
    public string? NivelDesvio { get; set; }

    public int CamionesRecibidosSinConciliar { get; set; }
    public int CamionesEnTransito { get; set; }
    public int? MaxDiasSinConciliar { get; set; }
}

/// <summary>Detalle de un camion con su trazabilidad completa.</summary>
public class TrazabilidadCamionDto
{
    public DistribucionCamionDto Camion { get; set; } = new();
    public string? Lote { get; set; }
    public string? LoteUbicacion { get; set; }
    public string? LoteCondicion { get; set; }
    public string? Siembra { get; set; }
    public string? VariedadSemilla { get; set; }
    public DateOnly? FechaSiembra { get; set; }
    public decimal? HumedadCosecha { get; set; }
    public decimal? ImpurezasCosecha { get; set; }
    public IReadOnlyList<PartidaConsumidaDto> Partidas { get; set; } = [];
    public UltimoControlSiloDto? UltimoControlSilo { get; set; }
    public IReadOnlyList<DistribucionDocumentoDto> Documentos { get; set; } = [];
}

public class PartidaConsumidaDto
{
    public int PartidaId { get; set; }
    public DateOnly FechaIngreso { get; set; }
    public string? Cosecha { get; set; }
    public string? Lote { get; set; }
    public decimal Kg { get; set; }
    public int DiasAlmacenado { get; set; }
}

public class UltimoControlSiloDto
{
    public DateOnly Fecha { get; set; }
    public decimal HumedadGrano { get; set; }
    public decimal Temperatura { get; set; }
    public string EstadoGrano { get; set; } = string.Empty;
    public bool PresenciaPlagas { get; set; }
}

/// <summary>Kg que todavia pueden despacharse desde un silo o directo de una cosecha.</summary>
public class DisponibilidadDistribucionDto
{
    public string OrigenGrano { get; set; } = string.Empty;
    public string? Producto { get; set; }
    public decimal KgDisponibles { get; set; }
    public string Detalle { get; set; } = string.Empty;
}

public class DistribucionDocumentoDto
{
    public int DistribucionDocumentoId { get; set; }
    public int DistribucionId { get; set; }
    public int? DistribucionCamionId { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public DateTime FechaCarga { get; set; }
    public string? CargadoPor { get; set; }
}

// =====================================================================
// Altas y modificaciones
// =====================================================================

public class CrearDistribucionRequest
{
    public int EmpresaId { get; set; }
    public int? CampaniaId { get; set; }
    public int? CosechaId { get; set; }
    /// <summary>Cosecha | Silo</summary>
    public string OrigenGrano { get; set; } = string.Empty;
    public int? SiloId { get; set; }
    public DateOnly FechaSalida { get; set; }
    public string ResponsableACargo { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
    public List<CamionDistribucionRequest> Camiones { get; set; } = [];
}

public class CamionDistribucionRequest
{
    public int ChoferId { get; set; }
    public int CamionId { get; set; }
    public int DestinoId { get; set; }
    public string CodigoCpe { get; set; } = string.Empty;
    public string? NroTicketBalanza { get; set; }
    public decimal KgDespachados { get; set; }
}

/// <summary>Cabecera editable: la fecha de salida y el origen no cambian (hay egresos asociados).</summary>
public class ActualizarDistribucionRequest
{
    public string ResponsableACargo { get; set; } = string.Empty;
    public string? Observaciones { get; set; }
}

/// <summary>Solo datos logisticos: los kg despachados no se modifican nunca.</summary>
public class ActualizarCamionLogisticaRequest
{
    public int ChoferId { get; set; }
    public int CamionId { get; set; }
    public int DestinoId { get; set; }
    public string CodigoCpe { get; set; } = string.Empty;
    public string? NroTicketBalanza { get; set; }
}

public class RegistrarRecepcionRequest
{
    public DateOnly FechaLlegada { get; set; }
    public decimal KgRecibidos { get; set; }
}

public class ConciliarCamionRequest
{
    public DateOnly FechaLlegada { get; set; }
    public decimal KgRecibidos { get; set; }
    public decimal HumedadDestino { get; set; }
    public decimal MateriasExtranasDestino { get; set; }
    public decimal KgNetosLiquidados { get; set; }
    public string? NroLiquidacion { get; set; }
    public string? Observaciones { get; set; }
}

/// <summary>Resultado del calculo de merma (previsualizacion y conciliacion).</summary>
public class AnalisisMermaDto
{
    public bool ParametrosCompletos { get; set; }
    public string? Advertencia { get; set; }

    public decimal? HumedadBase { get; set; }
    public decimal? ManipuleoPct { get; set; }
    public decimal? ToleranciaMateriasExtranasPct { get; set; }

    public decimal? SecadoPct { get; set; }
    public decimal? MateriasExtranasExcesoPct { get; set; }
    public decimal? MermaEsperadaPct { get; set; }
    public decimal? MermaEsperadaKg { get; set; }

    public decimal DiferenciaBalanzaKg { get; set; }
    public decimal DiferenciaBalanzaPct { get; set; }
    public decimal DescuentoCalidadKg { get; set; }
    public decimal? DescuentoNoJustificadoKg { get; set; }
    public decimal MermaTotalKg { get; set; }
    public decimal MermaTotalPct { get; set; }
    public decimal? MermaNoJustificadaKg { get; set; }
    public decimal? DesvioPp { get; set; }
    public string? NivelDesvio { get; set; }
}

// =====================================================================
// Catalogos
// =====================================================================

public class TransportistaDto
{
    public int TransportistaId { get; set; }
    public int EmpresaId { get; set; }
    public string RazonSocial { get; set; } = string.Empty;
    public string? Cuit { get; set; }
    public string? Telefono { get; set; }
    public bool Activo { get; set; }
}

public class GuardarTransportistaRequest
{
    public int EmpresaId { get; set; }
    public string RazonSocial { get; set; } = string.Empty;
    public string? Cuit { get; set; }
    public string? Telefono { get; set; }
    public bool Activo { get; set; } = true;
}

public class ChoferDto
{
    public int ChoferId { get; set; }
    public int EmpresaId { get; set; }
    public int? TransportistaId { get; set; }
    public string? Transportista { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Apellido { get; set; } = string.Empty;
    public string Dni { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public bool Activo { get; set; }
}

public class GuardarChoferRequest
{
    public int EmpresaId { get; set; }
    public int? TransportistaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Apellido { get; set; } = string.Empty;
    public string Dni { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public bool Activo { get; set; } = true;
}

public class CamionCatalogoDto
{
    public int CamionId { get; set; }
    public int EmpresaId { get; set; }
    public int? TransportistaId { get; set; }
    public string? Transportista { get; set; }
    public string Patente { get; set; } = string.Empty;
    public string Marca { get; set; } = string.Empty;
    public string Modelo { get; set; } = string.Empty;
    public bool Activo { get; set; }
}

public class GuardarCamionRequest
{
    public int EmpresaId { get; set; }
    public int? TransportistaId { get; set; }
    public string Patente { get; set; } = string.Empty;
    public string Marca { get; set; } = string.Empty;
    public string Modelo { get; set; } = string.Empty;
    public bool Activo { get; set; } = true;
}

public class DestinoDistribucionDto
{
    public int DestinoId { get; set; }
    public int EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoDestino { get; set; } = string.Empty;
    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
    public bool Activo { get; set; }
}

public class GuardarDestinoRequest
{
    public int EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string TipoDestino { get; set; } = "Acopiadora";
    public string Pais { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
    public bool Activo { get; set; } = true;
}

// =====================================================================
// Parametros por grano
// =====================================================================

public class GranoParametroDistribucionDto
{
    public int? GranoParametroDistribucionId { get; set; }
    public int EmpresaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    /// <summary>Valor normativo de GranoBasesComercializacion (solo lectura).</summary>
    public decimal? HumedadBase { get; set; }
    public decimal? ManipuleoPct { get; set; }
    public decimal? ToleranciaMateriasExtranasPct { get; set; }
    public decimal DesvioMedioPp { get; set; } = 0.50m;
    public decimal DesvioAltoPp { get; set; } = 1.50m;
    public bool Configurado => GranoParametroDistribucionId.HasValue;
}

public class GuardarGranoParametroDistribucionRequest
{
    public int EmpresaId { get; set; }
    public string Producto { get; set; } = string.Empty;
    public decimal ManipuleoPct { get; set; }
    public decimal ToleranciaMateriasExtranasPct { get; set; }
    public decimal DesvioMedioPp { get; set; } = 0.50m;
    public decimal DesvioAltoPp { get; set; } = 1.50m;
}
