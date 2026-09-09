using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public sealed class CampaniaPeriodoDuplicadoException(string message) : InvalidOperationException(message);

public class CampaniaRepository(IConfiguration configuration) : ICampaniaRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<IReadOnlyList<CampaniaConsultaDto>> ObtenerConsultaAsync(int usuarioId, bool incluirTodos = false)
    {
        const string sql = """
            SELECT cc.CampaniaCombinacionId, cc.CampaniaId, c.Nombre, c.Observaciones,
                   c.EmpresaId, e.Nombre AS EmpresaNombre, c.Periodo,
                   cc.LoteId, l.Nombre AS LoteNombre, l.Hectareas, l.Ciudad, ultimo.CultivoAntecesor, cc.Producto,
                   cc.FechaInicio, cc.FechaFin, cc.Estado, cc.EtapaActual
            FROM dbo.CampaniaCombinaciones AS cc
            INNER JOIN dbo.Campanias AS c ON c.CampaniaId = cc.CampaniaId
            LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = c.EmpresaId
            INNER JOIN dbo.Lotes AS l ON l.LoteId = cc.LoteId
            OUTER APPLY (
                SELECT TOP (1) h.Cultivo AS CultivoAntecesor
                FROM (
                    SELECT ccx.Producto AS Cultivo, ccx.FechaInicio, 0 AS OrdenInicial
                    FROM dbo.CampaniaCombinaciones AS ccx
                    WHERE ccx.LoteId = l.LoteId
                      AND ccx.CampaniaCombinacionId <> cc.CampaniaCombinacionId
                    UNION ALL
                    SELECT l.CultivoAnterior, NULL, 1 AS OrdenInicial
                    WHERE NULLIF(LTRIM(RTRIM(l.CultivoAnterior)), N'') IS NOT NULL
                      AND NULLIF(LTRIM(RTRIM(l.CultivoAnteriorCampania)), N'') IS NOT NULL
                      AND LTRIM(RTRIM(l.CultivoAnterior)) <> N'Sin dato'
                      AND LTRIM(RTRIM(l.CultivoAnteriorCampania)) <> N'Sin dato'
                ) AS h
                ORDER BY h.OrdenInicial, h.FechaInicio DESC
            ) AS ultimo
            WHERE @IncluirTodos = 1
               OR EXISTS (
                    SELECT 1
                    FROM dbo.UsuarioEmpresas AS ue
                    WHERE ue.UsuarioId = @UsuarioId
                      AND ue.EmpresaId = l.EmpresaId
                      AND ue.Activo = 1
               )
            ORDER BY c.FechaCreacion DESC, c.CampaniaId DESC, cc.CampaniaCombinacionId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        var items = new List<CampaniaConsultaDto>();
        while (await reader.ReadAsync())
        {
            items.Add(new CampaniaConsultaDto
            {
                CampaniaCombinacionId = reader.GetInt32(0),
                CampaniaId = reader.GetInt32(1),
                CampaniaNombre = reader.GetString(2),
                Observaciones = reader.IsDBNull(3) ? null : reader.GetString(3),
                EmpresaId = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                EmpresaNombre = reader.IsDBNull(5) ? null : reader.GetString(5),
                Periodo = reader.IsDBNull(6) ? null : reader.GetString(6),
                LoteId = reader.GetInt32(7),
                LoteNombre = reader.GetString(8),
                LoteHectareas = reader.IsDBNull(9) ? null : reader.GetDecimal(9),
                LoteZona = reader.IsDBNull(10) ? null : reader.GetString(10),
                CultivoAntecesor = reader.IsDBNull(11) ? null : reader.GetString(11),
                Producto = reader.GetString(12),
                FechaInicio = reader.GetDateTime(13),
                FechaFin = reader.GetDateTime(14),
                Estado = reader.GetString(15),
                EtapaActual = reader.GetString(16)
            });
        }

        return items;
    }

    public async Task<CampaniaDto?> ObtenerPorIdAsync(int campaniaId, int usuarioId, bool incluirTodos = false)
    {
        const string sql = """
            SELECT c.CampaniaId, c.EmpresaId, e.Nombre AS EmpresaNombre, c.Periodo, c.Nombre, c.FechaInicio, c.FechaFin, c.Observaciones, c.FechaCreacion, c.FechaModificacion,
                   cc.CampaniaCombinacionId, cc.LoteId, l.Nombre AS LoteNombre, l.Hectareas, l.Ciudad, ultimo.CultivoAntecesor,
                   cc.Producto, cc.FechaInicio, cc.FechaFin, cc.Estado, cc.EtapaActual
            FROM dbo.Campanias AS c
            LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = c.EmpresaId
            LEFT JOIN dbo.CampaniaCombinaciones AS cc ON cc.CampaniaId = c.CampaniaId
            LEFT JOIN dbo.Lotes AS l ON l.LoteId = cc.LoteId
            OUTER APPLY (
                SELECT TOP (1) h.Cultivo AS CultivoAntecesor
                FROM (
                    SELECT ccx.Producto AS Cultivo, ccx.FechaInicio, 0 AS OrdenInicial
                    FROM dbo.CampaniaCombinaciones AS ccx
                    WHERE ccx.LoteId = l.LoteId
                      AND ccx.CampaniaCombinacionId <> cc.CampaniaCombinacionId
                    UNION ALL
                    SELECT l.CultivoAnterior, NULL, 1 AS OrdenInicial
                    WHERE NULLIF(LTRIM(RTRIM(l.CultivoAnterior)), N'') IS NOT NULL
                      AND NULLIF(LTRIM(RTRIM(l.CultivoAnteriorCampania)), N'') IS NOT NULL
                      AND LTRIM(RTRIM(l.CultivoAnterior)) <> N'Sin dato'
                      AND LTRIM(RTRIM(l.CultivoAnteriorCampania)) <> N'Sin dato'
                ) AS h
                ORDER BY h.OrdenInicial, h.FechaInicio DESC
            ) AS ultimo
            WHERE c.CampaniaId = @CampaniaId
              AND (
                    @IncluirTodos = 1
                    OR EXISTS (
                        SELECT 1
                        FROM dbo.CampaniaCombinaciones AS ccv
                        INNER JOIN dbo.Lotes AS lv ON lv.LoteId = ccv.LoteId
                        INNER JOIN dbo.UsuarioEmpresas AS ue ON ue.EmpresaId = lv.EmpresaId
                        WHERE ccv.CampaniaId = c.CampaniaId
                          AND ue.UsuarioId = @UsuarioId
                          AND ue.Activo = 1
                    )
              )
            ORDER BY cc.CampaniaCombinacionId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CampaniaId", campaniaId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        CampaniaDto? campania = null;
        while (await reader.ReadAsync())
        {
            campania ??= new CampaniaDto
            {
                CampaniaId = reader.GetInt32(0),
                EmpresaId = reader.IsDBNull(1) ? null : reader.GetInt32(1),
                EmpresaNombre = reader.IsDBNull(2) ? null : reader.GetString(2),
                Periodo = reader.IsDBNull(3) ? null : reader.GetString(3),
                Nombre = reader.GetString(4),
                FechaInicio = reader.GetDateTime(5),
                FechaFin = reader.GetDateTime(6),
                Observaciones = reader.IsDBNull(7) ? null : reader.GetString(7),
                FechaCreacion = reader.GetDateTime(8),
                FechaModificacion = reader.IsDBNull(9) ? null : reader.GetDateTime(9)
            };

            if (!reader.IsDBNull(10))
            {
                campania.Combinaciones.Add(new CampaniaCombinacionDto
                {
                    CampaniaCombinacionId = reader.GetInt32(10),
                    CampaniaId = campania.CampaniaId,
                    LoteId = reader.GetInt32(11),
                    LoteNombre = reader.GetString(12),
                    LoteHectareas = reader.IsDBNull(13) ? null : reader.GetDecimal(13),
                    LoteZona = reader.IsDBNull(14) ? null : reader.GetString(14),
                    CultivoAntecesor = reader.IsDBNull(15) ? null : reader.GetString(15),
                    Producto = reader.GetString(16),
                    FechaInicio = reader.GetDateTime(17),
                    FechaFin = reader.GetDateTime(18),
                    Estado = reader.GetString(19),
                    EtapaActual = reader.GetString(20)
                });
            }
        }

        return campania;
    }

    public async Task<CampaniaDto> CrearAsync(CrearCampaniaRequest request, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        try
        {
            var empresaId = await ObtenerEmpresaIdDesdePrimerLoteAsync(connection, (SqlTransaction)transaction, request.Combinaciones[0].LoteId, usuarioId, incluirTodos)
                ?? throw new InvalidOperationException("No se pudo identificar la empresa de la campania.");
            var empresaNombre = await ObtenerEmpresaNombreAsync(connection, (SqlTransaction)transaction, empresaId)
                ?? throw new InvalidOperationException("No se pudo identificar el nombre de la empresa.");
            var periodo = CalcularPeriodoActual();
            await ValidarPeriodoDisponibleAsync(connection, (SqlTransaction)transaction, empresaId, periodo, null, empresaNombre);
            var nombre = GenerarNombreCampania(periodo, empresaNombre);

            const string insertCampaniaSql = """
                INSERT INTO dbo.Campanias (EmpresaId, Periodo, Nombre, FechaInicio, FechaFin, Observaciones, CreadoPorUsuarioId)
                OUTPUT INSERTED.CampaniaId
                VALUES (@EmpresaId, @Periodo, @Nombre, @FechaInicio, @FechaFin, @Observaciones, @CreadoPorUsuarioId);
                """;

            await using var command = new SqlCommand(insertCampaniaSql, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@EmpresaId", empresaId);
            command.Parameters.AddWithValue("@Periodo", periodo);
            command.Parameters.AddWithValue("@Nombre", nombre);
            command.Parameters.AddWithValue("@FechaInicio", request.FechaInicio);
            command.Parameters.AddWithValue("@FechaFin", request.FechaFin);
            command.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());
            command.Parameters.AddWithValue("@CreadoPorUsuarioId", usuarioId);

            var campaniaId = (int)(await command.ExecuteScalarAsync()
                ?? throw new InvalidOperationException("No se pudo registrar la campania."));

            await InsertarCombinacionesAsync(connection, (SqlTransaction)transaction, campaniaId, request.Combinaciones, usuarioId, incluirTodos);
            await transaction.CommitAsync();

            return (await ObtenerPorIdAsync(campaniaId, usuarioId, incluirTodos))!;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> ActualizarAsync(int campaniaId, ActualizarCampaniaRequest request, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        try
        {
            var existe = await ObtenerPorIdAsync(campaniaId, usuarioId, incluirTodos);
            if (existe is null) return false;
            if (existe.EmpresaId is null) throw new InvalidOperationException("No se pudo identificar la empresa de la campania.");

            var empresaNombre = await ObtenerEmpresaNombreAsync(connection, (SqlTransaction)transaction, existe.EmpresaId.Value)
                ?? existe.EmpresaNombre
                ?? "empresa seleccionada";
            var periodo = CalcularPeriodoActual();
            await ValidarPeriodoDisponibleAsync(connection, (SqlTransaction)transaction, existe.EmpresaId.Value, periodo, campaniaId, empresaNombre);
            var nombre = GenerarNombreCampania(periodo, empresaNombre);

            const string updateSql = """
                UPDATE dbo.Campanias
                SET Periodo = @Periodo,
                    Nombre = @Nombre,
                    FechaInicio = @FechaInicio,
                    FechaFin = @FechaFin,
                    Observaciones = @Observaciones,
                    FechaModificacion = SYSDATETIME()
                WHERE CampaniaId = @CampaniaId;

                DELETE FROM dbo.CampaniaCombinaciones WHERE CampaniaId = @CampaniaId;
                """;

            await using var command = new SqlCommand(updateSql, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@CampaniaId", campaniaId);
            command.Parameters.AddWithValue("@Periodo", periodo);
            command.Parameters.AddWithValue("@Nombre", nombre);
            command.Parameters.AddWithValue("@FechaInicio", request.FechaInicio);
            command.Parameters.AddWithValue("@FechaFin", request.FechaFin);
            command.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());
            await command.ExecuteNonQueryAsync();

            await InsertarCombinacionesAsync(connection, (SqlTransaction)transaction, campaniaId, request.Combinaciones, usuarioId, incluirTodos);
            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static string GenerarNombreCampania(string periodo, string empresaNombre)
    {
        return $"{periodo} {empresaNombre.Trim()}";
    }

    private static string CalcularPeriodoActual()
    {
        var hoy = DateTime.Today;
        var inicio = hoy.Month >= 6 ? hoy.Year : hoy.Year - 1;
        return $"{inicio}-{inicio + 1}";
    }

    private static async Task<string?> ObtenerEmpresaNombreAsync(SqlConnection connection, SqlTransaction transaction, int empresaId)
    {
        const string sql = "SELECT Nombre FROM dbo.Empresas WHERE EmpresaId = @EmpresaId;";
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        var result = await command.ExecuteScalarAsync();
        return result is null or DBNull ? null : (string)result;
    }

    private static async Task ValidarPeriodoDisponibleAsync(SqlConnection connection, SqlTransaction transaction, int empresaId, string periodo, int? excluirCampaniaId, string empresaNombre)
    {
        const string sql = """
            SELECT COUNT(1)
            FROM dbo.Campanias
            WHERE EmpresaId = @EmpresaId
              AND Periodo = @Periodo
              AND (@ExcluirCampaniaId IS NULL OR CampaniaId <> @ExcluirCampaniaId);
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@Periodo", periodo);
        command.Parameters.AddWithValue("@ExcluirCampaniaId", excluirCampaniaId is null ? DBNull.Value : excluirCampaniaId.Value);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0);
        if (count > 0)
        {
            throw new CampaniaPeriodoDuplicadoException($"Ya existe una campania para {empresaNombre} en el periodo {periodo}. Solo se puede cargar una campania por empresa entre junio de {periodo[..4]} y junio de {periodo[5..]}.");
        }
    }

    private static async Task<int?> ObtenerEmpresaIdDesdePrimerLoteAsync(SqlConnection connection, SqlTransaction transaction, int loteId, int usuarioId, bool incluirTodos)
    {
        const string sql = """
            SELECT l.EmpresaId
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

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        var result = await command.ExecuteScalarAsync();
        return result is null or DBNull ? null : (int)result;
    }

    private static async Task InsertarCombinacionesAsync(SqlConnection connection, SqlTransaction transaction, int campaniaId, IEnumerable<CrearCampaniaCombinacionRequest> combinaciones, int usuarioId, bool incluirTodos)
    {
        const string insertSql = """
            INSERT INTO dbo.CampaniaCombinaciones (CampaniaId, LoteId, Producto, FechaInicio, FechaFin)
            SELECT @CampaniaId, l.LoteId, @Producto, @FechaInicio, @FechaFin
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

        foreach (var item in combinaciones)
        {
            await using var command = new SqlCommand(insertSql, connection, transaction);
            command.Parameters.AddWithValue("@CampaniaId", campaniaId);
            command.Parameters.AddWithValue("@LoteId", item.LoteId);
            command.Parameters.AddWithValue("@Producto", item.Producto.Trim());
            command.Parameters.AddWithValue("@FechaInicio", item.FechaInicio);
            command.Parameters.AddWithValue("@FechaFin", item.FechaFin);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);

            if (await command.ExecuteNonQueryAsync() == 0)
            {
                throw new InvalidOperationException("Uno de los lotes seleccionados no existe o no pertenece al usuario.");
            }

            const string updateLoteSql = """
                UPDATE dbo.Lotes
                SET CultivoActual = @Producto,
                    EstadoCultivo = N'Pendiente',
                    FechaModificacion = SYSDATETIME()
                WHERE LoteId = @LoteId;
                """;

            await using var updateLoteCommand = new SqlCommand(updateLoteSql, connection, transaction);
            updateLoteCommand.Parameters.AddWithValue("@LoteId", item.LoteId);
            updateLoteCommand.Parameters.AddWithValue("@Producto", item.Producto.Trim());
            await updateLoteCommand.ExecuteNonQueryAsync();
        }
    }
}
