using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public interface IEstadisticasRepository
{
    Task<EstadisticasAlmacenamientoDto> ObtenerAlmacenamientoAsync(
        int empresaId, DateOnly desde, DateOnly hasta, string? grano, int usuarioId, bool esAdmin);

    Task<EstadisticasDistribucionDto> ObtenerDistribucionAsync(
        int empresaId, DateOnly desde, DateOnly hasta, string? grano, int usuarioId, bool esAdmin);
}

/*
    Modulo Estadisticas (primera version: Silos y almacenamiento + Distribucion).
    Solo lectura: no necesita tablas propias, sale de partidas FIFO, movimientos,
    controles de silo y camiones de distribucion.

    Acceso: Gerente, Encargado y Admin (Manual de Usuario, seccion Roles).

    Criterios:
      - "Al dia de hoy" (stock, antiguedad, camiones sin conciliar) ignora el periodo.
      - El grano se compara sin tildes ni mayusculas (Maiz = Maíz).
      - Flujo mensual: las transferencias entre silos no cuentan (el grano no entra
        ni sale de la empresa). El stock al cierre de cada mes se reconstruye hacia
        atras desde el stock actual.
      - Mermas: ajustes negativos por motivo + egresos manuales por Deterioro.
      - Cumplimiento de controles: cada control programa el proximo. Un control
        programado dentro del periodo esta "en termino" si el siguiente se hizo hasta
        esa fecha. Los vencidos sin hacer cuentan como incumplidos, salvo que el silo
        ya no tenga grano. Los que todavia no vencieron no cuentan. No se filtra por grano.
*/
public class EstadisticasRepository(IConfiguration configuration) : IEstadisticasRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private static readonly string[] RolesEstadisticas = ["Gerente", "Encargado"];
    private const string MensajeRol = "Solo el Gerente o el Encargado pueden ver las estadisticas.";

    /// <summary>Filtro de grano sin tildes ni mayusculas. @Grano NULL = todos.</summary>
    private static string FiltroGrano(string columna) =>
        $"(@Grano IS NULL OR {columna} COLLATE Latin1_General_CI_AI = @Grano COLLATE Latin1_General_CI_AI)";

    // =====================================================================
    // Silos y almacenamiento
    // =====================================================================

    public async Task<EstadisticasAlmacenamientoDto> ObtenerAlmacenamientoAsync(
        int empresaId, DateOnly desde, DateOnly hasta, string? grano, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await DistribucionAcceso.ExigirRolAsync(connection, null, usuarioId, esAdmin, empresaId, RolesEstadisticas, MensajeRol);

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var resultado = new EstadisticasAlmacenamientoDto();

        // ---- Stock actual ----
        var sqlStock = $"""
            SELECT ISNULL(SUM(s.CantidadGranoAlmacenado), 0),
                   SUM(CASE WHEN s.CantidadGranoAlmacenado > 0 THEN 1 ELSE 0 END)
            FROM dbo.Silos AS s
            WHERE s.EmpresaId = @EmpresaId
              AND s.EstadoOperativo <> N'Dado de baja'
              AND {FiltroGrano("s.Producto")};
            """;
        await using (var command = Comando(connection, sqlStock, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            if (await r.ReadAsync())
            {
                resultado.StockKg = r.GetDecimal(0);
                resultado.SilosConGrano = r.IsDBNull(1) ? 0 : r.GetInt32(1);
            }
        }

        // ---- Antiguedad del stock (partidas FIFO con saldo) ----
        var sqlAntiguedad = $"""
            SELECT x.Grano,
                   SUM(CASE WHEN x.Dias <= 30 THEN p.KgRestantes ELSE 0 END),
                   SUM(CASE WHEN x.Dias BETWEEN 31 AND 90 THEN p.KgRestantes ELSE 0 END),
                   SUM(CASE WHEN x.Dias BETWEEN 91 AND 180 THEN p.KgRestantes ELSE 0 END),
                   SUM(CASE WHEN x.Dias > 180 THEN p.KgRestantes ELSE 0 END),
                   SUM(p.KgRestantes),
                   SUM(p.KgRestantes * x.Dias)
            FROM dbo.AlmacenamientoPartidas AS p
            INNER JOIN dbo.Silos AS s ON s.SiloId = p.SiloId
            CROSS APPLY (SELECT DATEDIFF(DAY, p.FechaIngreso, @Hoy) AS Dias,
                                COALESCE(p.Producto, s.Producto, N'Sin grano') AS Grano) AS x
            WHERE COALESCE(p.EmpresaId, s.EmpresaId) = @EmpresaId
              AND p.KgRestantes > 0
              AND {FiltroGrano("x.Grano")}
            GROUP BY x.Grano
            ORDER BY SUM(p.KgRestantes) DESC;
            """;
        var antiguedad = new List<AntiguedadGranoDto>();
        decimal kgPorDias = 0, kgTotalPartidas = 0;
        await using (var command = Comando(connection, sqlAntiguedad, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                antiguedad.Add(new AntiguedadGranoDto
                {
                    Producto = r.GetString(0),
                    Kg0a30 = r.GetDecimal(1),
                    Kg31a90 = r.GetDecimal(2),
                    Kg91a180 = r.GetDecimal(3),
                    KgMas180 = r.GetDecimal(4),
                    KgTotal = r.GetDecimal(5),
                });
                kgTotalPartidas += r.GetDecimal(5);
                kgPorDias += r.GetDecimal(6);
            }
        }

        resultado.Antiguedad = antiguedad;
        resultado.KgMas180Dias = antiguedad.Sum(a => a.KgMas180);
        resultado.AntiguedadPromedioDias = kgTotalPartidas > 0 ? Math.Round(kgPorDias / kgTotalPartidas, 0) : null;

        // ---- Flujo mensual del periodo ----
        var sqlFlujo = $"""
            SELECT YEAR(a.Fecha), MONTH(a.Fecha),
                   SUM(CASE WHEN a.Origen <> N'Transferencia' AND a.TipoMovimiento IN (N'Ingreso', N'AjustePositivo') THEN a.Cantidad ELSE 0 END),
                   SUM(CASE WHEN a.Origen = N'Distribucion' AND a.TipoMovimiento = N'Egreso' THEN a.Cantidad ELSE 0 END),
                   SUM(CASE WHEN a.Origen NOT IN (N'Transferencia', N'Distribucion') AND a.TipoMovimiento IN (N'Egreso', N'AjusteNegativo') THEN a.Cantidad ELSE 0 END)
            FROM dbo.Almacenamientos AS a
            INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
            WHERE COALESCE(a.EmpresaId, s.EmpresaId) = @EmpresaId
              AND a.Fecha BETWEEN @Desde AND @Hasta
              AND {FiltroGrano("COALESCE(a.Producto, s.Producto)")}
            GROUP BY YEAR(a.Fecha), MONTH(a.Fecha);
            """;
        var porMes = new Dictionary<(int, int), (decimal Ingresos, decimal Distribucion, decimal Otros)>();
        await using (var command = Comando(connection, sqlFlujo, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                porMes[(r.GetInt32(0), r.GetInt32(1))] = (r.GetDecimal(2), r.GetDecimal(3), r.GetDecimal(4));
            }
        }

        // Variacion neta de stock por mes, desde el inicio del periodo hasta hoy, para
        // reconstruir el stock al cierre de cada mes hacia atras desde el stock actual.
        var sqlNeto = $"""
            SELECT YEAR(a.Fecha), MONTH(a.Fecha), SUM(a.Sentido * a.Cantidad)
            FROM dbo.Almacenamientos AS a
            INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
            WHERE COALESCE(a.EmpresaId, s.EmpresaId) = @EmpresaId
              AND a.Fecha >= DATEFROMPARTS(YEAR(@Desde), MONTH(@Desde), 1)
              AND {FiltroGrano("COALESCE(a.Producto, s.Producto)")}
            GROUP BY YEAR(a.Fecha), MONTH(a.Fecha);
            """;
        var netoPorMes = new Dictionary<(int, int), decimal>();
        await using (var command = Comando(connection, sqlNeto, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                netoPorMes[(r.GetInt32(0), r.GetInt32(1))] = Convert.ToDecimal(r.GetValue(2));
            }
        }

        var flujo = new List<FlujoMensualDto>();
        for (var mes = new DateOnly(desde.Year, desde.Month, 1); mes <= hasta; mes = mes.AddMonths(1))
        {
            var clave = (mes.Year, mes.Month);
            var (ingresos, distribucion, otros) = porMes.GetValueOrDefault(clave);
            var netoPosterior = netoPorMes.Where(n => n.Key.CompareTo(clave) > 0).Sum(n => n.Value);
            flujo.Add(new FlujoMensualDto
            {
                Anio = mes.Year,
                Mes = mes.Month,
                IngresosKg = ingresos,
                EgresosDistribucionKg = distribucion,
                EgresosOtrosKg = otros,
                StockCierreKg = Math.Max(0, resultado.StockKg - netoPosterior),
            });
        }

        resultado.FlujoMensual = flujo;
        resultado.KgIngresados = flujo.Sum(f => f.IngresosKg);

        // ---- Mermas del periodo ----
        var sqlMermas = $"""
            SELECT CASE WHEN a.TipoMovimiento = N'Egreso' THEN N'Deterioro' ELSE ISNULL(a.Motivo, N'Sin motivo') END AS Motivo,
                   SUM(a.Cantidad)
            FROM dbo.Almacenamientos AS a
            INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
            WHERE COALESCE(a.EmpresaId, s.EmpresaId) = @EmpresaId
              AND a.Fecha BETWEEN @Desde AND @Hasta
              AND (a.TipoMovimiento = N'AjusteNegativo' OR (a.TipoMovimiento = N'Egreso' AND a.Motivo = N'Deterioro'))
              AND {FiltroGrano("COALESCE(a.Producto, s.Producto)")}
            GROUP BY CASE WHEN a.TipoMovimiento = N'Egreso' THEN N'Deterioro' ELSE ISNULL(a.Motivo, N'Sin motivo') END
            ORDER BY SUM(a.Cantidad) DESC;
            """;
        var mermas = new List<MermaMotivoDto>();
        await using (var command = Comando(connection, sqlMermas, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                mermas.Add(new MermaMotivoDto { Motivo = r.GetString(0), Kg = r.GetDecimal(1) });
            }
        }

        resultado.KgMerma = mermas.Sum(m => m.Kg);
        foreach (var merma in mermas)
        {
            merma.Pct = resultado.KgMerma > 0 ? Math.Round(merma.Kg / resultado.KgMerma * 100m, 1) : 0;
        }

        resultado.Mermas = mermas;
        resultado.MermaPct = resultado.KgIngresados > 0 ? Math.Round(resultado.KgMerma / resultado.KgIngresados * 100m, 2) : null;

        // ---- Cumplimiento de controles ----
        const string sqlControles = """
            WITH Controles AS
            (
                SELECT sc.SiloId,
                       sc.FechaProximoControl,
                       LEAD(CAST(sc.Fecha AS DATE)) OVER (PARTITION BY sc.SiloId ORDER BY sc.Fecha, sc.SiloControlId) AS Siguiente
                FROM dbo.SiloControles AS sc
                INNER JOIN dbo.Silos AS s ON s.SiloId = sc.SiloId
                WHERE s.EmpresaId = @EmpresaId
            )
            SELECT s.SiloId, s.Nombre, s.TipoSilo,
                   COUNT(1) AS Programados,
                   SUM(CASE WHEN c.Siguiente IS NOT NULL AND c.Siguiente <= c.FechaProximoControl THEN 1 ELSE 0 END) AS EnTermino,
                   SUM(CASE WHEN COALESCE(c.Siguiente, @Hoy) > c.FechaProximoControl
                            THEN DATEDIFF(DAY, c.FechaProximoControl, COALESCE(c.Siguiente, @Hoy)) ELSE 0 END) AS DiasAtraso,
                   SUM(CASE WHEN COALESCE(c.Siguiente, @Hoy) > c.FechaProximoControl THEN 1 ELSE 0 END) AS Atrasados
            FROM Controles AS c
            INNER JOIN dbo.Silos AS s ON s.SiloId = c.SiloId
            WHERE c.FechaProximoControl BETWEEN @Desde AND @Hasta
              AND (c.Siguiente IS NOT NULL OR (c.FechaProximoControl < @Hoy AND s.EstadoOperativo = N'Con grano'))
            GROUP BY s.SiloId, s.Nombre, s.TipoSilo;
            """;
        var porSilo = new List<CumplimientoSiloDto>();
        int diasAtrasoTotal = 0, atrasadosTotal = 0;
        await using (var command = Comando(connection, sqlControles, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                var programados = r.GetInt32(3);
                var enTermino = r.GetInt32(4);
                var diasAtraso = r.GetInt32(5);
                var atrasados = r.GetInt32(6);
                diasAtrasoTotal += diasAtraso;
                atrasadosTotal += atrasados;
                porSilo.Add(new CumplimientoSiloDto
                {
                    SiloId = r.GetInt32(0),
                    Silo = r.GetString(1),
                    TipoSilo = r.GetString(2),
                    Programados = programados,
                    EnTermino = enTermino,
                    Pct = programados > 0 ? Math.Round(enTermino * 100m / programados, 0) : 0,
                    AtrasoPromedioDias = atrasados > 0 ? Math.Round((decimal)diasAtraso / atrasados, 1) : null,
                });
            }
        }

        resultado.ControlesPorSilo = porSilo.OrderByDescending(s => s.Pct).ThenBy(s => s.Silo).ToList();
        resultado.ControlesProgramados = porSilo.Sum(s => s.Programados);
        resultado.ControlesEnTermino = porSilo.Sum(s => s.EnTermino);
        resultado.ControlesEnTerminoPct = resultado.ControlesProgramados > 0
            ? Math.Round(resultado.ControlesEnTermino * 100m / resultado.ControlesProgramados, 0)
            : null;
        resultado.AtrasoPromedioDias = atrasadosTotal > 0 ? Math.Round((decimal)diasAtrasoTotal / atrasadosTotal, 1) : null;

        // ---- Granos para el filtro (sin filtrar por grano) ----
        const string sqlGranos = """
            SELECT DISTINCT COALESCE(a.Producto, s.Producto)
            FROM dbo.Almacenamientos AS a
            INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
            WHERE COALESCE(a.EmpresaId, s.EmpresaId) = @EmpresaId
              AND COALESCE(a.Producto, s.Producto) IS NOT NULL;
            """;
        var granos = new List<string>();
        await using (var command = Comando(connection, sqlGranos, empresaId, desde, hasta, null, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync()) granos.Add(r.GetString(0));
        }

        resultado.GranosDisponibles = granos
            .GroupBy(CalculadoraMermaDistribucion.NormalizarGrano)
            .Select(g => g.First())
            .OrderBy(g => g)
            .ToList();

        return resultado;
    }

    // =====================================================================
    // Distribucion
    // =====================================================================

    public async Task<EstadisticasDistribucionDto> ObtenerDistribucionAsync(
        int empresaId, DateOnly desde, DateOnly hasta, string? grano, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await DistribucionAcceso.ExigirRolAsync(connection, null, usuarioId, esAdmin, empresaId, RolesEstadisticas, MensajeRol);

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var resultado = new EstadisticasDistribucionDto();
        var filtroPeriodo = $"""
            v.EmpresaId = @EmpresaId
            AND v.FechaSalida BETWEEN @Desde AND @Hasta
            AND {FiltroGrano("v.Producto")}
            """;
        const string conciliadoConEsperada = "v.Estado = N'Conciliado' AND v.MermaEsperadaKg IS NOT NULL";

        // ---- Indicadores del periodo ----
        var sqlKpis = $"""
            SELECT ISNULL(SUM(v.KgDespachados), 0), COUNT(1), COUNT(DISTINCT v.DestinoId),
                   SUM(CASE WHEN {conciliadoConEsperada} THEN v.KgDespachados END),
                   SUM(CASE WHEN {conciliadoConEsperada} THEN v.MermaTotalKg END),
                   SUM(CASE WHEN {conciliadoConEsperada} THEN v.MermaEsperadaKg END),
                   SUM(CASE WHEN {conciliadoConEsperada} THEN v.DiferenciaBalanzaKg END)
            FROM dbo.vw_DistribucionCamiones AS v
            WHERE {filtroPeriodo};
            """;
        await using (var command = Comando(connection, sqlKpis, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            if (await r.ReadAsync())
            {
                resultado.KgDespachados = r.GetDecimal(0);
                resultado.CantidadCamiones = r.GetInt32(1);
                resultado.CantidadDestinos = r.GetInt32(2);

                var kgBase = r.IsDBNull(3) ? 0m : r.GetDecimal(3);
                if (kgBase > 0)
                {
                    var real = r.GetDecimal(4);
                    var esperada = r.GetDecimal(5);
                    var balanza = r.GetDecimal(6);
                    var desvio = (real - esperada) / kgBase * 100m;
                    resultado.MermaRealPct = Math.Round(real / kgBase * 100m, 2);
                    resultado.MermaEsperadaPct = Math.Round(esperada / kgBase * 100m, 2);
                    resultado.DesvioPp = Math.Round(desvio, 2);
                    resultado.NivelDesvio = CalculadoraMermaDistribucion.Nivel(desvio);
                    resultado.KgSinJustificar = Math.Round(real - esperada, 2);
                    resultado.KgSinJustificarBalanza = Math.Round(balanza, 2);
                    resultado.KgSinJustificarCalidad = Math.Round(real - esperada - balanza, 2);
                }
            }
        }

        // ---- Merma por acopiadora (conciliados con merma esperada) ----
        var sqlAcopiadora = $"""
            SELECT v.DestinoId, v.Destino, SUM(v.KgDespachados), SUM(v.MermaTotalKg), SUM(v.MermaEsperadaKg)
            FROM dbo.vw_DistribucionCamiones AS v
            WHERE {filtroPeriodo} AND {conciliadoConEsperada}
            GROUP BY v.DestinoId, v.Destino;
            """;
        var acopiadoras = new List<MermaAcopiadoraDto>();
        await using (var command = Comando(connection, sqlAcopiadora, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                var kg = r.GetDecimal(2);
                var real = r.GetDecimal(3) / kg * 100m;
                var esperada = r.GetDecimal(4) / kg * 100m;
                acopiadoras.Add(new MermaAcopiadoraDto
                {
                    DestinoId = r.GetInt32(0),
                    Destino = r.GetString(1),
                    KgDespachados = kg,
                    MermaRealPct = Math.Round(real, 2),
                    MermaEsperadaPct = Math.Round(esperada, 2),
                    DesvioPp = Math.Round(real - esperada, 2),
                    NivelDesvio = CalculadoraMermaDistribucion.Nivel(real - esperada),
                });
            }
        }

        resultado.MermaPorAcopiadora = acopiadoras.OrderByDescending(a => a.DesvioPp).ToList();

        // ---- Kg despachados por destino (todos los estados) ----
        var sqlDestino = $"""
            SELECT v.DestinoId, v.Destino, SUM(v.KgDespachados)
            FROM dbo.vw_DistribucionCamiones AS v
            WHERE {filtroPeriodo}
            GROUP BY v.DestinoId, v.Destino
            ORDER BY SUM(v.KgDespachados) DESC;
            """;
        var destinos = new List<KgDestinoDto>();
        await using (var command = Comando(connection, sqlDestino, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                destinos.Add(new KgDestinoDto { DestinoId = r.GetInt32(0), Destino = r.GetString(1), Kg = r.GetDecimal(2) });
            }
        }

        foreach (var destino in destinos)
        {
            destino.Pct = resultado.KgDespachados > 0 ? Math.Round(destino.Kg / resultado.KgDespachados * 100m, 1) : 0;
        }

        resultado.KgPorDestino = destinos;

        // ---- Diferencia de balanza por transportista (camiones con recepcion) ----
        var sqlBalanza = $"""
            SELECT ISNULL(v.Transportista, N'Sin transportista'), SUM(v.DiferenciaBalanzaKg), SUM(v.KgDespachados)
            FROM dbo.vw_DistribucionCamiones AS v
            WHERE {filtroPeriodo} AND v.KgRecibidos IS NOT NULL
            GROUP BY ISNULL(v.Transportista, N'Sin transportista');
            """;
        var transportistas = new List<BalanzaTransportistaDto>();
        await using (var command = Comando(connection, sqlBalanza, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                var diferencia = r.GetDecimal(1);
                var despachado = r.GetDecimal(2);
                transportistas.Add(new BalanzaTransportistaDto
                {
                    Transportista = r.GetString(0),
                    DiferenciaKg = diferencia,
                    KgDespachados = despachado,
                    DiferenciaPct = despachado > 0 ? Math.Round(diferencia / despachado * 100m, 2) : 0,
                });
            }
        }

        resultado.BalanzaPorTransportista = transportistas.OrderByDescending(t => t.DiferenciaPct).ToList();

        // ---- Pendientes al dia de hoy (sin filtro de fechas) ----
        var sqlPendientes = $"""
            SELECT SUM(CASE WHEN v.Estado = N'Recibido' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN v.Estado = N'En transito' THEN 1 ELSE 0 END)
            FROM dbo.vw_DistribucionCamiones AS v
            WHERE v.EmpresaId = @EmpresaId AND {FiltroGrano("v.Producto")};
            """;
        await using (var command = Comando(connection, sqlPendientes, empresaId, desde, hasta, grano, hoy))
        await using (var r = await command.ExecuteReaderAsync())
        {
            if (await r.ReadAsync())
            {
                resultado.CamionesRecibidosSinConciliar = r.IsDBNull(0) ? 0 : r.GetInt32(0);
                resultado.CamionesEnTransito = r.IsDBNull(1) ? 0 : r.GetInt32(1);
            }
        }

        return resultado;
    }

    private static SqlCommand Comando(
        SqlConnection connection, string sql, int empresaId, DateOnly desde, DateOnly hasta, string? grano, DateOnly hoy)
    {
        var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@Desde", desde);
        command.Parameters.AddWithValue("@Hasta", hasta);
        command.Parameters.AddWithValue("@Hoy", hoy);
        command.Parameters.Add(new SqlParameter("@Grano", System.Data.SqlDbType.NVarChar, 60)
        {
            Value = string.IsNullOrWhiteSpace(grano) ? DBNull.Value : grano.Trim(),
        });
        return command;
    }
}
