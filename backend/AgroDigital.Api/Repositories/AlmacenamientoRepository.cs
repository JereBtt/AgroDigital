using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class AlmacenamientoRepository(IConfiguration configuration) : IAlmacenamientoRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectBase = """
        SELECT
            a.AlmacenamientoId, a.SiloId, s.Nombre AS SiloNombre, s.Producto AS SiloProducto,
            a.Fecha, a.TipoMovimiento, a.Cantidad, a.StockAnterior, a.StockResultante,
            a.Origen, a.Observaciones, a.Campania, a.Cosecha, u.Nombre + ' ' + u.Apellido AS CreadoPorNombre,
            a.FechaCreacion, a.FechaModificacion
        FROM dbo.Almacenamientos AS a
        INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
        LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = a.CreadoPorUsuarioId
        """;

    public async Task<IReadOnlyList<AlmacenamientoDto>> ObtenerTodosAsync()
    {
        var sql = SelectBase + " ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var movimientos = new List<AlmacenamientoDto>();
        while (await reader.ReadAsync())
        {
            movimientos.Add(Mapear(reader));
        }

        return movimientos;
    }

    public async Task<AlmacenamientoDto?> ObtenerPorIdAsync(int almacenamientoId)
    {
        var sql = SelectBase + " WHERE a.AlmacenamientoId = @AlmacenamientoId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? Mapear(reader) : null;
    }

    public async Task<IReadOnlyList<AlmacenamientoDto>> ObtenerPorSiloAsync(int siloId)
    {
        var sql = SelectBase + " WHERE a.SiloId = @SiloId ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        await using var reader = await command.ExecuteReaderAsync();

        var movimientos = new List<AlmacenamientoDto>();
        while (await reader.ReadAsync())
        {
            movimientos.Add(Mapear(reader));
        }

        return movimientos;
    }

    public async Task<AlmacenamientoDto> RegistrarAsync(CrearAlmacenamientoRequest request, int? usuarioId)
    {
        return await InsertarMovimientoAsync(
            request.SiloId, request.TipoMovimiento, request.Cantidad,
            origen: "Manual", request.Observaciones, request.Campania, request.Cosecha, usuarioId);
    }

    public async Task<AlmacenamientoDto> RegistrarMovimientoAutomaticoAsync(
        int siloId, string tipoMovimiento, decimal cantidad, string origen, string? observaciones, int? usuarioId)
    {
        return await InsertarMovimientoAsync(siloId, tipoMovimiento, cantidad, origen, observaciones, campania: null, cosecha: null, usuarioId);
    }

    private async Task<AlmacenamientoDto> InsertarMovimientoAsync(
        int siloId, string tipoMovimiento, decimal cantidad, string origen, string? observaciones, string? campania, string? cosecha, int? usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            // Bloquea la fila del silo hasta el commit para que dos movimientos
            // concurrentes sobre el mismo silo no calculen el mismo stock base.
            const string selectStockSql = """
                SELECT CantidadGranoAlmacenado, CapacidadMax
                FROM dbo.Silos WITH (UPDLOCK, ROWLOCK)
                WHERE SiloId = @SiloId;
                """;

            decimal stockAnterior;
            decimal capacidadMax;
            await using (var selectCommand = new SqlCommand(selectStockSql, connection, transaction))
            {
                selectCommand.Parameters.AddWithValue("@SiloId", siloId);
                await using var reader = await selectCommand.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                {
                    throw new InvalidOperationException("El silo indicado no existe.");
                }
                stockAnterior = reader.GetDecimal(0);
                capacidadMax = reader.GetDecimal(1);
            }

            var stockResultante = tipoMovimiento == "Ingreso"
                ? stockAnterior + cantidad
                : stockAnterior - cantidad;

            if (tipoMovimiento == "Ingreso" && stockResultante > capacidadMax)
            {
                throw new InvalidOperationException(
                    $"La cantidad a almacenar supera la capacidad disponible del silo. Capacidad maxima: {capacidadMax:N0} kg, stock actual: {stockAnterior:N0} kg, disponible: {capacidadMax - stockAnterior:N0} kg.");
            }

            if (stockResultante < 0)
            {
                throw new InvalidOperationException(
                    "La cantidad a retirar supera el stock actual del silo.");
            }

            const string insertSql = """
                INSERT INTO dbo.Almacenamientos
                    (SiloId, Fecha, TipoMovimiento, Cantidad, StockAnterior, StockResultante, Origen, Observaciones, Campania, Cosecha, CreadoPorUsuarioId)
                OUTPUT INSERTED.AlmacenamientoId
                VALUES
                    (@SiloId, @Fecha, @TipoMovimiento, @Cantidad, @StockAnterior, @StockResultante, @Origen, @Observaciones, @Campania, @Cosecha, @CreadoPorUsuarioId);
                """;

            int almacenamientoId;
            await using (var insertCommand = new SqlCommand(insertSql, connection, transaction))
            {
                insertCommand.Parameters.AddWithValue("@SiloId", siloId);
                insertCommand.Parameters.AddWithValue("@Fecha", DateOnly.FromDateTime(DateTime.Today));
                insertCommand.Parameters.AddWithValue("@TipoMovimiento", tipoMovimiento);
                insertCommand.Parameters.AddWithValue("@Cantidad", cantidad);
                insertCommand.Parameters.AddWithValue("@StockAnterior", stockAnterior);
                insertCommand.Parameters.AddWithValue("@StockResultante", stockResultante);
                insertCommand.Parameters.AddWithValue("@Origen", origen);
                insertCommand.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(observaciones) ? DBNull.Value : observaciones.Trim());
                insertCommand.Parameters.AddWithValue("@Campania", string.IsNullOrWhiteSpace(campania) ? DBNull.Value : campania.Trim());
                insertCommand.Parameters.AddWithValue("@Cosecha", string.IsNullOrWhiteSpace(cosecha) ? DBNull.Value : cosecha.Trim());
                insertCommand.Parameters.AddWithValue("@CreadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

                almacenamientoId = (int)(await insertCommand.ExecuteScalarAsync()
                    ?? throw new InvalidOperationException("No se pudo registrar el movimiento de almacenamiento."));
            }

            const string updateSiloSql = """
                UPDATE dbo.Silos
                SET CantidadGranoAlmacenado = @StockResultante,
                    FechaModificacion = SYSDATETIME()
                WHERE SiloId = @SiloId;
                """;

            await using (var updateCommand = new SqlCommand(updateSiloSql, connection, transaction))
            {
                updateCommand.Parameters.AddWithValue("@StockResultante", stockResultante);
                updateCommand.Parameters.AddWithValue("@SiloId", siloId);
                await updateCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();

            return (await ObtenerPorIdAsync(almacenamientoId))!;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> ActualizarAsync(int almacenamientoId, ActualizarAlmacenamientoRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            const string selectSql = """
                SELECT TOP (1) a.SiloId, a.AlmacenamientoId
                FROM dbo.Almacenamientos AS a
                WHERE a.SiloId = (SELECT SiloId FROM dbo.Almacenamientos WHERE AlmacenamientoId = @AlmacenamientoId)
                ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC;
                """;

            int siloId;
            int ultimoMovimientoId;
            await using (var selectCommand = new SqlCommand(selectSql, connection, transaction))
            {
                selectCommand.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
                await using var reader = await selectCommand.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                {
                    await transaction.RollbackAsync();
                    return false;
                }

                siloId = reader.GetInt32(0);
                ultimoMovimientoId = reader.GetInt32(1);
            }

            // Simplificacion deliberada: solo se puede editar el ultimo
            // movimiento cargado sobre ese silo. Editar un movimiento en
            // medio del historico obligaria a recalcular en cadena el
            // StockAnterior/StockResultante de todos los movimientos
            // posteriores; se deja fuera de este alcance inicial.
            if (ultimoMovimientoId != almacenamientoId)
            {
                await transaction.RollbackAsync();
                throw new InvalidOperationException(
                    "Solo se puede editar el ultimo movimiento registrado para este silo.");
            }

            const string selectMovimientoSql = """
                SELECT a.StockAnterior, s.CapacidadMax
                FROM dbo.Almacenamientos AS a
                INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
                WHERE a.AlmacenamientoId = @AlmacenamientoId;
                """;

            decimal stockAnterior;
            decimal capacidadMax;
            await using (var selectMovCommand = new SqlCommand(selectMovimientoSql, connection, transaction))
            {
                selectMovCommand.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
                await using var movReader = await selectMovCommand.ExecuteReaderAsync();
                await movReader.ReadAsync();
                stockAnterior = movReader.GetDecimal(0);
                capacidadMax = movReader.GetDecimal(1);
            }

            var stockResultante = request.TipoMovimiento == "Ingreso"
                ? stockAnterior + request.Cantidad
                : stockAnterior - request.Cantidad;

            if (request.TipoMovimiento == "Ingreso" && stockResultante > capacidadMax)
            {
                await transaction.RollbackAsync();
                throw new InvalidOperationException(
                    $"La cantidad a almacenar supera la capacidad disponible del silo. Capacidad maxima: {capacidadMax:N0} kg, stock previo a este movimiento: {stockAnterior:N0} kg, disponible: {capacidadMax - stockAnterior:N0} kg.");
            }

            if (stockResultante < 0)
            {
                await transaction.RollbackAsync();
                throw new InvalidOperationException(
                    "La cantidad a retirar supera el stock disponible del silo.");
            }

            const string updateSql = """
                UPDATE dbo.Almacenamientos
                SET Fecha = @Fecha,
                    TipoMovimiento = @TipoMovimiento,
                    Cantidad = @Cantidad,
                    StockResultante = @StockResultante,
                    Observaciones = @Observaciones,
                    Campania = @Campania,
                    Cosecha = @Cosecha,
                    FechaModificacion = SYSDATETIME()
                WHERE AlmacenamientoId = @AlmacenamientoId;
                """;

            int filasAfectadas;
            await using (var updateCommand = new SqlCommand(updateSql, connection, transaction))
            {
                updateCommand.Parameters.AddWithValue("@Fecha", request.Fecha);
                updateCommand.Parameters.AddWithValue("@TipoMovimiento", request.TipoMovimiento);
                updateCommand.Parameters.AddWithValue("@Cantidad", request.Cantidad);
                updateCommand.Parameters.AddWithValue("@StockResultante", stockResultante);
                updateCommand.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());
                updateCommand.Parameters.AddWithValue("@Campania", string.IsNullOrWhiteSpace(request.Campania) ? DBNull.Value : request.Campania.Trim());
                updateCommand.Parameters.AddWithValue("@Cosecha", string.IsNullOrWhiteSpace(request.Cosecha) ? DBNull.Value : request.Cosecha.Trim());
                updateCommand.Parameters.AddWithValue("@AlmacenamientoId", almacenamientoId);
                filasAfectadas = await updateCommand.ExecuteNonQueryAsync();
            }

            const string updateSiloSql = """
                UPDATE dbo.Silos
                SET CantidadGranoAlmacenado = @StockResultante,
                    FechaModificacion = SYSDATETIME()
                WHERE SiloId = @SiloId;
                """;

            await using (var updateSiloCommand = new SqlCommand(updateSiloSql, connection, transaction))
            {
                updateSiloCommand.Parameters.AddWithValue("@StockResultante", stockResultante);
                updateSiloCommand.Parameters.AddWithValue("@SiloId", siloId);
                await updateSiloCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return filasAfectadas > 0;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
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
        CreadoPorNombre = reader.IsDBNull(13) ? null : reader.GetString(13),
        FechaCreacion = reader.GetDateTime(14),
        FechaModificacion = reader.IsDBNull(15) ? null : reader.GetDateTime(15),
    };
}
