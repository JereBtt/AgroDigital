using System.Globalization;
using System.Text;
using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

/*
    Rediseno de Silos y Almacenamiento - fase 2.

    Reglas que aplica este repositorio (ver propuesta funcional):
      - Acceso por empresa: un usuario solo ve y mueve grano de silos de sus
        empresas (dbo.UsuarioEmpresas). Admin ve todo. Mismo criterio que Lotes.
      - Un grano por silo: solo se ingresa el mismo grano que ya contiene, o
        cualquiera si esta vacio.
      - Capacidad: un ingreso no puede superar la capacidad libre del silo.
      - Saldo de cosecha: un ingreso vinculado no puede superar lo cosechado
        menos lo ya almacenado.
      - Silo inhabilitado: no recibe ingresos si esta En mantenimiento o Dado de baja.
      - Fechas: no posteriores a hoy ni anteriores al ultimo movimiento del silo
        (asi el orden por fecha coincide con la cadena StockAnterior/StockResultante).
      - Partidas FIFO: cada ingreso abre una partida; los egresos consumen primero
        la mas antigua y quedan registrados en AlmacenamientoPartidaConsumos.
      - Estado operativo del silo: Vacio / Con grano se mantiene solo.
*/
public class AlmacenamientoRepository(IConfiguration configuration) : IAlmacenamientoRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    // Mismo criterio que Lotes y Silos: el usuario ve lo de sus empresas; Admin ve todo.
    private const string AccesoSilo = """
        (@IncluirTodos = 1 OR EXISTS (
            SELECT 1 FROM dbo.UsuarioEmpresas AS ue
            WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = s.EmpresaId AND ue.Activo = 1))
        """;

    private const string SelectBase = """
        SELECT
            a.AlmacenamientoId, a.SiloId, s.Nombre AS SiloNombre, s.Producto AS SiloProducto,
            a.Fecha, a.TipoMovimiento, a.Cantidad, a.StockAnterior, a.StockResultante,
            a.Origen, a.Observaciones, a.Campania, a.Cosecha, a.Producto, u.Nombre + ' ' + u.Apellido AS CreadoPorNombre,
            a.FechaCreacion, a.FechaModificacion,
            COALESCE(a.EmpresaId, s.EmpresaId) AS EmpresaId, s.Codigo, a.CosechaId, a.CampaniaId, a.HumedadIngreso, a.Impurezas
        FROM dbo.Almacenamientos AS a
        INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
        LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = a.CreadoPorUsuarioId
        """;

    // =====================================================================
    // Consultas de movimientos (ALM-02). Sin usuario (llamadas internas) no filtran.
    // =====================================================================

    public async Task<IReadOnlyList<AlmacenamientoDto>> ObtenerTodosAsync(int usuarioId = 0, bool incluirTodos = true)
    {
        var sql = SelectBase + $" WHERE {AccesoSilo} ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC;";
        return await LeerMovimientosAsync(sql, usuarioId, incluirTodos);
    }

    public async Task<AlmacenamientoDto?> ObtenerPorIdAsync(int almacenamientoId, int usuarioId = 0, bool incluirTodos = true)
    {
        var sql = SelectBase + $" WHERE a.AlmacenamientoId = @AlmacenamientoId AND {AccesoSilo};";
        var resultado = await LeerMovimientosAsync(sql, usuarioId, incluirTodos, ("@AlmacenamientoId", almacenamientoId));
        return resultado.FirstOrDefault();
    }

    public async Task<IReadOnlyList<AlmacenamientoDto>> ObtenerPorSiloAsync(int siloId, int usuarioId = 0, bool incluirTodos = true)
    {
        var sql = SelectBase + $" WHERE a.SiloId = @SiloId AND {AccesoSilo} ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC;";
        return await LeerMovimientosAsync(sql, usuarioId, incluirTodos, ("@SiloId", siloId));
    }

    private async Task<IReadOnlyList<AlmacenamientoDto>> LeerMovimientosAsync(
        string sql, int usuarioId, bool incluirTodos, params (string Nombre, object Valor)[] parametros)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        AgregarAcceso(command, usuarioId, incluirTodos);
        foreach (var (nombre, valor) in parametros)
        {
            command.Parameters.AddWithValue(nombre, valor);
        }

        await using var reader = await command.ExecuteReaderAsync();
        var movimientos = new List<AlmacenamientoDto>();
        while (await reader.ReadAsync())
        {
            movimientos.Add(Mapear(reader));
        }

        return movimientos;
    }

    // =====================================================================
    // ALM-05: stock actual
    // =====================================================================

    public async Task<StockActualDto> ObtenerStockAsync(int? empresaId, int? campaniaId, int usuarioId, bool incluirTodos)
    {
        var sql = $"""
            SELECT
                s.SiloId, s.EmpresaId, s.Codigo, s.Nombre, s.TipoSilo, s.Producto, s.EstadoOperativo,
                l.Nombre AS LoteNombre, s.CapacidadMax, s.CantidadGranoAlmacenado,
                ctrl.Fecha, ctrl.Resultado, ctrl.FechaProximoControl
            FROM dbo.Silos AS s
            LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
            OUTER APPLY (
                SELECT TOP (1) sc.Fecha, sc.Resultado, sc.FechaProximoControl
                FROM dbo.SiloControles AS sc
                WHERE sc.SiloId = s.SiloId
                ORDER BY sc.Fecha DESC, sc.SiloControlId DESC
            ) AS ctrl
            WHERE {AccesoSilo}
              AND (@EmpresaId IS NULL OR s.EmpresaId = @EmpresaId)
              AND s.EstadoOperativo <> N'Dado de baja'
            ORDER BY s.Nombre;

            SELECT
                p.PartidaId, p.SiloId, p.CosechaId, c.Nombre AS CosechaNombre,
                p.CampaniaId, cp.Nombre AS CampaniaNombre, lo.Nombre AS LoteNombre,
                p.Producto, p.FechaIngreso, p.KgIniciales, p.KgRestantes
            FROM dbo.AlmacenamientoPartidas AS p
            INNER JOIN dbo.Silos AS s ON s.SiloId = p.SiloId
            LEFT JOIN dbo.Cosechas AS c ON c.CosechaId = p.CosechaId
            LEFT JOIN dbo.Lotes AS lo ON lo.LoteId = c.LoteId
            LEFT JOIN dbo.Campanias AS cp ON cp.CampaniaId = p.CampaniaId
            WHERE p.KgRestantes > 0
              AND {AccesoSilo}
              AND (@EmpresaId IS NULL OR s.EmpresaId = @EmpresaId)
              AND s.EstadoOperativo <> N'Dado de baja'
              AND (@CampaniaId IS NULL OR p.CampaniaId = @CampaniaId)
            ORDER BY p.FechaIngreso, p.PartidaId;
            """;

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var silos = new List<StockSiloDto>();
        var partidas = new List<PartidaDto>();

        await using (var connection = new SqlConnection(_connectionString))
        {
            await connection.OpenAsync();
            await using var command = new SqlCommand(sql, connection);
            AgregarAcceso(command, usuarioId, incluirTodos);
            command.Parameters.AddWithValue("@EmpresaId", (object?)empresaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);

            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                silos.Add(new StockSiloDto
                {
                    SiloId = reader.GetInt32(0),
                    EmpresaId = reader.IsDBNull(1) ? null : reader.GetInt32(1),
                    Codigo = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Nombre = reader.GetString(3),
                    TipoSilo = reader.GetString(4),
                    Producto = reader.IsDBNull(5) ? null : reader.GetString(5),
                    EstadoOperativo = reader.GetString(6),
                    LoteNombre = reader.IsDBNull(7) ? null : reader.GetString(7),
                    CapacidadMax = reader.GetDecimal(8),
                    Kg = reader.GetDecimal(9),
                    UltimoControlFecha = reader.IsDBNull(10) ? null : DateOnly.FromDateTime(reader.GetDateTime(10)),
                    UltimoControlResultado = reader.IsDBNull(11) ? null : reader.GetString(11),
                    FechaProximoControl = reader.IsDBNull(12) ? null : DateOnly.FromDateTime(reader.GetDateTime(12)),
                });
            }

            await reader.NextResultAsync();
            while (await reader.ReadAsync())
            {
                var fechaIngreso = DateOnly.FromDateTime(reader.GetDateTime(8));
                partidas.Add(new PartidaDto
                {
                    PartidaId = reader.GetInt32(0),
                    SiloId = reader.GetInt32(1),
                    CosechaId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                    CosechaNombre = reader.IsDBNull(3) ? null : reader.GetString(3),
                    CampaniaId = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                    CampaniaNombre = reader.IsDBNull(5) ? null : reader.GetString(5),
                    LoteNombre = reader.IsDBNull(6) ? null : reader.GetString(6),
                    Producto = reader.IsDBNull(7) ? null : reader.GetString(7),
                    FechaIngreso = fechaIngreso,
                    KgIniciales = reader.GetDecimal(9),
                    KgRestantes = reader.GetDecimal(10),
                    DiasAlmacenado = Math.Max(0, hoy.DayNumber - fechaIngreso.DayNumber),
                });
            }
        }

        var partidasPorSilo = partidas.ToLookup(p => p.SiloId);
        var capacidadTotal = silos.Sum(s => s.CapacidadMax);

        foreach (var silo in silos)
        {
            var propias = partidasPorSilo[silo.SiloId].ToList();
            silo.Partidas = propias;

            // Con filtro de campania, el stock del silo es solo lo que vino de esa campania.
            if (campaniaId.HasValue)
            {
                silo.Kg = propias.Sum(p => p.KgRestantes);
            }

            var kgPartidas = propias.Sum(p => p.KgRestantes);
            silo.DiasAntiguedadPromedio = kgPartidas > 0
                ? (int)Math.Round(propias.Sum(p => p.DiasAlmacenado * p.KgRestantes) / kgPartidas)
                : null;
            silo.Producto ??= propias.FirstOrDefault()?.Producto;
        }

        var silosConStock = campaniaId.HasValue ? silos.Where(s => s.Kg > 0).ToList() : silos;

        var granos = silosConStock
            .Where(s => s.Kg > 0 && !string.IsNullOrWhiteSpace(s.Producto))
            .GroupBy(s => NormalizarGrano(s.Producto))
            .Select(g => new StockGranoDto
            {
                Producto = g.First().Producto!,
                Kg = g.Sum(s => s.Kg),
                CantidadSilos = g.Count(),
            })
            .OrderByDescending(g => g.Kg)
            .ToList();

        var cosechas = (await ObtenerSaldosCosechaAsync(empresaId, cosechaId: null, usuarioId, incluirTodos))
            .Where(c => c.KgCosechados is not null && c.KgDisponibles > 0)
            .Where(c => campaniaId is null || c.CampaniaId == campaniaId)
            .ToList();

        return new StockActualDto
        {
            Granos = granos,
            Silos = silosConStock,
            CosechasConSaldo = cosechas,
            KgTotales = silosConStock.Sum(s => s.Kg),
            CapacidadTotal = capacidadTotal,
        };
    }

    // =====================================================================
    // Saldo de cosechas y silos destino
    // =====================================================================

    public async Task<IReadOnlyList<SaldoCosechaDto>> ObtenerCosechasConSaldoAsync(int? empresaId, int usuarioId, bool incluirTodos)
    {
        var todas = await ObtenerSaldosCosechaAsync(empresaId, cosechaId: null, usuarioId, incluirTodos);
        return todas.Where(c => c.KgCosechados is not null && c.KgDisponibles > 0).ToList();
    }

    public async Task<SaldoCosechaDto?> ObtenerSaldoCosechaAsync(int cosechaId, int usuarioId, bool incluirTodos)
    {
        var resultado = await ObtenerSaldosCosechaAsync(empresaId: null, cosechaId, usuarioId, incluirTodos);
        return resultado.FirstOrDefault();
    }

    private async Task<IReadOnlyList<SaldoCosechaDto>> ObtenerSaldosCosechaAsync(
        int? empresaId, int? cosechaId, int usuarioId, bool incluirTodos,
        int? excluirAlmacenamientoId = null, SqlConnection? connection = null, SqlTransaction? transaction = null)
    {
        const string sql = """
            SELECT
                c.CosechaId, lo.EmpresaId, c.Nombre, c.Producto, c.LoteId, lo.Nombre AS LoteNombre,
                cp.CampaniaId, COALESCE(cp.Nombre, c.CampaniaNombre) AS CampaniaNombre,
                c.Estado, c.FechaInicio, c.CantidadGranoCosechado, ISNULL(alm.Kg, 0) AS KgAlmacenados
            FROM dbo.Cosechas AS c
            INNER JOIN dbo.Lotes AS lo ON lo.LoteId = c.LoteId
            OUTER APPLY (
                SELECT TOP (1) x.CampaniaId, x.Nombre
                FROM dbo.Campanias AS x
                WHERE x.Nombre = c.CampaniaNombre
                ORDER BY CASE WHEN x.EmpresaId = lo.EmpresaId THEN 0 ELSE 1 END, x.CampaniaId
            ) AS cp
            OUTER APPLY (
                SELECT SUM(a.Cantidad) AS Kg
                FROM dbo.Almacenamientos AS a
                WHERE a.CosechaId = c.CosechaId
                  AND a.TipoMovimiento = N'Ingreso'
                  AND a.Origen <> N'Transferencia'
                  AND (@ExcluirAlmacenamientoId IS NULL OR a.AlmacenamientoId <> @ExcluirAlmacenamientoId)
            ) AS alm
            WHERE (@IncluirTodos = 1 OR EXISTS (
                    SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                    WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = lo.EmpresaId AND ue.Activo = 1))
              AND (@EmpresaId IS NULL OR lo.EmpresaId = @EmpresaId)
              AND (@CosechaId IS NULL OR c.CosechaId = @CosechaId)
            ORDER BY c.FechaInicio DESC, c.CosechaId DESC;
            """;

        var propia = connection is null;
        var conn = connection ?? new SqlConnection(_connectionString);
        try
        {
            if (propia)
            {
                await conn.OpenAsync();
            }

            await using var command = new SqlCommand(sql, conn, transaction);
            AgregarAcceso(command, usuarioId, incluirTodos);
            command.Parameters.AddWithValue("@EmpresaId", (object?)empresaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@CosechaId", (object?)cosechaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@ExcluirAlmacenamientoId", (object?)excluirAlmacenamientoId ?? DBNull.Value);

            await using var reader = await command.ExecuteReaderAsync();
            var cosechas = new List<SaldoCosechaDto>();
            while (await reader.ReadAsync())
            {
                cosechas.Add(new SaldoCosechaDto
                {
                    CosechaId = reader.GetInt32(0),
                    EmpresaId = reader.IsDBNull(1) ? null : reader.GetInt32(1),
                    Nombre = reader.GetString(2),
                    Producto = reader.GetString(3),
                    LoteId = reader.GetInt32(4),
                    LoteNombre = reader.IsDBNull(5) ? null : reader.GetString(5),
                    CampaniaId = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                    CampaniaNombre = reader.IsDBNull(7) ? null : reader.GetString(7),
                    Estado = reader.GetString(8),
                    FechaInicio = DateOnly.FromDateTime(reader.GetDateTime(9)),
                    KgCosechados = reader.IsDBNull(10) ? null : reader.GetDecimal(10),
                    KgAlmacenados = reader.GetDecimal(11),
                    KgDistribuidosDirecto = 0,
                });
            }

            return cosechas;
        }
        finally
        {
            if (propia)
            {
                await conn.DisposeAsync();
            }
        }
    }

    public async Task<IReadOnlyList<SiloDestinoDto>> ObtenerSilosDestinoAsync(int empresaId, string producto, int usuarioId, bool incluirTodos)
    {
        var sql = $"""
            SELECT s.SiloId, s.Codigo, s.Nombre, s.TipoSilo, s.Producto, s.EstadoOperativo, s.CapacidadMax, s.CantidadGranoAlmacenado
            FROM dbo.Silos AS s
            WHERE {AccesoSilo}
              AND s.EmpresaId = @EmpresaId
              AND s.EstadoOperativo <> N'Dado de baja'
            ORDER BY s.Nombre;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        AgregarAcceso(command, usuarioId, incluirTodos);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);

        await using var reader = await command.ExecuteReaderAsync();
        var silos = new List<SiloDestinoDto>();
        while (await reader.ReadAsync())
        {
            var silo = new SiloDestinoDto
            {
                SiloId = reader.GetInt32(0),
                Codigo = reader.IsDBNull(1) ? null : reader.GetString(1),
                Nombre = reader.GetString(2),
                TipoSilo = reader.GetString(3),
                Producto = reader.IsDBNull(4) ? null : reader.GetString(4),
                EstadoOperativo = reader.GetString(5),
                CapacidadMax = reader.GetDecimal(6),
                Kg = reader.GetDecimal(7),
            };
            silo.MotivoNoCompatible = MotivoNoApto(silo.EstadoOperativo, silo.Kg, silo.CapacidadMax, silo.Producto, producto);
            silo.Compatible = silo.MotivoNoCompatible is null;
            silos.Add(silo);
        }

        // Primero los que se pueden usar; dentro de ellos, los que ya tienen ese grano.
        return silos
            .OrderBy(s => s.Compatible ? 0 : 1)
            .ThenBy(s => s.Kg > 0 ? 0 : 1)
            .ThenBy(s => s.Nombre)
            .ToList();
    }

    // =====================================================================
    // Registrar
    // =====================================================================

    public async Task<AlmacenamientoDto> RegistrarAsync(CrearAlmacenamientoRequest request, int usuarioId, bool incluirTodos)
    {
        var movimiento = new MovimientoNuevo(
            request.SiloId, request.Fecha, request.TipoMovimiento, request.Cantidad, "Manual",
            request.Observaciones, request.CosechaId, request.Producto, request.Campania, request.Cosecha,
            request.HumedadIngreso, request.Impurezas);

        var almacenamientoId = await RegistrarCoreAsync(movimiento, usuarioId, incluirTodos);
        return (await ObtenerPorIdAsync(almacenamientoId, usuarioId, incluirTodos: true))!;
    }

    public async Task<AlmacenamientoDto> RegistrarMovimientoAutomaticoAsync(
        int siloId, string tipoMovimiento, decimal cantidad, string origen, string? observaciones, int? usuarioId)
    {
        // Movimiento disparado por otro modulo (alta de silo, distribucion): el
        // control de acceso ya lo hizo ese modulo, por eso incluirTodos = true.
        var movimiento = new MovimientoNuevo(
            siloId, DateOnly.FromDateTime(DateTime.Today), tipoMovimiento, cantidad, origen,
            observaciones, CosechaId: null, Producto: null, CampaniaTexto: null, CosechaTexto: null,
            HumedadIngreso: null, Impurezas: null);

        var almacenamientoId = await RegistrarCoreAsync(movimiento, usuarioId ?? 0, incluirTodos: true, usuarioCreadorId: usuarioId);
        return (await ObtenerPorIdAsync(almacenamientoId, usuarioId ?? 0, incluirTodos: true))!;
    }

    private sealed record MovimientoNuevo(
        int SiloId, DateOnly Fecha, string Tipo, decimal Cantidad, string Origen, string? Observaciones,
        int? CosechaId, string? Producto, string? CampaniaTexto, string? CosechaTexto,
        decimal? HumedadIngreso, decimal? Impurezas);

    private async Task<int> RegistrarCoreAsync(MovimientoNuevo mov, int usuarioId, bool incluirTodos, int? usuarioCreadorId = null)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var silo = await BloquearSiloAsync(connection, transaction, mov.SiloId, usuarioId, incluirTodos)
                ?? throw new InvalidOperationException("El silo indicado no existe o no pertenece a tus empresas.");

            await ValidarFechaAsync(connection, transaction, mov.SiloId, mov.Fecha, excluirAlmacenamientoId: null);

            string? producto;
            int? campaniaId = null;
            var campaniaTexto = mov.CampaniaTexto;
            var cosechaTexto = mov.CosechaTexto;

            if (mov.Tipo == "Ingreso")
            {
                if (silo.EstadoOperativo is "En mantenimiento" or "Dado de baja")
                {
                    throw new InvalidOperationException($"El silo {silo.Nombre} esta {silo.EstadoOperativo.ToLowerInvariant()} y no puede recibir grano.");
                }

                if (mov.CosechaId.HasValue)
                {
                    var cosecha = (await ObtenerSaldosCosechaAsync(null, mov.CosechaId, usuarioId, incluirTodos,
                            excluirAlmacenamientoId: null, connection, transaction)).FirstOrDefault()
                        ?? throw new InvalidOperationException("La cosecha indicada no existe o no pertenece a tus empresas.");

                    ValidarCosechaParaIngreso(cosecha, silo, mov.Cantidad, mov.Fecha);
                    producto = cosecha.Producto;
                    campaniaId = cosecha.CampaniaId;
                    campaniaTexto = cosecha.CampaniaNombre;
                    cosechaTexto = cosecha.Nombre;
                }
                else
                {
                    producto = string.IsNullOrWhiteSpace(mov.Producto) ? silo.Producto : mov.Producto.Trim();
                    if (string.IsNullOrWhiteSpace(producto) && mov.Origen == "Manual")
                    {
                        throw new InvalidOperationException("Indica el grano que ingresa al silo o vincula el ingreso a una cosecha.");
                    }
                }

                var motivo = MotivoNoApto(silo.EstadoOperativo, silo.Stock, silo.CapacidadMax, silo.Producto, producto, mov.Cantidad);
                if (motivo is not null)
                {
                    throw new InvalidOperationException(motivo);
                }
            }
            else
            {
                producto = silo.Producto;
                if (mov.Cantidad > silo.Stock)
                {
                    throw new InvalidOperationException(
                        $"La cantidad a retirar supera el stock actual del silo ({silo.Stock:N0} kg).");
                }
            }

            var stockResultante = mov.Tipo == "Ingreso" ? silo.Stock + mov.Cantidad : silo.Stock - mov.Cantidad;

            const string insertSql = """
                INSERT INTO dbo.Almacenamientos
                    (SiloId, EmpresaId, Fecha, TipoMovimiento, Cantidad, StockAnterior, StockResultante, Origen,
                     Observaciones, Campania, Cosecha, Producto, CosechaId, CampaniaId, HumedadIngreso, Impurezas, CreadoPorUsuarioId)
                OUTPUT INSERTED.AlmacenamientoId
                VALUES
                    (@SiloId, @EmpresaId, @Fecha, @TipoMovimiento, @Cantidad, @StockAnterior, @StockResultante, @Origen,
                     @Observaciones, @Campania, @Cosecha, @Producto, @CosechaId, @CampaniaId, @HumedadIngreso, @Impurezas, @CreadoPorUsuarioId);
                """;

            int almacenamientoId;
            await using (var insert = new SqlCommand(insertSql, connection, transaction))
            {
                insert.Parameters.AddWithValue("@SiloId", mov.SiloId);
                insert.Parameters.AddWithValue("@EmpresaId", (object?)silo.EmpresaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@Fecha", mov.Fecha);
                insert.Parameters.AddWithValue("@TipoMovimiento", mov.Tipo);
                insert.Parameters.AddWithValue("@Cantidad", mov.Cantidad);
                insert.Parameters.AddWithValue("@StockAnterior", silo.Stock);
                insert.Parameters.AddWithValue("@StockResultante", stockResultante);
                insert.Parameters.AddWithValue("@Origen", mov.Origen);
                insert.Parameters.AddWithValue("@Observaciones", TextoONull(mov.Observaciones));
                insert.Parameters.AddWithValue("@Campania", TextoONull(campaniaTexto));
                insert.Parameters.AddWithValue("@Cosecha", TextoONull(cosechaTexto));
                insert.Parameters.AddWithValue("@Producto", TextoONull(producto));
                insert.Parameters.AddWithValue("@CosechaId", (object?)mov.CosechaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@HumedadIngreso", mov.Tipo == "Ingreso" ? (object?)mov.HumedadIngreso ?? DBNull.Value : DBNull.Value);
                insert.Parameters.AddWithValue("@Impurezas", mov.Tipo == "Ingreso" ? (object?)mov.Impurezas ?? DBNull.Value : DBNull.Value);
                insert.Parameters.AddWithValue("@CreadoPorUsuarioId", (object?)(usuarioCreadorId ?? (usuarioId > 0 ? usuarioId : null)) ?? DBNull.Value);

                almacenamientoId = (int)(await insert.ExecuteScalarAsync()
                    ?? throw new InvalidOperationException("No se pudo registrar el movimiento de almacenamiento."));
            }

            if (mov.Tipo == "Ingreso")
            {
                await CrearPartidaAsync(connection, transaction, silo.EmpresaId, mov.SiloId, almacenamientoId,
                    mov.CosechaId, campaniaId, producto, mov.Fecha, mov.Cantidad);
            }
            else
            {
                await ConsumirPartidasFifoAsync(connection, transaction, mov.SiloId, almacenamientoId, mov.Cantidad);
            }

            await ActualizarSiloAsync(connection, transaction, mov.SiloId, stockResultante, producto);

            await transaction.CommitAsync();
            return almacenamientoId;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    // =====================================================================
    // Editar (solo el ultimo movimiento manual de cada silo)
    // =====================================================================

    public async Task<bool> ActualizarAsync(int almacenamientoId, ActualizarAlmacenamientoRequest request, int usuarioId, bool incluirTodos)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await ObtenerMovimientoParaEditarAsync(connection, transaction, almacenamientoId, usuarioId, incluirTodos);
            if (actual is null)
            {
                await transaction.RollbackAsync();
                return false;
            }

            if (actual.Origen != "Manual")
            {
                throw new InvalidOperationException("Los movimientos automaticos se corrigen desde su modulo de origen.");
            }

            if (actual.UltimoDelSiloId != almacenamientoId)
            {
                throw new InvalidOperationException("Solo se puede editar el ultimo movimiento registrado para este silo.");
            }

            if (!string.Equals(actual.TipoMovimiento, request.TipoMovimiento, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("No se puede cambiar el tipo de movimiento. Si hace falta, registra un movimiento nuevo.");
            }

            var silo = (await BloquearSiloAsync(connection, transaction, actual.SiloId, usuarioId, incluirTodos))!;
            await ValidarFechaAsync(connection, transaction, actual.SiloId, request.Fecha, excluirAlmacenamientoId: almacenamientoId);

            var producto = actual.Producto;
            decimal stockResultante;

            if (actual.TipoMovimiento == "Ingreso")
            {
                if (actual.CosechaId.HasValue)
                {
                    var cosecha = (await ObtenerSaldosCosechaAsync(null, actual.CosechaId, usuarioId, incluirTodos,
                            excluirAlmacenamientoId: almacenamientoId, connection, transaction)).First();
                    ValidarCosechaParaIngreso(cosecha, silo, request.Cantidad, request.Fecha);
                }
                else if (!string.IsNullOrWhiteSpace(request.Producto))
                {
                    producto = request.Producto.Trim();
                }

                // Capacidad y grano, contra el stock previo a este movimiento.
                var motivo = MotivoNoApto("Con grano", actual.StockAnterior, silo.CapacidadMax,
                    actual.StockAnterior > 0 ? silo.Producto : null, producto, request.Cantidad);
                if (motivo is not null)
                {
                    throw new InvalidOperationException(motivo);
                }

                stockResultante = actual.StockAnterior + request.Cantidad;
                await AjustarPartidaDeIngresoAsync(connection, transaction, almacenamientoId, request.Fecha, request.Cantidad);
            }
            else
            {
                if (request.Cantidad > actual.StockAnterior)
                {
                    throw new InvalidOperationException(
                        $"La cantidad a retirar supera el stock que tenia el silo antes de este movimiento ({actual.StockAnterior:N0} kg).");
                }

                stockResultante = actual.StockAnterior - request.Cantidad;
                await RevertirConsumosAsync(connection, transaction, almacenamientoId);
                await ConsumirPartidasFifoAsync(connection, transaction, actual.SiloId, almacenamientoId, request.Cantidad);
            }

            const string updateSql = """
                UPDATE dbo.Almacenamientos
                SET Fecha = @Fecha,
                    Cantidad = @Cantidad,
                    StockResultante = @StockResultante,
                    Observaciones = @Observaciones,
                    Producto = @Producto,
                    Campania = CASE WHEN CosechaId IS NULL THEN @Campania ELSE Campania END,
                    Cosecha = CASE WHEN CosechaId IS NULL THEN @Cosecha ELSE Cosecha END,
                    HumedadIngreso = CASE WHEN TipoMovimiento = N'Ingreso' THEN @HumedadIngreso ELSE NULL END,
                    Impurezas = CASE WHEN TipoMovimiento = N'Ingreso' THEN @Impurezas ELSE NULL END,
                    FechaModificacion = SYSDATETIME()
                WHERE AlmacenamientoId = @AlmacenamientoId;
                """;

            await using (var update = new SqlCommand(updateSql, connection, transaction))
            {
                update.Parameters.AddWithValue("@Fecha", request.Fecha);
                update.Parameters.AddWithValue("@Cantidad", request.Cantidad);
                update.Parameters.AddWithValue("@StockResultante", stockResultante);
                update.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
                update.Parameters.AddWithValue("@Producto", TextoONull(producto));
                update.Parameters.AddWithValue("@Campania", TextoONull(request.Campania));
                update.Parameters.AddWithValue("@Cosecha", TextoONull(request.Cosecha));
                update.Parameters.AddWithValue("@HumedadIngreso", (object?)request.HumedadIngreso ?? DBNull.Value);
                update.Parameters.AddWithValue("@Impurezas", (object?)request.Impurezas ?? DBNull.Value);
                update.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
                await update.ExecuteNonQueryAsync();
            }

            await ActualizarSiloAsync(connection, transaction, actual.SiloId, stockResultante, producto);

            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    // =====================================================================
    // Helpers de silo, validacion y partidas
    // =====================================================================

    private sealed record SiloBloqueado(
        int SiloId, int? EmpresaId, string Nombre, decimal Stock, decimal CapacidadMax, string? Producto, string EstadoOperativo);

    private static async Task<SiloBloqueado?> BloquearSiloAsync(
        SqlConnection connection, SqlTransaction transaction, int siloId, int usuarioId, bool incluirTodos)
    {
        // UPDLOCK: dos movimientos concurrentes sobre el mismo silo no calculan el mismo stock base.
        var sql = $"""
            SELECT s.SiloId, s.EmpresaId, s.Nombre, s.CantidadGranoAlmacenado, s.CapacidadMax, s.Producto, s.EstadoOperativo
            FROM dbo.Silos AS s WITH (UPDLOCK, ROWLOCK)
            WHERE s.SiloId = @SiloId AND {AccesoSilo};
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@SiloId", siloId);
        AgregarAcceso(command, usuarioId, incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return new SiloBloqueado(
            reader.GetInt32(0),
            reader.IsDBNull(1) ? null : reader.GetInt32(1),
            reader.GetString(2),
            reader.GetDecimal(3),
            reader.GetDecimal(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetString(6));
    }

    private sealed record MovimientoEditable(
        int SiloId, string TipoMovimiento, string Origen, decimal StockAnterior, int? CosechaId, string? Producto, int UltimoDelSiloId);

    private static async Task<MovimientoEditable?> ObtenerMovimientoParaEditarAsync(
        SqlConnection connection, SqlTransaction transaction, int almacenamientoId, int usuarioId, bool incluirTodos)
    {
        var sql = $"""
            SELECT a.SiloId, a.TipoMovimiento, a.Origen, a.StockAnterior, a.CosechaId, a.Producto,
                   (SELECT MAX(x.AlmacenamientoId) FROM dbo.Almacenamientos AS x WHERE x.SiloId = a.SiloId) AS UltimoDelSilo
            FROM dbo.Almacenamientos AS a
            INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
            WHERE a.AlmacenamientoId = @AlmacenamientoId AND {AccesoSilo};
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
        AgregarAcceso(command, usuarioId, incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return new MovimientoEditable(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetDecimal(3),
            reader.IsDBNull(4) ? null : reader.GetInt32(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetInt32(6));
    }

    private static async Task ValidarFechaAsync(
        SqlConnection connection, SqlTransaction transaction, int siloId, DateOnly fecha, int? excluirAlmacenamientoId)
    {
        if (fecha > DateOnly.FromDateTime(DateTime.Today))
        {
            throw new InvalidOperationException("La fecha del movimiento no puede ser posterior a hoy.");
        }

        const string sql = """
            SELECT MAX(Fecha)
            FROM dbo.Almacenamientos
            WHERE SiloId = @SiloId
              AND (@Excluir IS NULL OR AlmacenamientoId <> @Excluir);
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@Excluir", (object?)excluirAlmacenamientoId ?? DBNull.Value);
        var resultado = await command.ExecuteScalarAsync();
        if (resultado is DateTime ultima && fecha < DateOnly.FromDateTime(ultima))
        {
            throw new InvalidOperationException(
                $"La fecha no puede ser anterior al ultimo movimiento del silo ({ultima:dd/MM/yyyy}).");
        }
    }

    private static void ValidarCosechaParaIngreso(SaldoCosechaDto cosecha, SiloBloqueado silo, decimal cantidad, DateOnly fecha)
    {
        if (cosecha.EmpresaId != silo.EmpresaId)
        {
            throw new InvalidOperationException("La cosecha y el silo deben pertenecer a la misma empresa.");
        }

        if (cosecha.KgCosechados is null)
        {
            throw new InvalidOperationException(
                $"La cosecha {cosecha.Nombre} todavia no tiene cantidad cosechada. Finalizala antes de almacenar su grano.");
        }

        if (cantidad > cosecha.KgDisponibles)
        {
            throw new InvalidOperationException(
                $"La cantidad supera el saldo disponible de la cosecha {cosecha.Nombre} ({cosecha.KgDisponibles:N0} kg).");
        }

        if (fecha < cosecha.FechaInicio)
        {
            throw new InvalidOperationException(
                $"La fecha no puede ser anterior al inicio de la cosecha ({cosecha.FechaInicio:dd/MM/yyyy}).");
        }
    }

    private static async Task CrearPartidaAsync(
        SqlConnection connection, SqlTransaction transaction, int? empresaId, int siloId, int ingresoId,
        int? cosechaId, int? campaniaId, string? producto, DateOnly fecha, decimal kg)
    {
        const string sql = """
            INSERT INTO dbo.AlmacenamientoPartidas
                (EmpresaId, SiloId, IngresoAlmacenamientoId, CosechaId, CampaniaId, Producto, FechaIngreso, KgIniciales, KgRestantes)
            VALUES
                (@EmpresaId, @SiloId, @IngresoId, @CosechaId, @CampaniaId, @Producto, @FechaIngreso, @Kg, @Kg);
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", (object?)empresaId ?? DBNull.Value);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@IngresoId", ingresoId);
        command.Parameters.AddWithValue("@CosechaId", (object?)cosechaId ?? DBNull.Value);
        command.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);
        command.Parameters.AddWithValue("@Producto", TextoONull(producto));
        command.Parameters.AddWithValue("@FechaIngreso", fecha);
        command.Parameters.AddWithValue("@Kg", kg);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task AjustarPartidaDeIngresoAsync(
        SqlConnection connection, SqlTransaction transaction, int ingresoId, DateOnly fecha, decimal kg)
    {
        // Es el ultimo movimiento del silo, asi que ningun egreso posterior pudo
        // haber consumido su partida. Igual se verifica por seguridad.
        const string sql = """
            UPDATE p
            SET p.KgIniciales = @Kg, p.KgRestantes = @Kg, p.FechaIngreso = @Fecha, p.FechaModificacion = SYSDATETIME()
            FROM dbo.AlmacenamientoPartidas AS p
            WHERE p.IngresoAlmacenamientoId = @IngresoId
              AND NOT EXISTS (SELECT 1 FROM dbo.AlmacenamientoPartidaConsumos AS c WHERE c.PartidaId = p.PartidaId);
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@Kg", kg);
        command.Parameters.AddWithValue("@Fecha", fecha);
        command.Parameters.AddWithValue("@IngresoId", ingresoId);
        if (await command.ExecuteNonQueryAsync() == 0)
        {
            throw new InvalidOperationException(
                "No se encontro la partida de este ingreso o ya fue consumida. Revisa el reporte de partidas.");
        }
    }

    private static async Task ConsumirPartidasFifoAsync(
        SqlConnection connection, SqlTransaction transaction, int siloId, int almacenamientoId, decimal kg)
    {
        var partidas = new List<(int PartidaId, decimal KgRestantes)>();
        const string selectSql = """
            SELECT PartidaId, KgRestantes
            FROM dbo.AlmacenamientoPartidas WITH (UPDLOCK, ROWLOCK)
            WHERE SiloId = @SiloId AND KgRestantes > 0
            ORDER BY FechaIngreso, PartidaId;
            """;

        await using (var select = new SqlCommand(selectSql, connection, transaction))
        {
            select.Parameters.AddWithValue("@SiloId", siloId);
            await using var reader = await select.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                partidas.Add((reader.GetInt32(0), reader.GetDecimal(1)));
            }
        }

        var pendiente = kg;
        foreach (var (partidaId, disponible) in partidas)
        {
            if (pendiente <= 0)
            {
                break;
            }

            var tomar = Math.Min(disponible, pendiente);
            const string consumoSql = """
                UPDATE dbo.AlmacenamientoPartidas
                SET KgRestantes = KgRestantes - @Kg, FechaModificacion = SYSDATETIME()
                WHERE PartidaId = @PartidaId;

                INSERT INTO dbo.AlmacenamientoPartidaConsumos (PartidaId, AlmacenamientoId, Kg)
                VALUES (@PartidaId, @AlmacenamientoId, @Kg);
                """;

            await using var consumo = new SqlCommand(consumoSql, connection, transaction);
            consumo.Parameters.AddWithValue("@Kg", tomar);
            consumo.Parameters.AddWithValue("@PartidaId", partidaId);
            consumo.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
            await consumo.ExecuteNonQueryAsync();
            pendiente -= tomar;
        }

        if (pendiente > 0)
        {
            throw new InvalidOperationException(
                $"Las partidas del silo no alcanzan para cubrir el egreso (faltan {pendiente:N0} kg). Revisa el reporte de partidas del script 21.");
        }
    }

    private static async Task RevertirConsumosAsync(SqlConnection connection, SqlTransaction transaction, int almacenamientoId)
    {
        const string sql = """
            UPDATE p
            SET p.KgRestantes = p.KgRestantes + c.Kg, p.FechaModificacion = SYSDATETIME()
            FROM dbo.AlmacenamientoPartidas AS p
            INNER JOIN dbo.AlmacenamientoPartidaConsumos AS c ON c.PartidaId = p.PartidaId
            WHERE c.AlmacenamientoId = @AlmacenamientoId;

            DELETE FROM dbo.AlmacenamientoPartidaConsumos WHERE AlmacenamientoId = @AlmacenamientoId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task ActualizarSiloAsync(
        SqlConnection connection, SqlTransaction transaction, int siloId, decimal stockResultante, string? producto)
    {
        // Silo vacio: pierde el grano y queda Vacio. Con stock: toma el grano y queda Con grano.
        // En mantenimiento y Dado de baja no se tocan: son estados que maneja el usuario.
        const string sql = """
            UPDATE dbo.Silos
            SET CantidadGranoAlmacenado = @Stock,
                Producto = CASE WHEN @Stock > 0 THEN COALESCE(@Producto, Producto) ELSE NULL END,
                EstadoOperativo = CASE
                    WHEN EstadoOperativo IN (N'En mantenimiento', N'Dado de baja') THEN EstadoOperativo
                    WHEN @Stock > 0 THEN N'Con grano'
                    ELSE N'Vacio'
                END,
                FechaModificacion = SYSDATETIME()
            WHERE SiloId = @SiloId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@Stock", stockResultante);
        command.Parameters.AddWithValue("@Producto", TextoONull(producto));
        command.Parameters.AddWithValue("@SiloId", siloId);
        await command.ExecuteNonQueryAsync();
    }

    // =====================================================================
    // Utilidades
    // =====================================================================

    private static object TextoONull(string? valor) =>
        string.IsNullOrWhiteSpace(valor) ? DBNull.Value : valor.Trim();

    private static void AgregarAcceso(SqlCommand command, int usuarioId, bool incluirTodos)
    {
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
    }

    /// <summary>
    /// Devuelve por que un silo no puede recibir un grano, o null si puede.
    /// Se usa igual para listar silos destino y para validar el ingreso.
    /// </summary>
    private static string? MotivoNoApto(
        string estadoOperativo, decimal stock, decimal capacidadMax, string? granoSilo, string? granoIngreso, decimal cantidad = 0)
    {
        if (estadoOperativo is "En mantenimiento" or "Dado de baja")
        {
            return estadoOperativo;
        }

        if (stock > 0 && !string.IsNullOrWhiteSpace(granoSilo) && !string.IsNullOrWhiteSpace(granoIngreso)
            && NormalizarGrano(granoSilo) != NormalizarGrano(granoIngreso))
        {
            return $"Contiene {granoSilo}: un silo guarda un solo grano a la vez.";
        }

        var libre = capacidadMax - stock;
        if (libre <= 0)
        {
            return "Sin capacidad libre";
        }

        if (cantidad > libre)
        {
            return $"La cantidad supera la capacidad libre del silo ({libre:N0} kg de {capacidadMax:N0} kg).";
        }

        return null;
    }

    /// <summary>"Maíz", "maiz " y "MAIZ" son el mismo grano.</summary>
    private static string NormalizarGrano(string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor))
        {
            return string.Empty;
        }

        var descompuesto = valor.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(descompuesto.Length);
        foreach (var caracter in descompuesto)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(caracter) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(char.ToLowerInvariant(caracter));
            }
        }

        return builder.ToString();
    }

    private static AlmacenamientoDto Mapear(SqlDataReader reader) => new()
    {
        AlmacenamientoId = reader.GetInt32(0),
        SiloId = reader.GetInt32(1),
        SiloNombre = reader.GetString(2),
        SiloProducto = reader.IsDBNull(3) ? null : reader.GetString(3),
        Fecha = DateOnly.FromDateTime(reader.GetDateTime(4)),
        TipoMovimiento = reader.GetString(5),
        Cantidad = reader.GetDecimal(6),
        StockAnterior = reader.GetDecimal(7),
        StockResultante = reader.GetDecimal(8),
        Origen = reader.GetString(9),
        Observaciones = reader.IsDBNull(10) ? null : reader.GetString(10),
        Campania = reader.IsDBNull(11) ? null : reader.GetString(11),
        Cosecha = reader.IsDBNull(12) ? null : reader.GetString(12),
        Producto = reader.IsDBNull(13) ? null : reader.GetString(13),
        CreadoPorNombre = reader.IsDBNull(14) ? null : reader.GetString(14),
        FechaCreacion = reader.GetDateTime(15),
        FechaModificacion = reader.IsDBNull(16) ? null : reader.GetDateTime(16),
        EmpresaId = reader.IsDBNull(17) ? null : reader.GetInt32(17),
        SiloCodigo = reader.IsDBNull(18) ? null : reader.GetString(18),
        CosechaId = reader.IsDBNull(19) ? null : reader.GetInt32(19),
        CampaniaId = reader.IsDBNull(20) ? null : reader.GetInt32(20),
        HumedadIngreso = reader.IsDBNull(21) ? null : reader.GetDecimal(21),
        Impurezas = reader.IsDBNull(22) ? null : reader.GetDecimal(22),
    };
}
