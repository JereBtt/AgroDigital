using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class LoteRepository(IConfiguration configuration) : ILoteRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<IReadOnlyList<LoteDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos = false)
    {
        const string sql = """
            SELECT
                l.LoteId, l.EmpresaId, l.Nombre, l.Pais, l.Provincia, l.Ciudad, l.Condicion,
                l.Hectareas, l.SuperficieTotal, l.Activo, l.FechaCreacion, l.FechaModificacion,
                c.Orden, c.Latitud, c.Longitud
            FROM dbo.Lotes AS l
            LEFT JOIN dbo.LoteCoordenadas AS c ON c.LoteId = l.LoteId
            WHERE @IncluirTodos = 1
               OR EXISTS (
                    SELECT 1
                    FROM dbo.UsuarioEmpresas AS ue
                    WHERE ue.UsuarioId = @UsuarioId
                      AND ue.EmpresaId = l.EmpresaId
                      AND ue.Activo = 1
               )
            ORDER BY l.LoteId, c.Orden;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        var lotes = new Dictionary<int, LoteDto>();
        while (await reader.ReadAsync())
        {
            var loteId = reader.GetInt32(0);
            if (!lotes.TryGetValue(loteId, out var lote))
            {
                lote = MapearLote(reader);
                lotes.Add(loteId, lote);
            }

            if (!reader.IsDBNull(12))
            {
                lote.Coordenadas.Add(MapearCoordenada(reader, 12));
            }
        }

        return lotes.Values.ToList();
    }

    public async Task<LoteDto?> ObtenerPorIdAsync(int loteId, int usuarioId, bool incluirTodos = false)
    {
        const string sql = """
            SELECT
                l.LoteId, l.EmpresaId, l.Nombre, l.Pais, l.Provincia, l.Ciudad, l.Condicion,
                l.Hectareas, l.SuperficieTotal, l.Activo, l.FechaCreacion, l.FechaModificacion,
                c.Orden, c.Latitud, c.Longitud
            FROM dbo.Lotes AS l
            LEFT JOIN dbo.LoteCoordenadas AS c ON c.LoteId = l.LoteId
            WHERE l.LoteId = @LoteId
              AND (
                    @IncluirTodos = 1
                    OR EXISTS (
                        SELECT 1
                        FROM dbo.UsuarioEmpresas AS ue
                        WHERE ue.UsuarioId = @UsuarioId
                          AND ue.EmpresaId = l.EmpresaId
                          AND ue.Activo = 1
                    )
              )
            ORDER BY c.Orden;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        LoteDto? lote = null;
        while (await reader.ReadAsync())
        {
            lote ??= MapearLote(reader);
            if (!reader.IsDBNull(12))
            {
                lote.Coordenadas.Add(MapearCoordenada(reader, 12));
            }
        }

        return lote;
    }

    public async Task<LoteDto> CrearAsync(CrearLoteRequest request, int usuarioId, bool incluirTodos = false)
    {
        const string insertLoteSql = """
            INSERT INTO dbo.Lotes (EmpresaId, Nombre, Pais, Provincia, Ciudad, Condicion, Hectareas, SuperficieTotal)
            OUTPUT INSERTED.LoteId
            VALUES (@EmpresaId, @Nombre, @Pais, @Provincia, @Ciudad, @Condicion, @Hectareas, @SuperficieTotal);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        try
        {
            var empresaId = await ObtenerEmpresaPrincipalAsync(connection, (SqlTransaction)transaction, usuarioId, incluirTodos);
            await using var command = new SqlCommand(insertLoteSql, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@EmpresaId", empresaId);
            AgregarParametrosLote(command, request);

            var loteId = (int)(await command.ExecuteScalarAsync()
                ?? throw new InvalidOperationException("No se pudo crear el lote."));

            await ReemplazarCoordenadasAsync(connection, (SqlTransaction)transaction, loteId, request.Coordenadas);
            await transaction.CommitAsync();

            return (await ObtenerPorIdAsync(loteId, usuarioId, incluirTodos))!;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> ActualizarAsync(int loteId, ActualizarLoteRequest request, int usuarioId, bool incluirTodos = false)
    {
        const string updateLoteSql = """
            UPDATE l
            SET Nombre = @Nombre,
                Pais = @Pais,
                Provincia = @Provincia,
                Ciudad = @Ciudad,
                Condicion = @Condicion,
                Hectareas = @Hectareas,
                SuperficieTotal = @SuperficieTotal,
                Activo = @Activo,
                FechaModificacion = SYSDATETIME()
            FROM dbo.Lotes AS l
            WHERE l.LoteId = @LoteId
              AND (
                    @IncluirTodos = 1
                    OR EXISTS (
                        SELECT 1
                        FROM dbo.UsuarioEmpresas AS ue
                        WHERE ue.UsuarioId = @UsuarioId
                          AND ue.EmpresaId = l.EmpresaId
                          AND ue.Activo = 1
                    )
              );
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        try
        {
            await using var command = new SqlCommand(updateLoteSql, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@LoteId", loteId);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
            command.Parameters.AddWithValue("@Activo", request.Activo);
            AgregarParametrosLote(command, request);

            var filasAfectadas = await command.ExecuteNonQueryAsync();
            if (filasAfectadas == 0)
            {
                await transaction.RollbackAsync();
                return false;
            }

            await ReemplazarCoordenadasAsync(connection, (SqlTransaction)transaction, loteId, request.Coordenadas);
            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static async Task<int> ObtenerEmpresaPrincipalAsync(SqlConnection connection, SqlTransaction transaction, int usuarioId, bool incluirTodos)
    {
        var sql = incluirTodos
            ? "SELECT TOP (1) EmpresaId FROM dbo.Empresas WHERE Activo = 1 ORDER BY EmpresaId;"
            : """
                SELECT TOP (1) COALESCE(u.EmpresaPrincipalId, ue.EmpresaId)
                FROM dbo.Usuarios AS u
                INNER JOIN dbo.UsuarioEmpresas AS ue ON ue.UsuarioId = u.UsuarioId AND ue.Activo = 1
                WHERE u.UsuarioId = @UsuarioId
                ORDER BY CASE WHEN ue.EmpresaId = u.EmpresaPrincipalId THEN 0 ELSE 1 END, ue.EmpresaId;
                """;

        await using var command = new SqlCommand(sql, connection, transaction);
        if (!incluirTodos)
        {
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        }

        var result = await command.ExecuteScalarAsync();
        if (result is null or DBNull)
        {
            throw new InvalidOperationException("No se encontro una empresa activa para asociar el lote.");
        }

        return Convert.ToInt32(result);
    }

    private static async Task ReemplazarCoordenadasAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        int loteId,
        IEnumerable<LoteCoordenadaDto> coordenadas)
    {
        const string deleteSql = "DELETE FROM dbo.LoteCoordenadas WHERE LoteId = @LoteId;";
        await using (var deleteCommand = new SqlCommand(deleteSql, connection, transaction))
        {
            deleteCommand.Parameters.AddWithValue("@LoteId", loteId);
            await deleteCommand.ExecuteNonQueryAsync();
        }

        const string insertSql = """
            INSERT INTO dbo.LoteCoordenadas (LoteId, Orden, Latitud, Longitud)
            VALUES (@LoteId, @Orden, @Latitud, @Longitud);
            """;

        foreach (var coordenada in coordenadas.OrderBy(c => c.Orden))
        {
            await using var insertCommand = new SqlCommand(insertSql, connection, transaction);
            insertCommand.Parameters.AddWithValue("@LoteId", loteId);
            insertCommand.Parameters.AddWithValue("@Orden", coordenada.Orden);
            insertCommand.Parameters.AddWithValue("@Latitud", coordenada.Latitud);
            insertCommand.Parameters.AddWithValue("@Longitud", coordenada.Longitud);
            await insertCommand.ExecuteNonQueryAsync();
        }
    }

    private static void AgregarParametrosLote(SqlCommand command, CrearLoteRequest request)
    {
        command.Parameters.AddWithValue("@Nombre", request.Nombre.Trim());
        command.Parameters.AddWithValue("@Pais", request.Pais.Trim());
        command.Parameters.AddWithValue("@Provincia", request.Provincia.Trim());
        command.Parameters.AddWithValue("@Ciudad", request.Ciudad.Trim());
        command.Parameters.AddWithValue("@Condicion", request.Condicion.Trim());
        command.Parameters.AddWithValue("@Hectareas", request.Hectareas);
        command.Parameters.AddWithValue("@SuperficieTotal", request.SuperficieTotal);
    }

    private static LoteDto MapearLote(SqlDataReader reader)
    {
        return new LoteDto
        {
            LoteId = reader.GetInt32(0),
            EmpresaId = reader.IsDBNull(1) ? null : reader.GetInt32(1),
            Nombre = reader.GetString(2),
            Pais = reader.GetString(3),
            Provincia = reader.GetString(4),
            Ciudad = reader.GetString(5),
            Condicion = reader.GetString(6),
            Hectareas = reader.GetDecimal(7),
            SuperficieTotal = reader.GetDecimal(8),
            Activo = reader.GetBoolean(9),
            FechaCreacion = reader.GetDateTime(10),
            FechaModificacion = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
            Coordenadas = []
        };
    }

    private static LoteCoordenadaDto MapearCoordenada(SqlDataReader reader, int startIndex)
    {
        return new LoteCoordenadaDto
        {
            Orden = reader.GetInt32(startIndex),
            Latitud = reader.GetDecimal(startIndex + 1),
            Longitud = reader.GetDecimal(startIndex + 2)
        };
    }
}
