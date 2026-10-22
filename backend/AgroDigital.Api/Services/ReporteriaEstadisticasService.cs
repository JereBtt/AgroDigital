using System.Globalization;
using System.Text;
using System.Text.Json;
using AgroDigital.Api.Repositories;

namespace AgroDigital.Api.Services;

public sealed record FiltrosReporteriaEstadisticas(
    string Modulo, string[]? Campanias, bool Comparar, int? CantidadCampanias, string? Ciclo, string? Cultivo,
    string? Lote, string? Epoca, string? CicloCultivo, string? Variedad,
    string? BaseRinde, string? Operacion, DateOnly? Desde, DateOnly? Hasta);

// Usa las mismas proyecciones y cálculos base que la pantalla de Estadísticas;
// solo envía indicadores y series acotadas al modelo, no los registros agrícolas crudos.
public sealed class ReporteriaEstadisticasService(
    IEstadisticasRepository estadisticas, ReporteriaRepository reporteria)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public async Task<object> ConsultarAsync(int empresaId, int usuarioId, bool esAdmin,
        FiltrosReporteriaEstadisticas filtros, CancellationToken ct)
    {
        if (filtros.Modulo == "general")
        {
            var secciones = new Dictionary<string, object>();
            foreach (var modulo in new[] { "rinde", "siniestros", "productividad", "almacenamiento", "distribucion" })
                secciones[modulo] = await ConsultarAsync(empresaId, usuarioId, esAdmin,
                    filtros with { Modulo = modulo }, ct);
            return new { modulo = "general", secciones };
        }
        if (filtros.Modulo is "almacenamiento" or "distribucion")
        {
            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var desde = filtros.Desde ?? hoy.AddMonths(-6).AddDays(1);
            var hasta = filtros.Hasta ?? hoy;
            var periodo = filtros.Campanias?.FirstOrDefault();
            if (periodo is not null && filtros.Desde is null && filtros.Hasta is null)
            {
                var rango = await reporteria.RangoCampaniaAsync(empresaId, periodo, ct)
                    ?? throw new InvalidOperationException("No se encontró esa campaña en la empresa seleccionada.");
                desde = rango.Desde;
                hasta = rango.Hasta > hoy ? hoy : rango.Hasta;
            }
            if (desde > hasta || desde < hasta.AddMonths(-60))
                throw new InvalidOperationException("El período de Estadísticas debe tener fechas válidas y no superar cinco años.");
            if (filtros.Modulo == "almacenamiento")
            {
                var dato = await estadisticas.ObtenerAlmacenamientoAsync(empresaId, desde, hasta,
                    filtros.Cultivo, usuarioId, esAdmin);
                return new
                {
                    modulo = filtros.Modulo, desde, hasta, cultivo = filtros.Cultivo,
                    alDiaDeHoy = new { dato.StockKg, dato.SilosConGrano, dato.AntiguedadPromedioDias,
                        dato.KgMas180Dias, antiguedadPorGrano = dato.Antiguedad.Take(30) },
                    enPeriodo = new { dato.KgIngresados, dato.KgMerma, dato.MermaPct,
                        dato.ControlesProgramados, dato.ControlesEnTermino, dato.ControlesEnTerminoPct,
                        dato.AtrasoPromedioDias, mermasPorMotivo = dato.Mermas.Take(30),
                        flujoMensual = dato.FlujoMensual.Take(60), controlesPorSilo = dato.ControlesPorSilo.Take(30) },
                    detalleTruncado = dato.Antiguedad.Count > 30 || dato.Mermas.Count > 30
                        || dato.FlujoMensual.Count > 60 || dato.ControlesPorSilo.Count > 30
                };
            }
            else
            {
                var dato = await estadisticas.ObtenerDistribucionAsync(empresaId, desde, hasta,
                    filtros.Cultivo, usuarioId, esAdmin);
                return new
                {
                    modulo = filtros.Modulo, desde, hasta, cultivo = filtros.Cultivo,
                    alDiaDeHoy = new { dato.CamionesRecibidosSinConciliar, dato.CamionesEnTransito },
                    enPeriodo = new { dato.KgDespachados, dato.CantidadCamiones, dato.CantidadDestinos,
                        dato.MermaRealPct, dato.MermaEsperadaPct, dato.DesvioPp, dato.NivelDesvio,
                        dato.KgSinJustificar, dato.KgSinJustificarBalanza, dato.KgSinJustificarCalidad,
                        mermaPorAcopiadora = dato.MermaPorAcopiadora.Take(30),
                        kgPorDestino = dato.KgPorDestino.Take(30),
                        balanzaPorTransportista = dato.BalanzaPorTransportista.Take(30) },
                    detalleTruncado = dato.MermaPorAcopiadora.Count > 30 || dato.KgPorDestino.Count > 30
                        || dato.BalanzaPorTransportista.Count > 30
                };
            }
        }

        if (filtros.Modulo is not ("rinde" or "siniestros" or "productividad"))
            throw new InvalidOperationException("Esa sección de Estadísticas no existe.");
        var json = await estadisticas.ObtenerAgricolasAsync(empresaId, usuarioId, esAdmin);
        var data = JsonSerializer.Deserialize<DatosAgricolas>(json, JsonOptions) ?? new DatosAgricolas();
        var periodos = data.Siembras.Select(x => x.Campania).Concat(data.Cosechas.Select(x => x.Campania))
            .Concat(data.Planes.Select(x => x.Campania)).Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!).Distinct().OrderDescending().ToArray();
        var seleccion = filtros.Campanias is { Length: > 0 }
            ? filtros.Campanias.Where(periodos.Contains).Distinct().Take(5).ToArray()
            : periodos.Take(filtros.Comparar ? Math.Clamp(filtros.CantidadCampanias ?? 3, 2, 5) : 1).ToArray();
        var lotes = data.Lotes.ToDictionary(x => x.Id);
        bool Aplica(Operacion x) => seleccion.Contains(x.Campania)
            && Coincide(x.Ciclo, filtros.Ciclo) && Coincide(x.Grano, filtros.Cultivo)
            && CoincideLote(x.LoteId, filtros.Lote, lotes)
            && Coincide(x.Epoca, filtros.Epoca) && Coincide(x.CicloCultivo, filtros.CicloCultivo)
            && Coincide(x.Variedad, filtros.Variedad);
        var siembras = data.Siembras.Where(Aplica).ToArray();
        var cosechas = data.Cosechas.Where(Aplica).ToArray();
        var contexto = new { modulo = filtros.Modulo, campanias = seleccion, filtros.Ciclo,
            filtros.Cultivo, filtros.Lote, filtros.Epoca, filtros.CicloCultivo, filtros.Variedad,
            sinCampanias = seleccion.Length == 0 };
        return filtros.Modulo switch
        {
            "rinde" => new { contexto, datos = Rinde(cosechas, lotes, filtros.BaseRinde) },
            "siniestros" => new { contexto, datos = Siniestros(siembras, data, lotes) },
            _ => new { contexto, datos = Productividad(siembras, cosechas, data, lotes, filtros, seleccion) }
        };
    }

    private static object Rinde(Operacion[] cosechas, Dictionary<int, Lote> lotes, string? baseRinde)
    {
        var seco = string.Equals(baseRinde, "seco", StringComparison.OrdinalIgnoreCase);
        var finalizadas = cosechas.Where(x => x.Estado == "Finalizado").ToArray();
        var validas = finalizadas.Where(x => x.Ha > 0 && (seco ? x.RindeSeco is not null : x.Kg is not null)).ToArray();
        double Peso(Operacion x) => seco ? (x.RindeSeco ?? 0) * (x.Ha ?? 0) : x.Kg ?? 0;
        var series = validas.GroupBy(x => (x.Campania, x.Grano)).Select(g => new
        {
            campania = g.Key.Campania, cultivo = g.Key.Grano, ha = g.Sum(x => x.Ha ?? 0),
            kgParaRinde = g.Sum(Peso), rindeKgHa = g.Sum(Peso) / g.Sum(x => x.Ha ?? 0),
            cosechas = g.Count(), lotes = g.Select(x => x.LoteId).Distinct().Count()
        }).OrderBy(x => x.campania).ThenBy(x => x.cultivo).ToArray();
        var participacion = finalizadas.Where(x => x.Ha > 0).GroupBy(x => x.Grano).Select(g =>
        {
            var conRinde = g.Where(x => seco ? x.RindeSeco is not null : x.Kg is not null).ToArray();
            var haRinde = conRinde.Sum(x => x.Ha ?? 0);
            return new
            {
                cultivo = g.Key, ha = g.Sum(x => x.Ha ?? 0),
                kgRegistrados = g.Any(x => x.Kg is not null) ? g.Sum(x => x.Kg ?? 0) : (double?)null,
                rindeKgHa = haRinde > 0 ? conRinde.Sum(Peso) / haRinde : (double?)null
            };
        }).OrderByDescending(x => x.ha).ToArray();
        var totalHa = participacion.Sum(x => x.ha);
        var ranking = validas.GroupBy(x => (x.Campania, x.Grano, x.LoteId)).Select(g => new
        {
            campania = g.Key.Campania, cultivo = g.Key.Grano,
            lote = lotes.GetValueOrDefault(g.Key.LoteId)?.Nombre, ha = g.Sum(x => x.Ha ?? 0),
            rindeKgHa = g.Sum(Peso) / g.Sum(x => x.Ha ?? 0)
        }).GroupBy(x => x.cultivo).SelectMany(g => g.OrderByDescending(x => x.rindeKgHa).Take(10)).ToArray();
        var epocas = validas.GroupBy(x => (x.Campania, x.Grano, x.Epoca, x.CicloCultivo, x.Variedad))
            .Select(g => new { campania = g.Key.Campania, cultivo = g.Key.Grano, epoca = g.Key.Epoca,
                cicloCultivo = g.Key.CicloCultivo, variedad = g.Key.Variedad,
                lotes = g.Select(x => x.LoteId).Distinct().Count(), ha = g.Sum(x => x.Ha ?? 0),
                rindeKgHa = g.Sum(Peso) / g.Sum(x => x.Ha ?? 0) }).ToArray();
        var epocasSimples = validas.GroupBy(x => (x.Campania, x.Grano, x.Epoca))
            .Select(g => new { campania = g.Key.Campania, cultivo = g.Key.Grano, epoca = g.Key.Epoca,
                lotes = g.Select(x => x.LoteId).Distinct().Count(), ha = g.Sum(x => x.Ha ?? 0),
                rindeKgHa = g.Sum(Peso) / g.Sum(x => x.Ha ?? 0) }).ToArray();
        return new
        {
            baseRinde = seco ? "seco" : "humedo", cosechasFinalizadas = finalizadas.Length,
            cosechasEnCurso = cosechas.Length - finalizadas.Length,
            excluidasDelRinde = finalizadas.Length - validas.Length,
            kgRegistrados = finalizadas.Where(x => x.Ha > 0 && x.Kg is not null).Sum(x => x.Kg ?? 0),
            haConResultado = finalizadas.Where(x => x.Ha > 0 && x.Kg is not null).Sum(x => x.Ha ?? 0),
            porCampaniaCultivo = series, participacionPorHectareas = participacion.Select(x => new
            {
                x.cultivo, x.ha, porcentaje = totalHa > 0 ? x.ha / totalHa * 100 : 0,
                x.kgRegistrados, x.rindeKgHa
            }), mejoresRindesPorCultivo = ranking, comparativaEpoca = epocasSimples,
            comparativaEpocaCicloVariedad = epocas.Take(60),
            detalleTruncado = epocas.Length > 60
        };
    }

    private static object Siniestros(Operacion[] filtradas, DatosAgricolas data, Dictionary<int, Lote> lotes)
    {
        var unidades = filtradas.GroupBy(Clave).ToArray();
        var todas = data.Siembras.GroupBy(Clave).ToDictionary(g => g.Key, g => g.ToArray());
        var categorias = new Dictionary<string, List<object>>
        {
            ["sinResiembra"] = [], ["conResiembra"] = [], ["perdidaTotal"] = []
        };
        var causas = new Dictionary<string, (string Nombre, int Cantidad)>();
        foreach (var unidad in unidades)
        {
            var cadena = todas[unidad.Key];
            var ids = cadena.Select(x => x.Id).ToHashSet();
            var hechos = data.Siniestros.Where(x => ids.Contains(x.SiembraId))
                .OrderBy(x => x.Fecha).ThenBy(x => x.Id).ToArray();
            var ultima = cadena.MaxBy(x => x.Id)!;
            var perdida = ultima.Deshabilitada && Igual(ultima.MotivoBaja, "Siniestro");
            if (hechos.Length == 0 && !perdida) continue;
            var nombres = hechos.Select(x => x.Siniestro).Where(x => !string.IsNullOrWhiteSpace(x)).DistinctBy(Normalizar).ToList();
            if (perdida && !string.IsNullOrWhiteSpace(ultima.SiniestroBaja))
            {
                nombres.RemoveAll(x => Igual(x, ultima.SiniestroBaja));
                nombres.Add(ultima.SiniestroBaja!);
            }
            foreach (var nombre in nombres)
            {
                var key = Normalizar(nombre);
                causas[key] = (nombre!, causas.GetValueOrDefault(key).Cantidad + 1);
            }
            var cultivos = hechos.Select(x => x.Cultivo ?? cadena.FirstOrDefault(s => s.Id == x.SiembraId)?.Grano)
                .Where(x => !string.IsNullOrWhiteSpace(x)).DistinctBy(Normalizar).ToArray();
            if (cultivos.Length == 0 && perdida) cultivos = [ultima.Grano];
            var categoria = perdida ? "perdidaTotal" : cadena.Any(x => x.Tipo == "Resiembra") ? "conResiembra" : "sinResiembra";
            categorias[categoria].Add(new { lote = lotes.GetValueOrDefault(ultima.LoteId)?.Nombre,
                ultima.Campania, ultima.Ciclo, cultivos, siniestros = nombres });
        }
        var afectados = categorias.Sum(x => x.Value.Count);
        return new
        {
            lotesEvaluados = unidades.Length, lotesAfectados = afectados,
            indiceSiniestralidadPct = unidades.Length > 0 ? afectados * 100.0 / unidades.Length : (double?)null,
            incidenciaPorSiniestro = causas.Values.OrderByDescending(x => x.Cantidad).Select(x => new
            {
                siniestro = x.Nombre, unidades = x.Cantidad,
                porcentaje = unidades.Length > 0 ? x.Cantidad * 100.0 / unidades.Length : 0
            }), categorias
        };
    }

    private static object Productividad(Operacion[] siembras, Operacion[] cosechas, DatosAgricolas data,
        Dictionary<int, Lote> lotes, FiltrosReporteriaEstadisticas filtros, string[] seleccion)
    {
        var cosecha = Igual(filtros.Operacion, "cosecha");
        var registros = cosecha ? cosechas : siembras;
        var terminadas = registros.Where(x => x.Estado == "Finalizado" && x.Ha > 0 && x.HaHora > 0).ToArray();
        var horas = terminadas.Sum(x => x.Ha!.Value / x.HaHora!.Value);
        var conFechas = registros.Where(x => x.Estado == "Finalizado" && DiasDesvio(x) is not null).ToArray();
        var trazabilidad = siembras.Select(x => (Operacion: x, Tipo: x.Tipo ?? "Siembra"))
            .Concat(cosechas.Select(x => (Operacion: x, Tipo: "Cosecha")))
            .OrderBy(x => x.Operacion.LoteId).ThenBy(x => x.Operacion.Inicio).ToArray();
        var eventos = new SortedDictionary<string, (int Esperado, int Real)>();
        foreach (var (x, _) in trazabilidad)
        {
            if (!Dia(x.FinTentativo, out var tentativa)) continue;
            var actual = eventos.GetValueOrDefault(tentativa);
            eventos[tentativa] = (actual.Esperado + 1, actual.Real);
            if (x.Estado == "Finalizado" && Dia(x.FinReal, out var real))
            {
                actual = eventos.GetValueOrDefault(real);
                eventos[real] = (actual.Esperado, actual.Real + 1);
            }
        }
        var esperado = 0; var realAcumulado = 0;
        var flujo = eventos.Select(x => { esperado += x.Value.Esperado; realAcumulado += x.Value.Real;
            return new { fecha = x.Key, esperado, real = realAcumulado }; }).ToArray();

        var planes = data.Planes.Where(x => seleccion.Contains(x.Campania) && Coincide(x.Ciclo, filtros.Ciclo)
            && Coincide(x.Grano, filtros.Cultivo) && CoincideLote(x.LoteId, filtros.Lote, lotes)).ToArray();
        var incluyePlanes = filtros.Epoca is null && filtros.CicloCultivo is null && filtros.Variedad is null;
        var claves = siembras.Select(Clave).Concat(incluyePlanes ? planes.Select(Clave) : []).Distinct().ToArray();
        var superficies = claves.Select(k =>
        {
            var ultima = siembras.Where(x => Clave(x) == k).MaxBy(x => x.Id);
            var lote = lotes.GetValueOrDefault(k.LoteId);
            var total = lote?.Superficie ?? lote?.Cultivables ?? 0;
            var ha = Math.Max(0, ultima?.Ha ?? 0);
            return new { k.Campania, k.Ciclo, lote = lote?.Nombre, loteId = k.LoteId,
                zona = lote?.Zona, provincia = lote?.Provincia, totalHa = total,
                trabajadasHa = Math.Min(total, ha), sinTrabajarHa = Math.Max(0, total - ha),
                superficieExcedida = ha > total + 0.05 };
        }).ToArray();
        var ranking = terminadas.GroupBy(x => (x.LoteId, x.Campania)).Select(g =>
        {
            var h = g.Sum(x => x.Ha!.Value / x.HaHora!.Value);
            return new { lote = lotes.GetValueOrDefault(g.Key.LoteId)?.Nombre,
                campania = g.Key.Campania, ha = g.Sum(x => x.Ha ?? 0),
                operaciones = g.Count(), haHora = h > 0 ? g.Sum(x => x.Ha ?? 0) / h : 0 };
        }).OrderByDescending(x => x.haHora).ToArray();
        var evolucion = terminadas.GroupBy(x => x.Campania).Select(g => new
        {
            campania = g.Key, ha = g.Sum(x => x.Ha ?? 0), operaciones = g.Count(),
            haHora = g.Sum(x => x.Ha ?? 0) / g.Sum(x => x.Ha!.Value / x.HaHora!.Value)
        }).OrderBy(x => x.campania).ToArray();
        var zonas = superficies.Where(x => x.trabajadasHa > 0).GroupBy(x => (x.provincia, x.zona))
            .Select(g => new { provincia = g.Key.provincia, zona = g.Key.zona,
                lotes = g.Select(x => x.loteId).Distinct().Count(), ha = g.Sum(x => x.trabajadasHa) })
            .OrderByDescending(x => x.lotes).ToArray();
        var mapa = superficies.Where(x => x.trabajadasHa > 0).GroupBy(x => x.loteId)
            .Select(g => new { lote = lotes.GetValueOrDefault(g.Key)?.Nombre,
                latitud = lotes.GetValueOrDefault(g.Key)?.Latitud,
                longitud = lotes.GetValueOrDefault(g.Key)?.Longitud,
                ha = g.Sum(x => x.trabajadasHa) }).ToArray();
        return new
        {
            operacion = cosecha ? "cosecha" : "siembra_y_resiembra",
            productividadPonderadaHaHora = horas > 0 ? terminadas.Sum(x => x.Ha ?? 0) / horas : (double?)null,
            haFinalizadas = terminadas.Sum(x => x.Ha ?? 0), horasEstimadas = horas,
            operacionesFinalizadasConProductividad = terminadas.Length,
            cumplimiento = new { finalizadasConAmbasFechas = conFechas.Length,
                enPlazo = conFechas.Count(x => DiasDesvio(x) <= 0),
                porcentaje = conFechas.Length > 0 ? conFechas.Count(x => DiasDesvio(x) <= 0) * 100.0 / conFechas.Length : (double?)null },
            superficieCultivadaHa = superficies.Sum(x => x.trabajadasHa),
            flujoEsperadoReal = flujo.Take(80), flujoTruncado = flujo.Length > 80,
            detalleFechas = trazabilidad.Take(60).Select(x => new { lote = lotes.GetValueOrDefault(x.Operacion.LoteId)?.Nombre,
                x.Operacion.Campania, x.Operacion.Ciclo, operacion = x.Tipo,
                x.Operacion.Nombre, cultivo = x.Operacion.Grano, x.Operacion.Inicio,
                x.Operacion.FinTentativo, x.Operacion.FinReal, desvioDias = DiasDesvio(x.Operacion),
                motivoDesvio = x.Operacion.MotivoDesvio, x.Operacion.Estado, x.Operacion.Deshabilitada }),
            detalleFechasTruncado = trazabilidad.Length > 60,
            mayorSuperficieSinTrabajar = superficies.Where(x => x.sinTrabajarHa >= 0.05)
                .OrderByDescending(x => x.sinTrabajarHa).Take(10),
            evolucionProductividad = evolucion, lotesMayorProductividad = ranking.Take(10),
            lotesMenorProductividad = ranking.Reverse().Take(10), zonas,
            mapaCalor = mapa.Take(60), mapaTruncado = mapa.Length > 60,
            lotesSinCoordenadas = mapa.Count(x => x.latitud is null || x.longitud is null)
        };
    }

    private static (int LoteId, string Campania, string Ciclo) Clave(Operacion x) =>
        (x.LoteId, x.Campania ?? "", x.Ciclo ?? "Sin dato");
    private static (int LoteId, string Campania, string Ciclo) Clave(Plan x) =>
        (x.LoteId, x.Campania ?? "", x.Ciclo ?? "Sin dato");
    private static bool Coincide(string? valor, string? filtro) => filtro is null || Igual(valor, filtro);
    private static bool CoincideLote(int id, string? filtro, Dictionary<int, Lote> lotes) =>
        filtro is null || filtro == id.ToString(CultureInfo.InvariantCulture) || Igual(lotes.GetValueOrDefault(id)?.Nombre, filtro);
    private static bool Igual(string? x, string? y) => Normalizar(x) == Normalizar(y);
    private static string Normalizar(string? value) => new string((value ?? "").Normalize(NormalizationForm.FormD)
        .Where(x => CharUnicodeInfo.GetUnicodeCategory(x) != UnicodeCategory.NonSpacingMark).ToArray())
        .Trim().ToLowerInvariant();
    private static bool Dia(string? value, out string dia)
    {
        dia = (value ?? "").Length >= 10 ? value![..10] : "";
        return DateOnly.TryParseExact(dia, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }
    private static int? DiasDesvio(Operacion x) =>
        Dia(x.FinTentativo, out var tentativa) && Dia(x.FinReal, out var real)
            ? DateOnly.ParseExact(real, "yyyy-MM-dd", CultureInfo.InvariantCulture).DayNumber
              - DateOnly.ParseExact(tentativa, "yyyy-MM-dd", CultureInfo.InvariantCulture).DayNumber
            : null;

    private sealed class DatosAgricolas
    {
        public List<Lote> Lotes { get; set; } = [];
        public List<Operacion> Siembras { get; set; } = [];
        public List<Operacion> Cosechas { get; set; } = [];
        public List<EventoSiniestro> Siniestros { get; set; } = [];
        public List<Plan> Planes { get; set; } = [];
    }
    private sealed class Lote
    {
        public int Id { get; set; }
        public string? Nombre { get; set; }
        public string? Zona { get; set; }
        public string? Provincia { get; set; }
        public double? Superficie { get; set; }
        public double? Cultivables { get; set; }
        public double? Latitud { get; set; }
        public double? Longitud { get; set; }
    }
    private sealed class Operacion
    {
        public int Id { get; set; }
        public int LoteId { get; set; }
        public string? Nombre { get; set; }
        public string? Campania { get; set; }
        public string? Ciclo { get; set; }
        public string? Grano { get; set; }
        public string? Epoca { get; set; }
        public string? CicloCultivo { get; set; }
        public string? Variedad { get; set; }
        public string? Tipo { get; set; }
        public double? Ha { get; set; }
        public double? Kg { get; set; }
        public double? RindeSeco { get; set; }
        public double? HaHora { get; set; }
        public string? Inicio { get; set; }
        public string? FinTentativo { get; set; }
        public string? FinReal { get; set; }
        public string? MotivoDesvio { get; set; }
        public string? Estado { get; set; }
        public bool Deshabilitada { get; set; }
        public string? MotivoBaja { get; set; }
        public string? SiniestroBaja { get; set; }
    }
    private sealed class EventoSiniestro
    {
        public int Id { get; set; }
        public int SiembraId { get; set; }
        public string? Fecha { get; set; }
        public string? Siniestro { get; set; }
        public string? Cultivo { get; set; }
    }
    private sealed class Plan
    {
        public int LoteId { get; set; }
        public string? Campania { get; set; }
        public string? Ciclo { get; set; }
        public string? Grano { get; set; }
    }
}
