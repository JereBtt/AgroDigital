using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public interface IInicioRepository
{
    Task<InicioResumenDto> ObtenerResumenAsync(int empresaId, int? campaniaId, int usuarioId, bool esAdmin);

    Task<InicioAgendaDto> ObtenerAgendaAsync(int empresaId, int? campaniaId, int dias, int usuarioId, bool esAdmin);
}

/*
    Pantalla Principal (Inicio) y Agenda. Solo lectura.
    Lee las vistas dbo.vw_InicioCombinaciones y dbo.vw_InicioAgenda
    (database/scripts/24_pantalla_principal.sql) y la tabla de Silos.

    Acceso: cualquier usuario activo de la empresa. Los indicadores agregados
    (KPIs y rindes) solo se devuelven a Gerente y Encargado.

    Estados del resumen:
      - SinLotes:    la empresa no tiene lotes activos (bienvenida).
      - SinCampania: hay lotes pero ninguna campania con combinaciones sin finalizar.
      - ConCampania: hay campania en curso, o el usuario eligio una.

    Columna "Atencion" de la tabla de lotes (se informa la primera que aplica):
      1. Cosecha en curso con ultima tirada de aros de severidad Alta.
      2. Siniestro o incidencia con perdida economica en los ultimos 30 dias.
      3. Siembra en curso sin seguimiento hace mas de 15 dias.
      4. Combinacion sin siembra con fecha de inicio planificada ya pasada.
      5. Lista para finalizar (nivel Info).
*/
public class InicioRepository(IConfiguration configuration) : IInicioRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const int DiasSinSeguimiento = 15;
    private const int DiasPerdidaReciente = 30;
    private const int DiasVencidosAgenda = 60;

    private static readonly string[] NombresEtapa =
        ["Sin iniciar", "Siembra", "Cosecha", "Destino del grano", "Finalizado"];

    // =====================================================================
    // Resumen
    // =====================================================================

    public async Task<InicioResumenDto> ObtenerResumenAsync(int empresaId, int? campaniaId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var rol = esAdmin
            ? "Admin"
            : await DistribucionAcceso.ObtenerRolAsync(connection, null, usuarioId, empresaId)
              ?? throw new KeyNotFoundException("La empresa indicada no existe o no pertenece a tus empresas.");

        var resultado = new InicioResumenDto
        {
            Rol = rol,
            MostrarIndicadores = esAdmin || DistribucionAcceso.RolesIndicadoresAgregados.Contains(rol),
            PuedeRegistrarLotes = esAdmin || rol == "Encargado",
        };

        var hoy = DateOnly.FromDateTime(DateTime.Today);

        if (!await TieneLotesAsync(connection, empresaId))
        {
            resultado.Estado = EstadosInicio.SinLotes;
            return resultado;
        }

        // Los silos no dependen de la campania: se muestran tambien sin campania en curso.
        var silos = await ObtenerSilosAsync(connection, empresaId, hoy);
        resultado.Silos = silos;

        var campania = await ObtenerCampaniaAsync(connection, empresaId, campaniaId);
        if (campania is null)
        {
            resultado.Estado = EstadosInicio.SinCampania;
            return resultado;
        }

        resultado.Estado = EstadosInicio.ConCampania;
        resultado.Campania = campania;

        var combinaciones = await ObtenerCombinacionesAsync(connection, empresaId, campania.CampaniaId);
        var superficie = combinaciones.Sum(c => c.Hectareas);

        // ---- Avance por etapa ----
        resultado.Etapas = Enumerable.Range(0, NombresEtapa.Length)
            .Select(codigo =>
            {
                var enEtapa = combinaciones.Where(c => c.EtapaCodigo == codigo).ToList();
                var ha = enEtapa.Sum(c => c.Hectareas);
                return new InicioEtapaDto
                {
                    Codigo = codigo,
                    Nombre = NombresEtapa[codigo],
                    Lotes = enEtapa.Count,
                    Hectareas = Math.Round(ha, 2),
                    Porcentaje = Porcentaje(ha, superficie),
                };
            })
            .ToList();

        // ---- Desglose por cultivo ----
        resultado.Cultivos = combinaciones
            .GroupBy(c => c.Producto)
            .OrderByDescending(g => g.Sum(c => c.Hectareas))
            .Select(g => new InicioCultivoDto
            {
                Producto = g.Key,
                Lotes = g.Count(),
                Hectareas = Math.Round(g.Sum(c => c.Hectareas), 2),
                SembradoHa = Math.Round(g.Sum(HaSembradas), 2),
                CosechadoHa = Math.Round(g.Sum(HaCosechadas), 2),
                LotesCosechados = g.Count(EstaCosechada),
                RindePromedioKgHa = resultado.MostrarIndicadores ? RindePonderado(g) : null,
            })
            .ToList();

        // ---- KPIs (solo Gerente / Encargado) ----
        if (resultado.MostrarIndicadores)
        {
            var sembrado = combinaciones.Sum(HaSembradas);
            var cosechado = combinaciones.Sum(HaCosechadas);
            var stock = silos.Sum(s => s.StockKg);
            var capacidad = silos.Sum(s => s.CapacidadKg);

            resultado.Indicadores = new InicioIndicadoresDto
            {
                SuperficieHa = Math.Round(superficie, 2),
                CantidadLotes = combinaciones.Select(c => c.LoteId).Distinct().Count(),
                CantidadCultivos = combinaciones.Select(c => c.Producto).Distinct().Count(),
                SembradoHa = Math.Round(sembrado, 2),
                SembradoPct = Porcentaje(sembrado, superficie),
                CosechadoHa = Math.Round(cosechado, 2),
                CosechadoPct = Porcentaje(cosechado, superficie),
                StockSilosKg = stock,
                CapacidadSilosKg = capacidad,
                OcupacionSilosPct = Porcentaje(stock, capacidad),
                CantidadSilos = silos.Count,
            };
        }

        // ---- Tabla de lotes (ordenada por prioridad) ----
        var lotes = combinaciones
            .Select(c => ArmarLote(c, hoy))
            .OrderBy(l => l.AtencionNivel == "Atencion" ? 0 : l.AtencionNivel == "Info" ? 1 : 2)
            .ThenBy(l => l.EtapaCodigo == 4 ? 1 : 0)
            .ThenByDescending(l => l.UltimoMovimientoFecha)
            .ThenBy(l => l.LoteNombre)
            .ToList();

        resultado.Lotes = lotes;
        resultado.LotesConAlertas = lotes.Count(l => l.AtencionNivel == "Atencion");
        resultado.LotesListosParaFinalizar = lotes.Count(l => l.ListoParaFinalizar);

        return resultado;
    }

    private static async Task<bool> TieneLotesAsync(SqlConnection connection, int empresaId)
    {
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Lotes WHERE EmpresaId = @EmpresaId AND Activo = 1) THEN 1 ELSE 0 END;";
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        return Convert.ToInt32(await command.ExecuteScalarAsync()) == 1;
    }

    /// <summary>
    /// Con campaniaId: esa campania (debe ser de la empresa, si no 404).
    /// Sin campaniaId: la mas reciente que tenga combinaciones sin finalizar.
    /// </summary>
    private static async Task<InicioCampaniaDto?> ObtenerCampaniaAsync(SqlConnection connection, int empresaId, int? campaniaId)
    {
        var sql = campaniaId is not null
            ? """
              SELECT CampaniaId, Nombre, FechaInicio, FechaFin
              FROM dbo.Campanias
              WHERE CampaniaId = @CampaniaId AND EmpresaId = @EmpresaId;
              """
            : """
              SELECT TOP (1) c.CampaniaId, c.Nombre, c.FechaInicio, c.FechaFin
              FROM dbo.Campanias AS c
              WHERE c.EmpresaId = @EmpresaId
                AND EXISTS (
                    SELECT 1 FROM dbo.CampaniaCombinaciones AS cc
                    WHERE cc.CampaniaId = c.CampaniaId AND cc.Estado <> N'Finalizado')
              ORDER BY c.FechaInicio DESC, c.CampaniaId DESC;
              """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);

        await using var r = await command.ExecuteReaderAsync();
        if (!await r.ReadAsync())
        {
            if (campaniaId is not null)
            {
                throw new KeyNotFoundException("La campaña indicada no existe o no pertenece a la empresa.");
            }
            return null;
        }

        return new InicioCampaniaDto
        {
            CampaniaId = r.GetInt32(0),
            Nombre = r.GetString(1),
            FechaInicio = DateOnly.FromDateTime(r.GetDateTime(2)),
            FechaFin = DateOnly.FromDateTime(r.GetDateTime(3)),
        };
    }

    private static async Task<List<InicioSiloDto>> ObtenerSilosAsync(SqlConnection connection, int empresaId, DateOnly hoy)
    {
        const string sql = """
            SELECT s.SiloId, s.Nombre, s.Producto, s.TipoSilo, s.CapacidadMax, s.CantidadGranoAlmacenado,
                   uc.Resultado, uc.FechaProximoControl
            FROM dbo.Silos AS s
            OUTER APPLY (
                SELECT TOP (1) sc.Resultado, sc.FechaProximoControl
                FROM dbo.SiloControles AS sc
                WHERE sc.SiloId = s.SiloId
                ORDER BY sc.Fecha DESC, sc.SiloControlId DESC
            ) AS uc
            WHERE s.EmpresaId = @EmpresaId
              AND s.Activo = 1
              AND s.EstadoOperativo <> N'Dado de baja'
            ORDER BY s.Nombre;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);

        var silos = new List<InicioSiloDto>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var capacidad = r.GetDecimal(r.GetOrdinal("CapacidadMax"));
            var stock = r.GetDecimal(r.GetOrdinal("CantidadGranoAlmacenado"));
            var resultadoControl = DistribucionAcceso.StrN(r, "Resultado");
            var proximo = DistribucionAcceso.FechaN(r, "FechaProximoControl");
            var tieneGrano = stock > 0;

            silos.Add(new InicioSiloDto
            {
                SiloId = r.GetInt32(r.GetOrdinal("SiloId")),
                Nombre = r.GetString(r.GetOrdinal("Nombre")),
                Producto = DistribucionAcceso.StrN(r, "Producto"),
                TipoSilo = r.GetString(r.GetOrdinal("TipoSilo")) == "Bolson" ? "Bolsón" : "Chapa",
                CapacidadKg = capacidad,
                StockKg = stock,
                OcupacionPct = capacidad > 0 ? Math.Round(stock * 100m / capacidad, 1) : 0,
                EstadoControl = !tieneGrano ? "Vacío" : resultadoControl switch
                {
                    "Critico" => "Crítico",
                    "Atencion" => "Atención",
                    "Normal" => "Normal",
                    _ => "Sin controles",
                },
                FechaProximoControl = tieneGrano ? proximo : null,
                ControlVencido = tieneGrano && proximo is not null && proximo < hoy,
            });
        }

        // Primero los que requieren atencion.
        return silos
            .OrderBy(s => s.EstadoControl switch { "Crítico" => 0, "Atención" => 1, _ => s.ControlVencido ? 2 : 3 })
            .ThenBy(s => s.Nombre)
            .ToList();
    }

    private static async Task<List<Combinacion>> ObtenerCombinacionesAsync(SqlConnection connection, int empresaId, int campaniaId)
    {
        const string sql = """
            SELECT CampaniaCombinacionId, LoteId, LoteNombre, LoteCiudad, Hectareas, Producto, FechaInicio, Estado,
                   SiembraId, SiembraEstado, SiembraFechaInicio, SiembraHectareas,
                   CosechaId, CosechaEstado, CosechaHectareas, CosechaKg, RindeKgHa,
                   UltimoSeguimientoFecha, UltimaPerdidaFecha, UltimaPerdidaMotivo,
                   UltimaTiradaSeveridad, UltimaTiradaPerdidaKgHa,
                   EtapaCodigo, ListoParaFinalizar, UltimoMovimientoFecha, UltimoMovimientoDescripcion
            FROM dbo.vw_InicioCombinaciones
            WHERE EmpresaId = @EmpresaId AND CampaniaId = @CampaniaId;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@CampaniaId", campaniaId);

        var lista = new List<Combinacion>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            lista.Add(new Combinacion(
                CampaniaCombinacionId: r.GetInt32(r.GetOrdinal("CampaniaCombinacionId")),
                LoteId: r.GetInt32(r.GetOrdinal("LoteId")),
                LoteNombre: r.GetString(r.GetOrdinal("LoteNombre")),
                LoteCiudad: DistribucionAcceso.StrN(r, "LoteCiudad"),
                Hectareas: r.GetDecimal(r.GetOrdinal("Hectareas")),
                Producto: r.GetString(r.GetOrdinal("Producto")),
                FechaInicio: DateOnly.FromDateTime(r.GetDateTime(r.GetOrdinal("FechaInicio"))),
                SiembraId: DistribucionAcceso.IntN(r, "SiembraId"),
                SiembraEstado: DistribucionAcceso.StrN(r, "SiembraEstado"),
                SiembraFechaInicio: DistribucionAcceso.FechaN(r, "SiembraFechaInicio"),
                SiembraHectareas: DistribucionAcceso.DecN(r, "SiembraHectareas"),
                CosechaId: DistribucionAcceso.IntN(r, "CosechaId"),
                CosechaEstado: DistribucionAcceso.StrN(r, "CosechaEstado"),
                CosechaHectareas: DistribucionAcceso.DecN(r, "CosechaHectareas"),
                CosechaKg: DistribucionAcceso.DecN(r, "CosechaKg"),
                RindeKgHa: DistribucionAcceso.DecN(r, "RindeKgHa"),
                UltimoSeguimientoFecha: DistribucionAcceso.FechaN(r, "UltimoSeguimientoFecha"),
                UltimaPerdidaFecha: DistribucionAcceso.FechaN(r, "UltimaPerdidaFecha"),
                UltimaPerdidaMotivo: DistribucionAcceso.StrN(r, "UltimaPerdidaMotivo"),
                UltimaTiradaSeveridad: DistribucionAcceso.StrN(r, "UltimaTiradaSeveridad"),
                UltimaTiradaPerdidaKgHa: DistribucionAcceso.DecN(r, "UltimaTiradaPerdidaKgHa"),
                EtapaCodigo: r.GetByte(r.GetOrdinal("EtapaCodigo")),
                ListoParaFinalizar: r.GetBoolean(r.GetOrdinal("ListoParaFinalizar")),
                UltimoMovimientoFecha: DistribucionAcceso.FechaN(r, "UltimoMovimientoFecha"),
                UltimoMovimientoDescripcion: DistribucionAcceso.StrN(r, "UltimoMovimientoDescripcion")));
        }

        return lista;
    }

    private static InicioLoteDto ArmarLote(Combinacion c, DateOnly hoy)
    {
        var lote = new InicioLoteDto
        {
            CampaniaCombinacionId = c.CampaniaCombinacionId,
            LoteId = c.LoteId,
            LoteNombre = c.LoteNombre,
            LoteCiudad = c.LoteCiudad,
            Producto = c.Producto,
            Hectareas = c.Hectareas,
            EtapaCodigo = c.EtapaCodigo,
            EtapaNombre = NombresEtapa[c.EtapaCodigo],
            UltimoMovimientoFecha = c.UltimoMovimientoFecha,
            UltimoMovimientoDescripcion = c.UltimoMovimientoDescripcion
                ?? (c.EtapaCodigo == 0 ? $"Inicio planificado {c.FechaInicio:dd/MM/yyyy}" : null),
            ListoParaFinalizar = c.ListoParaFinalizar,
            SiembraId = c.SiembraId,
            CosechaId = c.CosechaId,
        };

        if (c.EtapaCodigo == 4)
        {
            lote.AtencionTexto = "Cerrado";
            return lote;
        }

        if (c.EtapaCodigo == 2 && c.CosechaEstado != "Finalizado" && c.UltimaTiradaSeveridad == "Alta")
        {
            lote.AtencionNivel = "Atencion";
            lote.AtencionTexto = c.UltimaTiradaPerdidaKgHa is { } kg
                ? $"Pérdida alta en cosecha ({kg:0} kg/ha)"
                : "Pérdida alta en cosecha";
            return lote;
        }

        if (c.UltimaPerdidaFecha is { } fechaPerdida && fechaPerdida >= hoy.AddDays(-DiasPerdidaReciente))
        {
            lote.AtencionNivel = "Atencion";
            lote.AtencionTexto = $"{c.UltimaPerdidaMotivo ?? "Siniestro"} con pérdida económica";
            return lote;
        }

        if (c.EtapaCodigo == 1 && c.SiembraEstado != "Finalizado")
        {
            var referencia = c.UltimoSeguimientoFecha ?? c.SiembraFechaInicio;
            if (referencia is { } fecha)
            {
                var dias = hoy.DayNumber - fecha.DayNumber;
                if (dias > DiasSinSeguimiento)
                {
                    lote.AtencionNivel = "Atencion";
                    lote.AtencionTexto = c.UltimoSeguimientoFecha is null
                        ? $"Sin seguimientos desde la siembra ({dias} días)"
                        : $"Sin seguimiento hace {dias} días";
                    return lote;
                }
            }
        }

        if (c.EtapaCodigo == 0 && c.FechaInicio < hoy)
        {
            lote.AtencionNivel = "Atencion";
            lote.AtencionTexto = $"Siembra atrasada (planificada {c.FechaInicio:dd/MM})";
            return lote;
        }

        if (c.ListoParaFinalizar)
        {
            lote.AtencionNivel = "Info";
            lote.AtencionTexto = "Listo para finalizar";
        }

        return lote;
    }

    // ---- Calculos de superficie y rinde ----

    private static decimal HaSembradas(Combinacion c) =>
        c.EtapaCodigo >= 1 ? Math.Min(c.SiembraHectareas ?? c.Hectareas, c.Hectareas) : 0;

    private static bool EstaCosechada(Combinacion c) =>
        c.CosechaId is not null && (c.CosechaEstado == "Finalizado" || c.EtapaCodigo >= 3);

    private static decimal HaCosechadas(Combinacion c) =>
        EstaCosechada(c) ? Math.Min(c.CosechaHectareas ?? c.Hectareas, c.Hectareas) : 0;

    /// <summary>Rinde ponderado por superficie: kg totales / ha totales de las cosechas cerradas.</summary>
    private static decimal? RindePonderado(IEnumerable<Combinacion> grupo)
    {
        var cosechadas = grupo.Where(EstaCosechada).ToList();
        var conDatos = cosechadas.Where(c => c.CosechaKg > 0 && c.CosechaHectareas > 0).ToList();

        if (conDatos.Count > 0)
        {
            return Math.Round(conDatos.Sum(c => c.CosechaKg!.Value) / conDatos.Sum(c => c.CosechaHectareas!.Value), 0);
        }

        var rindes = cosechadas.Where(c => c.RindeKgHa > 0).Select(c => c.RindeKgHa!.Value).ToList();
        return rindes.Count > 0 ? Math.Round(rindes.Average(), 0) : null;
    }

    private static decimal? Porcentaje(decimal parte, decimal total) =>
        total > 0 ? Math.Round(parte * 100m / total, 1) : null;

    private sealed record Combinacion(
        int CampaniaCombinacionId,
        int LoteId,
        string LoteNombre,
        string? LoteCiudad,
        decimal Hectareas,
        string Producto,
        DateOnly FechaInicio,
        int? SiembraId,
        string? SiembraEstado,
        DateOnly? SiembraFechaInicio,
        decimal? SiembraHectareas,
        int? CosechaId,
        string? CosechaEstado,
        decimal? CosechaHectareas,
        decimal? CosechaKg,
        decimal? RindeKgHa,
        DateOnly? UltimoSeguimientoFecha,
        DateOnly? UltimaPerdidaFecha,
        string? UltimaPerdidaMotivo,
        string? UltimaTiradaSeveridad,
        decimal? UltimaTiradaPerdidaKgHa,
        int EtapaCodigo,
        bool ListoParaFinalizar,
        DateOnly? UltimoMovimientoFecha,
        string? UltimoMovimientoDescripcion);

    // =====================================================================
    // Agenda
    // =====================================================================

    public async Task<InicioAgendaDto> ObtenerAgendaAsync(int empresaId, int? campaniaId, int dias, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await DistribucionAcceso.ExigirAccesoAsync(connection, null, usuarioId, esAdmin, empresaId);

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var hasta = hoy.AddDays(dias);

        // Silos (CampaniaId NULL) se muestran siempre. Los camiones en transito se
        // muestran sin importar la fecha de salida. Los vencidos, hasta 60 dias atras.
        const string sql = """
            SELECT Fecha, Tipo, Subtipo, Titulo, Detalle, Modulo, ReferenciaId
            FROM dbo.vw_InicioAgenda
            WHERE EmpresaId = @EmpresaId
              AND (@CampaniaId IS NULL OR CampaniaId IS NULL OR CampaniaId = @CampaniaId)
              AND (
                    Subtipo = N'EnTransito'
                    OR (Fecha >= @DesdeVencidos AND Fecha <= @Hasta)
                  )
            ORDER BY Fecha, Tipo, Titulo;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);
        command.Parameters.AddWithValue("@DesdeVencidos", hoy.AddDays(-DiasVencidosAgenda));
        command.Parameters.AddWithValue("@Hasta", hasta);

        var eventos = new List<InicioAgendaEventoDto>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var fecha = DateOnly.FromDateTime(r.GetDateTime(0));
            var subtipo = r.GetString(2);

            eventos.Add(new InicioAgendaEventoDto
            {
                Fecha = fecha,
                Tipo = r.GetString(1),
                Subtipo = subtipo,
                Titulo = r.GetString(3),
                Detalle = r.GetString(4),
                Modulo = r.GetString(5),
                ReferenciaId = r.GetInt32(6),
                Grupo = subtipo == "EnTransito" ? GruposAgenda.EnTransito
                      : fecha < hoy ? GruposAgenda.Vencidos
                      : GruposAgenda.Proximos,
                DiasDesdeHoy = fecha.DayNumber - hoy.DayNumber,
            });
        }

        return new InicioAgendaDto { Hoy = hoy, Hasta = hasta, Eventos = eventos };
    }
}
