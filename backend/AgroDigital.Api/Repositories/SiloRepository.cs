using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class SiloRepository(IConfiguration configuration) : ISiloRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<IReadOnlyList<SiloDto>> ObtenerTodosAsync()
    {
        const string sql = """
            SELECT
                s.SiloId, s.LoteId, l.Nombre AS LoteNombre, s.Nombre, s.TipoSilo, s.CapacidadMax,
                s.Producto, s.CantidadGranoAlmacenado, s.Pais, s.Provincia, s.Ciudad,
                s.Activo, s.FechaCreacion, s.FechaModificacion
            FROM dbo.Silos AS s
            LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
            ORDER BY s.SiloId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var silos = new List<SiloDto>();
        while (await reader.ReadAsync())
        {
            silos.Add(MapearSilo(reader));
        }

        return silos;
    }

    public async Task<SiloDto?> ObtenerPorIdAsync(int siloId)
    {
        const string sql = """
            SELECT
                s.SiloId, s.LoteId, l.Nombre AS LoteNombre, s.Nombre, s.TipoSilo, s.CapacidadMax,
                s.Producto, s.CantidadGranoAlmacenado, s.Pais, s.Provincia, s.Ciudad,
                s.Activo, s.FechaCreacion, s.FechaModificacion
            FROM dbo.Silos AS s
            LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
            WHERE s.SiloId = @SiloId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearSilo(reader) : null;
    }

    public async Task<SiloDto> CrearAsync(CrearSiloRequest request, int? usuarioId)
    {
        const string sql = """
            INSERT INTO dbo.Silos
                (LoteId, Nombre, TipoSilo, CapacidadMax, Producto, CantidadGranoAlmacenado, Pais, Provincia, Ciudad)
            OUTPUT INSERTED.SiloId
            VALUES
                (@LoteId, @Nombre, @TipoSilo, @CapacidadMax, @Producto, @CantidadGranoAlmacenado, @Pais, @Provincia, @Ciudad);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var cantidadInicial = request.CantidadGranoAlmacenado ?? 0;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@LoteId", (object?)request.LoteId ?? DBNull.Value);
        command.Parameters.AddWithValue("@Nombre", request.Nombre.Trim());
        command.Parameters.AddWithValue("@TipoSilo", request.TipoSilo.Trim());
        command.Parameters.AddWithValue("@CapacidadMax", request.CapacidadMax);
        command.Parameters.AddWithValue("@Producto", string.IsNullOrWhiteSpace(request.Producto) ? DBNull.Value : request.Producto.Trim());
        command.Parameters.AddWithValue("@CantidadGranoAlmacenado", cantidadInicial);
        command.Parameters.AddWithValue("@Pais", request.Pais.Trim());
        command.Parameters.AddWithValue("@Provincia", request.Provincia.Trim());
        command.Parameters.AddWithValue("@Ciudad", request.Ciudad.Trim());

        var siloId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo crear el silo."));

        return (await ObtenerPorIdAsync(siloId))!;
    }

    public async Task<bool> ActualizarAsync(int siloId, ActualizarSiloRequest request)
    {
        const string sql = """
            UPDATE dbo.Silos
            SET LoteId = @LoteId,
                Nombre = @Nombre,
                TipoSilo = @TipoSilo,
                CapacidadMax = @CapacidadMax,
                Producto = @Producto,
                Pais = @Pais,
                Provincia = @Provincia,
                Ciudad = @Ciudad,
                Activo = @Activo,
                FechaModificacion = SYSDATETIME()
            WHERE SiloId = @SiloId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@LoteId", (object?)request.LoteId ?? DBNull.Value);
        command.Parameters.AddWithValue("@Nombre", request.Nombre.Trim());
        command.Parameters.AddWithValue("@TipoSilo", request.TipoSilo.Trim());
        command.Parameters.AddWithValue("@CapacidadMax", request.CapacidadMax);
        command.Parameters.AddWithValue("@Producto", string.IsNullOrWhiteSpace(request.Producto) ? DBNull.Value : request.Producto.Trim());
        command.Parameters.AddWithValue("@Pais", request.Pais.Trim());
        command.Parameters.AddWithValue("@Provincia", request.Provincia.Trim());
        command.Parameters.AddWithValue("@Ciudad", request.Ciudad.Trim());
        command.Parameters.AddWithValue("@Activo", request.Activo);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiloControlDto>> ObtenerControlesAsync(int siloId)
    {
        const string sql = """
            SELECT sc.SiloControlId, sc.SiloId, sc.Fecha, sc.HumedadGrano, sc.Temperatura, sc.EstadoGrano,
                   sc.RoturaBolsa, sc.Observaciones,
                   (SELECT COUNT(1) FROM dbo.SiloControlIncidencias AS i WHERE i.SiloControlId = sc.SiloControlId) AS CantidadIncidencias,
                   (SELECT COUNT(1) FROM dbo.SiloControlInsumos AS ins WHERE ins.SiloControlId = sc.SiloControlId) AS CantidadInsumos
            FROM dbo.SiloControles AS sc
            WHERE sc.SiloId = @SiloId
            ORDER BY sc.Fecha DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        await using var reader = await command.ExecuteReaderAsync();

        var controles = new List<SiloControlDto>();
        while (await reader.ReadAsync())
        {
            controles.Add(MapearControl(reader));
        }

        return controles;
    }

    public async Task<SiloControlDto?> ObtenerControlPorIdAsync(int siloId, int controlId)
    {
        const string sql = """
            SELECT sc.SiloControlId, sc.SiloId, sc.Fecha, sc.HumedadGrano, sc.Temperatura, sc.EstadoGrano,
                   sc.RoturaBolsa, sc.Observaciones,
                   (SELECT COUNT(1) FROM dbo.SiloControlIncidencias AS i WHERE i.SiloControlId = sc.SiloControlId) AS CantidadIncidencias,
                   (SELECT COUNT(1) FROM dbo.SiloControlInsumos AS ins WHERE ins.SiloControlId = sc.SiloControlId) AS CantidadInsumos
            FROM dbo.SiloControles AS sc
            WHERE sc.SiloControlId = @ControlId AND sc.SiloId = @SiloId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        command.Parameters.AddWithValue("@SiloId", siloId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearControl(reader) : null;
    }

    public async Task<SiloControlDto?> RegistrarControlAsync(int siloId, CrearSiloControlRequest request, int? usuarioId)
    {
        const string insertSql = """
            INSERT INTO dbo.SiloControles
                (SiloId, Fecha, HumedadGrano, Temperatura, EstadoGrano, RoturaBolsa, Observaciones, CreadoPorUsuarioId)
            OUTPUT INSERTED.SiloControlId
            VALUES
                (@SiloId, @Fecha, @HumedadGrano, @Temperatura, @EstadoGrano, @RoturaBolsa, @Observaciones, @CreadoPorUsuarioId);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var existeSilo = await ExisteSiloAsync(connection, siloId);
        if (!existeSilo) return null;

        await using var command = new SqlCommand(insertSql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@Fecha", request.Fecha ?? DateTime.Now);
        command.Parameters.AddWithValue("@HumedadGrano", request.HumedadGrano);
        command.Parameters.AddWithValue("@Temperatura", request.Temperatura);
        command.Parameters.AddWithValue("@EstadoGrano", request.EstadoGrano.Trim());
        command.Parameters.AddWithValue("@RoturaBolsa", (object?)request.RoturaBolsa ?? DBNull.Value);
        command.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());
        command.Parameters.AddWithValue("@CreadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        var controlId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo registrar el control."));

        return await ObtenerControlPorIdAsync(siloId, controlId);
    }

    public async Task<bool> ActualizarControlAsync(int siloId, int controlId, ActualizarSiloControlRequest request)
    {
        const string sql = """
            UPDATE dbo.SiloControles
            SET Fecha = @Fecha,
                HumedadGrano = @HumedadGrano,
                Temperatura = @Temperatura,
                EstadoGrano = @EstadoGrano,
                RoturaBolsa = @RoturaBolsa,
                Observaciones = @Observaciones
            WHERE SiloControlId = @ControlId AND SiloId = @SiloId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@Fecha", request.Fecha ?? DateTime.Now);
        command.Parameters.AddWithValue("@HumedadGrano", request.HumedadGrano);
        command.Parameters.AddWithValue("@Temperatura", request.Temperatura);
        command.Parameters.AddWithValue("@EstadoGrano", request.EstadoGrano.Trim());
        command.Parameters.AddWithValue("@RoturaBolsa", (object?)request.RoturaBolsa ?? DBNull.Value);
        command.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<string>> ObtenerRutasDocumentosDeControlAsync(int controlId)
    {
        const string sql = "SELECT RutaArchivo FROM dbo.SiloDocumentos WHERE SiloControlId = @ControlId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        await using var reader = await command.ExecuteReaderAsync();

        var rutas = new List<string>();
        while (await reader.ReadAsync())
        {
            rutas.Add(reader.GetString(0));
        }

        return rutas;
    }

    public async Task<bool> EliminarControlAsync(int siloId, int controlId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        await using (var deleteDocs = new SqlCommand("DELETE FROM dbo.SiloDocumentos WHERE SiloControlId = @ControlId;", connection))
        {
            deleteDocs.Parameters.AddWithValue("@ControlId", controlId);
            await deleteDocs.ExecuteNonQueryAsync();
        }

        await using (var deleteInsumos = new SqlCommand("DELETE FROM dbo.SiloControlInsumos WHERE SiloControlId = @ControlId;", connection))
        {
            deleteInsumos.Parameters.AddWithValue("@ControlId", controlId);
            await deleteInsumos.ExecuteNonQueryAsync();
        }

        await using (var deleteIncidencias = new SqlCommand("DELETE FROM dbo.SiloControlIncidencias WHERE SiloControlId = @ControlId;", connection))
        {
            deleteIncidencias.Parameters.AddWithValue("@ControlId", controlId);
            await deleteIncidencias.ExecuteNonQueryAsync();
        }

        await using var deleteControl = new SqlCommand("DELETE FROM dbo.SiloControles WHERE SiloControlId = @ControlId AND SiloId = @SiloId;", connection);
        deleteControl.Parameters.AddWithValue("@ControlId", controlId);
        deleteControl.Parameters.AddWithValue("@SiloId", siloId);

        return await deleteControl.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiloControlIncidenciaDto>> ObtenerIncidenciasAsync(int controlId)
    {
        const string sql = """
            SELECT SiloControlIncidenciaId, SiloControlId, Fecha, TipoPlaga, Observaciones
            FROM dbo.SiloControlIncidencias
            WHERE SiloControlId = @ControlId
            ORDER BY Fecha DESC, SiloControlIncidenciaId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        await using var reader = await command.ExecuteReaderAsync();

        var incidencias = new List<SiloControlIncidenciaDto>();
        while (await reader.ReadAsync())
        {
            incidencias.Add(MapearIncidencia(reader));
        }

        return incidencias;
    }

    public async Task<SiloControlIncidenciaDto> AgregarIncidenciaAsync(int controlId, CrearSiloControlIncidenciaRequest request)
    {
        const string sql = """
            INSERT INTO dbo.SiloControlIncidencias (SiloControlId, TipoPlaga, Observaciones)
            OUTPUT INSERTED.SiloControlIncidenciaId, INSERTED.Fecha
            VALUES (@ControlId, @TipoPlaga, @Observaciones);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        command.Parameters.AddWithValue("@TipoPlaga", request.TipoPlaga.Trim());
        command.Parameters.AddWithValue("@Observaciones", request.Observaciones.Trim());

        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();

        return new SiloControlIncidenciaDto
        {
            SiloControlIncidenciaId = reader.GetInt32(0),
            SiloControlId = controlId,
            Fecha = reader.GetDateTime(1),
            TipoPlaga = request.TipoPlaga.Trim(),
            Observaciones = request.Observaciones.Trim()
        };
    }

    public async Task<bool> EliminarIncidenciaAsync(int controlId, int incidenciaId)
    {
        const string sql = "DELETE FROM dbo.SiloControlIncidencias WHERE SiloControlIncidenciaId = @Id AND SiloControlId = @ControlId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", incidenciaId);
        command.Parameters.AddWithValue("@ControlId", controlId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiloControlInsumoDto>> ObtenerInsumosAsync(int controlId)
    {
        const string sql = """
            SELECT SiloControlInsumoId, SiloControlId, FechaAplicacion, Marca, Tipo, CantidadAplicada
            FROM dbo.SiloControlInsumos
            WHERE SiloControlId = @ControlId
            ORDER BY FechaAplicacion DESC, SiloControlInsumoId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        await using var reader = await command.ExecuteReaderAsync();

        var insumos = new List<SiloControlInsumoDto>();
        while (await reader.ReadAsync())
        {
            insumos.Add(MapearInsumo(reader));
        }

        return insumos;
    }

    public async Task<SiloControlInsumoDto> AgregarInsumoAsync(int controlId, CrearSiloControlInsumoRequest request)
    {
        const string sql = """
            INSERT INTO dbo.SiloControlInsumos (SiloControlId, FechaAplicacion, Marca, Tipo, CantidadAplicada)
            OUTPUT INSERTED.SiloControlInsumoId
            VALUES (@ControlId, @FechaAplicacion, @Marca, @Tipo, @CantidadAplicada);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        command.Parameters.AddWithValue("@FechaAplicacion", request.FechaAplicacion is null ? DBNull.Value : request.FechaAplicacion.Value.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("@Marca", string.IsNullOrWhiteSpace(request.Marca) ? DBNull.Value : request.Marca.Trim());
        command.Parameters.AddWithValue("@Tipo", string.IsNullOrWhiteSpace(request.Tipo) ? DBNull.Value : request.Tipo.Trim());
        command.Parameters.AddWithValue("@CantidadAplicada", (object?)request.CantidadAplicada ?? DBNull.Value);

        var insumoId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo agregar el insumo."));

        return new SiloControlInsumoDto
        {
            SiloControlInsumoId = insumoId,
            SiloControlId = controlId,
            FechaAplicacion = request.FechaAplicacion,
            Marca = request.Marca?.Trim(),
            Tipo = request.Tipo?.Trim(),
            CantidadAplicada = request.CantidadAplicada
        };
    }

    public async Task<bool> EliminarInsumoAsync(int controlId, int insumoId)
    {
        const string sql = "DELETE FROM dbo.SiloControlInsumos WHERE SiloControlInsumoId = @Id AND SiloControlId = @ControlId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", insumoId);
        command.Parameters.AddWithValue("@ControlId", controlId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiloDocumentoDto>> ObtenerDocumentosAsync(int controlId)
    {
        const string sql = """
            SELECT d.SiloDocumentoId, d.NombreArchivo, d.FechaCarga,
                   u.Nombre, u.Apellido
            FROM dbo.SiloDocumentos AS d
            LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = d.CargadoPorUsuarioId
            WHERE d.SiloControlId = @ControlId
            ORDER BY d.FechaCarga DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        await using var reader = await command.ExecuteReaderAsync();

        var documentos = new List<SiloDocumentoDto>();
        while (await reader.ReadAsync())
        {
            var nombre = reader.IsDBNull(3) ? null : reader.GetString(3);
            var apellido = reader.IsDBNull(4) ? null : reader.GetString(4);
            var cargadoPor = string.IsNullOrWhiteSpace(nombre) && string.IsNullOrWhiteSpace(apellido)
                ? null
                : string.Join(' ', new[] { nombre, apellido }.Where(v => !string.IsNullOrWhiteSpace(v)));

            documentos.Add(new SiloDocumentoDto
            {
                SiloDocumentoId = reader.GetInt32(0),
                NombreArchivo = reader.GetString(1),
                FechaCarga = reader.GetDateTime(2),
                CargadoPor = cargadoPor
            });
        }

        return documentos;
    }

    public async Task<SiloDocumentoDto> AgregarDocumentoAsync(int controlId, string nombreArchivo, string rutaArchivo, int? usuarioId)
    {
        const string sql = """
            INSERT INTO dbo.SiloDocumentos (SiloControlId, NombreArchivo, RutaArchivo, CargadoPorUsuarioId)
            OUTPUT INSERTED.SiloDocumentoId, INSERTED.FechaCarga
            VALUES (@ControlId, @NombreArchivo, @RutaArchivo, @CargadoPorUsuarioId);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ControlId", controlId);
        command.Parameters.AddWithValue("@NombreArchivo", nombreArchivo);
        command.Parameters.AddWithValue("@RutaArchivo", rutaArchivo);
        command.Parameters.AddWithValue("@CargadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();

        return new SiloDocumentoDto
        {
            SiloDocumentoId = reader.GetInt32(0),
            NombreArchivo = nombreArchivo,
            FechaCarga = reader.GetDateTime(1),
            CargadoPor = null
        };
    }

    public async Task<string?> ObtenerRutaDocumentoAsync(int controlId, int documentoId)
    {
        const string sql = "SELECT RutaArchivo FROM dbo.SiloDocumentos WHERE SiloDocumentoId = @Id AND SiloControlId = @ControlId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", documentoId);
        command.Parameters.AddWithValue("@ControlId", controlId);

        var result = await command.ExecuteScalarAsync();
        return result as string;
    }

    public async Task<bool> EliminarDocumentoAsync(int controlId, int documentoId)
    {
        const string sql = "DELETE FROM dbo.SiloDocumentos WHERE SiloDocumentoId = @Id AND SiloControlId = @ControlId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", documentoId);
        command.Parameters.AddWithValue("@ControlId", controlId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    private static async Task<bool> ExisteSiloAsync(SqlConnection connection, int siloId)
    {
        const string sql = "SELECT COUNT(1) FROM dbo.Silos WHERE SiloId = @SiloId;";
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync());
        return count > 0;
    }

    private static SiloDto MapearSilo(SqlDataReader reader)
    {
        return new SiloDto
        {
            SiloId = reader.GetInt32(0),
            LoteId = reader.IsDBNull(1) ? null : reader.GetInt32(1),
            LoteNombre = reader.IsDBNull(2) ? null : reader.GetString(2),
            Nombre = reader.GetString(3),
            TipoSilo = reader.GetString(4),
            CapacidadMax = reader.GetDecimal(5),
            Producto = reader.IsDBNull(6) ? null : reader.GetString(6),
            CantidadGranoAlmacenado = reader.GetDecimal(7),
            Pais = reader.GetString(8),
            Provincia = reader.GetString(9),
            Ciudad = reader.GetString(10),
            Activo = reader.GetBoolean(11),
            FechaCreacion = reader.GetDateTime(12),
            FechaModificacion = reader.IsDBNull(13) ? null : reader.GetDateTime(13)
        };
    }

    private static SiloControlDto MapearControl(SqlDataReader reader)
    {
        return new SiloControlDto
        {
            SiloControlId = reader.GetInt32(0),
            SiloId = reader.GetInt32(1),
            Fecha = reader.GetDateTime(2),
            HumedadGrano = reader.GetDecimal(3),
            Temperatura = reader.GetDecimal(4),
            EstadoGrano = reader.GetString(5),
            RoturaBolsa = reader.IsDBNull(6) ? null : reader.GetBoolean(6),
            Observaciones = reader.IsDBNull(7) ? null : reader.GetString(7),
            CantidadIncidencias = reader.GetInt32(8),
            CantidadInsumos = reader.GetInt32(9)
        };
    }

    private static SiloControlIncidenciaDto MapearIncidencia(SqlDataReader reader)
    {
        return new SiloControlIncidenciaDto
        {
            SiloControlIncidenciaId = reader.GetInt32(0),
            SiloControlId = reader.GetInt32(1),
            Fecha = reader.GetDateTime(2),
            TipoPlaga = reader.GetString(3),
            Observaciones = reader.GetString(4)
        };
    }

    private static SiloControlInsumoDto MapearInsumo(SqlDataReader reader)
    {
        return new SiloControlInsumoDto
        {
            SiloControlInsumoId = reader.GetInt32(0),
            SiloControlId = reader.GetInt32(1),
            FechaAplicacion = reader.IsDBNull(2) ? null : DateOnly.FromDateTime(reader.GetDateTime(2)),
            Marca = reader.IsDBNull(3) ? null : reader.GetString(3),
            Tipo = reader.IsDBNull(4) ? null : reader.GetString(4),
            CantidadAplicada = reader.IsDBNull(5) ? null : reader.GetDecimal(5)
        };
    }
}
