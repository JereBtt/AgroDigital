using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class SeguimientoRepository(IConfiguration configuration) : ISeguimientoRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectSeguimientoColumns = """
        SELECT SiembraSeguimientoId, SiembraId, Fecha, Longitud, Latitud, Incidencia,
               PerdidaEconomica, AplicacionAgroquimicos, Observaciones
        FROM dbo.SiembraSeguimientos
        """;

    public async Task<IReadOnlyList<SiembraSeguimientoDto>> ObtenerTodosAsync(int siembraId)
    {
        var sql = SelectSeguimientoColumns + " WHERE SiembraId = @SiembraId ORDER BY Fecha DESC, SiembraSeguimientoId DESC;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        await using var reader = await command.ExecuteReaderAsync();

        var seguimientos = new List<SiembraSeguimientoDto>();
        while (await reader.ReadAsync())
        {
            seguimientos.Add(MapearSeguimiento(reader));
        }

        return seguimientos;
    }

    public async Task<SiembraSeguimientoDto?> ObtenerPorIdAsync(int siembraId, int seguimientoId)
    {
        var sql = SelectSeguimientoColumns + " WHERE SiembraSeguimientoId = @Id AND SiembraId = @SiembraId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearSeguimiento(reader) : null;
    }

    public async Task<SiembraSeguimientoDto?> CrearAsync(int siembraId, CrearSiembraSeguimientoRequest request)
    {
        const string insertSql = """
            INSERT INTO dbo.SiembraSeguimientos
                (SiembraId, Fecha, Longitud, Latitud, Incidencia, PerdidaEconomica, AplicacionAgroquimicos, Observaciones)
            OUTPUT INSERTED.SiembraSeguimientoId
            VALUES
                (@SiembraId, @Fecha, @Longitud, @Latitud, @Incidencia, @PerdidaEconomica, @AplicacionAgroquimicos, @Observaciones);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var existeSiembra = await ExisteSiembraAsync(connection, siembraId);
        if (!existeSiembra) return null;

        await using (var command = new SqlCommand(insertSql, connection))
        {
            command.Parameters.AddWithValue("@SiembraId", siembraId);
            command.Parameters.AddWithValue("@Fecha", request.Fecha ?? DateTime.Now);
            command.Parameters.AddWithValue("@Longitud", (object?)request.Longitud ?? DBNull.Value);
            command.Parameters.AddWithValue("@Latitud", (object?)request.Latitud ?? DBNull.Value);
            command.Parameters.AddWithValue("@Incidencia", string.IsNullOrWhiteSpace(request.Incidencia) ? DBNull.Value : request.Incidencia.Trim());
            command.Parameters.AddWithValue("@PerdidaEconomica", (object?)request.PerdidaEconomica ?? DBNull.Value);
            command.Parameters.AddWithValue("@AplicacionAgroquimicos", (object?)request.AplicacionAgroquimicos ?? DBNull.Value);
            command.Parameters.AddWithValue("@Observaciones", request.Observaciones.Trim());

            var seguimientoId = (int)(await command.ExecuteScalarAsync()
                ?? throw new InvalidOperationException("No se pudo registrar la recorrida."));

            // Primer seguimiento de la siembra: pasa de Pendiente a En curso.
            const string updateEstadoSql = """
                UPDATE dbo.Siembras
                SET Estado = N'En curso'
                WHERE SiembraId = @SiembraId AND Estado = N'Pendiente';
                """;
            await using (var updateCommand = new SqlCommand(updateEstadoSql, connection))
            {
                updateCommand.Parameters.AddWithValue("@SiembraId", siembraId);
                await updateCommand.ExecuteNonQueryAsync();
            }

            return await ObtenerPorIdAsync(siembraId, seguimientoId);
        }
    }

    public async Task<bool> ActualizarAsync(int siembraId, int seguimientoId, ActualizarSiembraSeguimientoRequest request)
    {
        const string sql = """
            UPDATE dbo.SiembraSeguimientos
            SET Fecha = @Fecha, Longitud = @Longitud, Latitud = @Latitud, Incidencia = @Incidencia,
                PerdidaEconomica = @PerdidaEconomica, AplicacionAgroquimicos = @AplicacionAgroquimicos,
                Observaciones = @Observaciones
            WHERE SiembraSeguimientoId = @Id AND SiembraId = @SiembraId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        command.Parameters.AddWithValue("@Fecha", request.Fecha ?? DateTime.Now);
        command.Parameters.AddWithValue("@Longitud", (object?)request.Longitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@Latitud", (object?)request.Latitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@Incidencia", string.IsNullOrWhiteSpace(request.Incidencia) ? DBNull.Value : request.Incidencia.Trim());
        command.Parameters.AddWithValue("@PerdidaEconomica", (object?)request.PerdidaEconomica ?? DBNull.Value);
        command.Parameters.AddWithValue("@AplicacionAgroquimicos", (object?)request.AplicacionAgroquimicos ?? DBNull.Value);
        command.Parameters.AddWithValue("@Observaciones", request.Observaciones.Trim());

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<string>> ObtenerRutasDocumentosDeSeguimientoAsync(int seguimientoId)
    {
        const string sql = "SELECT RutaArchivo FROM dbo.SeguimientoDocumentos WHERE SiembraSeguimientoId = @Id;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        await using var reader = await command.ExecuteReaderAsync();

        var rutas = new List<string>();
        while (await reader.ReadAsync())
        {
            rutas.Add(reader.GetString(0));
        }

        return rutas;
    }

    public async Task<bool> EliminarAsync(int siembraId, int seguimientoId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        await using (var deleteDocs = new SqlCommand("DELETE FROM dbo.SeguimientoDocumentos WHERE SiembraSeguimientoId = @Id;", connection))
        {
            deleteDocs.Parameters.AddWithValue("@Id", seguimientoId);
            await deleteDocs.ExecuteNonQueryAsync();
        }

        await using (var deleteInsumos = new SqlCommand("DELETE FROM dbo.SeguimientoInsumos WHERE SiembraSeguimientoId = @Id;", connection))
        {
            deleteInsumos.Parameters.AddWithValue("@Id", seguimientoId);
            await deleteInsumos.ExecuteNonQueryAsync();
        }

        await using var deleteSeguimiento = new SqlCommand("DELETE FROM dbo.SiembraSeguimientos WHERE SiembraSeguimientoId = @Id AND SiembraId = @SiembraId;", connection);
        deleteSeguimiento.Parameters.AddWithValue("@Id", seguimientoId);
        deleteSeguimiento.Parameters.AddWithValue("@SiembraId", siembraId);

        return await deleteSeguimiento.ExecuteNonQueryAsync() > 0;
    }

    public async Task<bool> FinalizarAsync(int siembraId)
    {
        const string sql = "UPDATE dbo.Siembras SET Estado = N'Finalizado' WHERE SiembraId = @SiembraId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SeguimientoInsumoDto>> ObtenerInsumosAsync(int seguimientoId)
    {
        const string sql = """
            SELECT SeguimientoInsumoId, FechaAplicacion, Marca, Tipo, Variedad, CantidadAplicada
            FROM dbo.SeguimientoInsumos
            WHERE SiembraSeguimientoId = @Id
            ORDER BY SeguimientoInsumoId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        await using var reader = await command.ExecuteReaderAsync();

        var insumos = new List<SeguimientoInsumoDto>();
        while (await reader.ReadAsync())
        {
            insumos.Add(new SeguimientoInsumoDto
            {
                SeguimientoInsumoId = reader.GetInt32(0),
                FechaAplicacion = reader.IsDBNull(1) ? null : DateOnly.FromDateTime(reader.GetDateTime(1)),
                Marca = reader.IsDBNull(2) ? null : reader.GetString(2),
                Tipo = reader.IsDBNull(3) ? null : reader.GetString(3),
                Variedad = reader.IsDBNull(4) ? null : reader.GetString(4),
                CantidadAplicada = reader.IsDBNull(5) ? null : reader.GetDecimal(5)
            });
        }

        return insumos;
    }

    public async Task<SeguimientoInsumoDto> AgregarInsumoAsync(int seguimientoId, CrearSeguimientoInsumoRequest request)
    {
        const string sql = """
            INSERT INTO dbo.SeguimientoInsumos (SiembraSeguimientoId, FechaAplicacion, Marca, Tipo, Variedad, CantidadAplicada)
            OUTPUT INSERTED.SeguimientoInsumoId
            VALUES (@Id, @FechaAplicacion, @Marca, @Tipo, @Variedad, @CantidadAplicada);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        command.Parameters.AddWithValue("@FechaAplicacion", request.FechaAplicacion is null ? DBNull.Value : request.FechaAplicacion.Value.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("@Marca", string.IsNullOrWhiteSpace(request.Marca) ? DBNull.Value : request.Marca.Trim());
        command.Parameters.AddWithValue("@Tipo", string.IsNullOrWhiteSpace(request.Tipo) ? DBNull.Value : request.Tipo.Trim());
        command.Parameters.AddWithValue("@Variedad", string.IsNullOrWhiteSpace(request.Variedad) ? DBNull.Value : request.Variedad.Trim());
        command.Parameters.AddWithValue("@CantidadAplicada", (object?)request.CantidadAplicada ?? DBNull.Value);

        var insumoId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo agregar el insumo."));

        return new SeguimientoInsumoDto
        {
            SeguimientoInsumoId = insumoId,
            FechaAplicacion = request.FechaAplicacion,
            Marca = request.Marca?.Trim(),
            Tipo = request.Tipo?.Trim(),
            Variedad = request.Variedad?.Trim(),
            CantidadAplicada = request.CantidadAplicada
        };
    }

    public async Task<bool> EliminarInsumoAsync(int seguimientoId, int insumoId)
    {
        const string sql = "DELETE FROM dbo.SeguimientoInsumos WHERE SeguimientoInsumoId = @InsumoId AND SiembraSeguimientoId = @Id;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@InsumoId", insumoId);
        command.Parameters.AddWithValue("@Id", seguimientoId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SeguimientoDocumentoDto>> ObtenerDocumentosAsync(int seguimientoId)
    {
        const string sql = """
            SELECT d.SeguimientoDocumentoId, d.NombreArchivo, d.FechaCarga, u.Nombre, u.Apellido
            FROM dbo.SeguimientoDocumentos AS d
            LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = d.CargadoPorUsuarioId
            WHERE d.SiembraSeguimientoId = @Id
            ORDER BY d.FechaCarga DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        await using var reader = await command.ExecuteReaderAsync();

        var documentos = new List<SeguimientoDocumentoDto>();
        while (await reader.ReadAsync())
        {
            var nombre = reader.IsDBNull(3) ? null : reader.GetString(3);
            var apellido = reader.IsDBNull(4) ? null : reader.GetString(4);
            var cargadoPor = string.IsNullOrWhiteSpace(nombre) && string.IsNullOrWhiteSpace(apellido)
                ? null
                : string.Join(' ', new[] { nombre, apellido }.Where(v => !string.IsNullOrWhiteSpace(v)));

            documentos.Add(new SeguimientoDocumentoDto
            {
                SeguimientoDocumentoId = reader.GetInt32(0),
                NombreArchivo = reader.GetString(1),
                FechaCarga = reader.GetDateTime(2),
                CargadoPor = cargadoPor
            });
        }

        return documentos;
    }

    public async Task<SeguimientoDocumentoDto> AgregarDocumentoAsync(int seguimientoId, string nombreArchivo, string rutaArchivo, int? usuarioId)
    {
        const string sql = """
            INSERT INTO dbo.SeguimientoDocumentos (SiembraSeguimientoId, NombreArchivo, RutaArchivo, CargadoPorUsuarioId)
            OUTPUT INSERTED.SeguimientoDocumentoId, INSERTED.FechaCarga
            VALUES (@Id, @NombreArchivo, @RutaArchivo, @CargadoPorUsuarioId);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", seguimientoId);
        command.Parameters.AddWithValue("@NombreArchivo", nombreArchivo);
        command.Parameters.AddWithValue("@RutaArchivo", rutaArchivo);
        command.Parameters.AddWithValue("@CargadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();

        return new SeguimientoDocumentoDto
        {
            SeguimientoDocumentoId = reader.GetInt32(0),
            NombreArchivo = nombreArchivo,
            FechaCarga = reader.GetDateTime(1),
            CargadoPor = null
        };
    }

    public async Task<string?> ObtenerRutaDocumentoAsync(int seguimientoId, int documentoId)
    {
        const string sql = "SELECT RutaArchivo FROM dbo.SeguimientoDocumentos WHERE SeguimientoDocumentoId = @DocId AND SiembraSeguimientoId = @Id;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@DocId", documentoId);
        command.Parameters.AddWithValue("@Id", seguimientoId);

        var result = await command.ExecuteScalarAsync();
        return result as string;
    }

    public async Task<bool> EliminarDocumentoAsync(int seguimientoId, int documentoId)
    {
        const string sql = "DELETE FROM dbo.SeguimientoDocumentos WHERE SeguimientoDocumentoId = @DocId AND SiembraSeguimientoId = @Id;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@DocId", documentoId);
        command.Parameters.AddWithValue("@Id", seguimientoId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    private static async Task<bool> ExisteSiembraAsync(SqlConnection connection, int siembraId)
    {
        const string sql = "SELECT COUNT(1) FROM dbo.Siembras WHERE SiembraId = @SiembraId;";
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync());
        return count > 0;
    }

    private static SiembraSeguimientoDto MapearSeguimiento(SqlDataReader reader)
    {
        return new SiembraSeguimientoDto
        {
            SiembraSeguimientoId = reader.GetInt32(0),
            SiembraId = reader.GetInt32(1),
            Fecha = reader.GetDateTime(2),
            Longitud = reader.IsDBNull(3) ? null : reader.GetDecimal(3),
            Latitud = reader.IsDBNull(4) ? null : reader.GetDecimal(4),
            Incidencia = reader.IsDBNull(5) ? null : reader.GetString(5),
            PerdidaEconomica = reader.IsDBNull(6) ? null : reader.GetBoolean(6),
            AplicacionAgroquimicos = reader.IsDBNull(7) ? null : reader.GetBoolean(7),
            Observaciones = reader.GetString(8)
        };
    }
}
