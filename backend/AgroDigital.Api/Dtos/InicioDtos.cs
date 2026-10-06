namespace AgroDigital.Api.Dtos;

// =====================================================================
// Pantalla Principal (Inicio) - solo lectura
// =====================================================================

public static class EstadosInicio
{
    /// <summary>La empresa todavia no tiene lotes: se muestra la bienvenida.</summary>
    public const string SinLotes = "SinLotes";

    /// <summary>Hay lotes pero ninguna campania en curso: se muestran silos y un aviso.</summary>
    public const string SinCampania = "SinCampania";

    /// <summary>Hay una campania en curso (o elegida): se muestra el inicio completo.</summary>
    public const string ConCampania = "ConCampania";
}

public class InicioResumenDto
{
    /// <summary>SinLotes | SinCampania | ConCampania (ver EstadosInicio).</summary>
    public string Estado { get; set; } = EstadosInicio.SinLotes;

    public string Rol { get; set; } = string.Empty;

    /// <summary>KPIs y rindes: solo Gerente y Encargado (Manual, seccion Roles).</summary>
    public bool MostrarIndicadores { get; set; }

    /// <summary>Muestra el boton "Registrar Lote" en la bienvenida (Encargado).</summary>
    public bool PuedeRegistrarLotes { get; set; }

    public InicioCampaniaDto? Campania { get; set; }

    /// <summary>Null cuando el rol no puede ver indicadores agregados.</summary>
    public InicioIndicadoresDto? Indicadores { get; set; }

    public IReadOnlyList<InicioEtapaDto> Etapas { get; set; } = [];
    public IReadOnlyList<InicioCultivoDto> Cultivos { get; set; } = [];
    public IReadOnlyList<InicioSiloDto> Silos { get; set; } = [];
    public IReadOnlyList<InicioLoteDto> Lotes { get; set; } = [];

    /// <summary>Conteos para los filtros rapidos de la tabla de lotes.</summary>
    public int LotesConAlertas { get; set; }
    public int LotesListosParaFinalizar { get; set; }
}

public class InicioCampaniaDto
{
    public int CampaniaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public DateOnly FechaInicio { get; set; }
    public DateOnly FechaFin { get; set; }
}

public class InicioIndicadoresDto
{
    public decimal SuperficieHa { get; set; }
    public int CantidadLotes { get; set; }
    public int CantidadCultivos { get; set; }
    public decimal SembradoHa { get; set; }
    public decimal? SembradoPct { get; set; }
    public decimal CosechadoHa { get; set; }
    public decimal? CosechadoPct { get; set; }
    public decimal StockSilosKg { get; set; }
    public decimal CapacidadSilosKg { get; set; }
    public decimal? OcupacionSilosPct { get; set; }
    public int CantidadSilos { get; set; }
}

public class InicioEtapaDto
{
    /// <summary>0 Sin iniciar, 1 Siembra, 2 Cosecha, 3 Destino del grano, 4 Finalizado.</summary>
    public int Codigo { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int Lotes { get; set; }
    public decimal Hectareas { get; set; }
    public decimal? Porcentaje { get; set; }
}

public class InicioCultivoDto
{
    public string Producto { get; set; } = string.Empty;
    public int Lotes { get; set; }
    public decimal Hectareas { get; set; }
    public decimal SembradoHa { get; set; }
    public decimal CosechadoHa { get; set; }
    public int LotesCosechados { get; set; }

    /// <summary>Promedio ponderado por superficie. Null si no hay cosechas o el rol no puede verlo.</summary>
    public decimal? RindePromedioKgHa { get; set; }
}

public class InicioSiloDto
{
    public int SiloId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Producto { get; set; }
    public string TipoSilo { get; set; } = string.Empty;
    public decimal CapacidadKg { get; set; }
    public decimal StockKg { get; set; }
    public decimal OcupacionPct { get; set; }

    /// <summary>Normal | Atención | Crítico | Sin controles | Vacío.</summary>
    public string EstadoControl { get; set; } = string.Empty;
    public DateOnly? FechaProximoControl { get; set; }
    public bool ControlVencido { get; set; }
}

public class InicioLoteDto
{
    public int CampaniaCombinacionId { get; set; }
    public int LoteId { get; set; }
    public string LoteNombre { get; set; } = string.Empty;
    public string? LoteCiudad { get; set; }
    public string Producto { get; set; } = string.Empty;
    public decimal Hectareas { get; set; }

    public int EtapaCodigo { get; set; }
    public string EtapaNombre { get; set; } = string.Empty;

    public DateOnly? UltimoMovimientoFecha { get; set; }
    public string? UltimoMovimientoDescripcion { get; set; }

    /// <summary>Atencion | Info | null (sin novedades).</summary>
    public string? AtencionNivel { get; set; }
    public string AtencionTexto { get; set; } = "Sin novedades";
    public bool ListoParaFinalizar { get; set; }

    // Referencias para el boton "Ver"
    public int? SiembraId { get; set; }
    public int? CosechaId { get; set; }
}

// =====================================================================
// Agenda
// =====================================================================

public static class GruposAgenda
{
    public const string Vencidos = "Vencidos";
    public const string EnTransito = "EnTransito";
    public const string Proximos = "Proximos";
}

public class InicioAgendaDto
{
    public DateOnly Hoy { get; set; }
    public DateOnly Hasta { get; set; }
    public IReadOnlyList<InicioAgendaEventoDto> Eventos { get; set; } = [];
}

public class InicioAgendaEventoDto
{
    public DateOnly Fecha { get; set; }

    /// <summary>Silo | Siembra | Cosecha | Distribucion.</summary>
    public string Tipo { get; set; } = string.Empty;

    /// <summary>ControlSilo | FinSiembra | FinCosecha | InicioPlanificado | EnTransito.</summary>
    public string Subtipo { get; set; } = string.Empty;

    public string Titulo { get; set; } = string.Empty;
    public string Detalle { get; set; } = string.Empty;

    /// <summary>Modulo del front al que lleva "Ver" (silos, siembras, cosechas, campanias, distribucion).</summary>
    public string Modulo { get; set; } = string.Empty;
    public int ReferenciaId { get; set; }

    /// <summary>Vencidos | EnTransito | Proximos (ver GruposAgenda).</summary>
    public string Grupo { get; set; } = GruposAgenda.Proximos;

    /// <summary>Dias desde hoy (negativo = vencido).</summary>
    public int DiasDesdeHoy { get; set; }
}
