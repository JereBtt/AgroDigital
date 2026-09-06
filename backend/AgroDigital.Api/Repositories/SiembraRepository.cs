using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class SiembraRepository(IConfiguration configuration) : ISiembraRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectSiembraColumns = """
        SELECT s.SiembraId, s.Nombre, s.LoteId, l.Nombre AS LoteNombre, s.CampaniaNombre,
               s.Producto, s.Empresa, s.FechaInicio, s.FechaFin, s.VariedadSemilla, s.PMG,
               s.DensidadSiembra, s.Profundidad, s.CantidadHectareasTrabajadas, s.CantidadSemillas,
               s.ResponsableACargo, s.FechaMuestreo, s.FechaAnalisis, s.CantidadMuestras,
               s.ProductoAntecesor, s.ObservacionesPreSiembra, s.Estado
        FROM dbo.Siembras AS s
        INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
        """;

    public async Task<IReadOnlyList<SiembraDto>> ObtenerTodosAsync()
    {
        var sql = SelectSiembraColumns + " ORDER BY s.FechaCreacion DESC;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var siembras = new List<SiembraDto>();
        while (await reader.ReadAsync())
        {
            siembras.Add(MapearSiembra(reader));
        }

        return siembras;
    }

    public async Task<SiembraDto?> ObtenerPorIdAsync(int siembraId)
    {
        var sql = SelectSiembraColumns + " WHERE s.SiembraId = @SiembraId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearSiembra(reader) : null;
    }

    public async Task<SiembraDto> CrearAsync(CrearSiembraRequest request, int? usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var nombre = await GenerarSiguienteNombreAsync(connection);

        const string insertSql = """
            INSERT INTO dbo.Siembras
                (Nombre, LoteId, CampaniaNombre, Producto, Empresa, FechaInicio, FechaFin,
                 VariedadSemilla, PMG, DensidadSiembra, Profundidad, CantidadHectareasTrabajadas,
                 CantidadSemillas, ResponsableACargo, FechaMuestreo, FechaAnalisis, CantidadMuestras,
                 ProductoAntecesor, ObservacionesPreSiembra, CreadoPorUsuarioId)
            OUTPUT INSERTED.SiembraId
            VALUES
                (@Nombre, @LoteId, @CampaniaNombre, @Producto, @Empresa, @FechaInicio, @FechaFin,
                 @VariedadSemilla, @PMG, @DensidadSiembra, @Profundidad, @CantidadHectareasTrabajadas,
                 @CantidadSemillas, @ResponsableACargo, @FechaMuestreo, @FechaAnalisis, @CantidadMuestras,
                 @ProductoAntecesor, @ObservacionesPreSiembra, @CreadoPorUsuarioId);
            """;

        await using var command = new SqlCommand(insertSql, connection);
        command.Parameters.AddWithValue("@Nombre", nombre);
        AgregarParametrosSiembra(command, request.LoteId, request.CampaniaNombre, request.Producto, request.Empresa,
            request.FechaInicio, request.FechaFin, request.VariedadSemilla, request.PMG, request.DensidadSiembra,
            request.Profundidad, request.CantidadHectareasTrabajadas, request.CantidadSemillas, request.ResponsableACargo,
            request.FechaMuestreo, request.FechaAnalisis, request.CantidadMuestras, request.ProductoAntecesor,
            request.ObservacionesPreSiembra);
        command.Parameters.AddWithValue("@CreadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        var siembraId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo registrar la siembra."));

        return (await ObtenerPorIdAsync(siembraId))!;
    }

    public async Task<bool> ActualizarAsync(int siembraId, ActualizarSiembraRequest request)
    {
        const string sql = """
            UPDATE dbo.Siembras
            SET LoteId = @LoteId, CampaniaNombre = @CampaniaNombre, Producto = @Producto, Empresa = @Empresa,
                FechaInicio = @FechaInicio, FechaFin = @FechaFin, VariedadSemilla = @VariedadSemilla, PMG = @PMG,
                DensidadSiembra = @DensidadSiembra, Profundidad = @Profundidad,
                CantidadHectareasTrabajadas = @CantidadHectareasTrabajadas, CantidadSemillas = @CantidadSemillas,
                ResponsableACargo = @ResponsableACargo, FechaMuestreo = @FechaMuestreo, FechaAnalisis = @FechaAnalisis,
                CantidadMuestras = @CantidadMuestras, ProductoAntecesor = @ProductoAntecesor,
                ObservacionesPreSiembra = @ObservacionesPreSiembra, FechaModificacion = SYSDATETIME()
            WHERE SiembraId = @SiembraId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        AgregarParametrosSiembra(command, request.LoteId, request.CampaniaNombre, request.Producto, request.Empresa,
            request.FechaInicio, request.FechaFin, request.VariedadSemilla, request.PMG, request.DensidadSiembra,
            request.Profundidad, request.CantidadHectareasTrabajadas, request.CantidadSemillas, request.ResponsableACargo,
            request.FechaMuestreo, request.FechaAnalisis, request.CantidadMuestras, request.ProductoAntecesor,
            request.ObservacionesPreSiembra);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiembraInsumoDto>> ObtenerInsumosAsync(int siembraId)
    {
        const string sql = """
            SELECT SiembraInsumoId, FechaAplicacion, Marca, Tipo, Variedad, CantidadAplicada
            FROM dbo.SiembraInsumos
            WHERE SiembraId = @SiembraId
            ORDER BY FechaAplicacion DESC, SiembraInsumoId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        await using var reader = await command.ExecuteReaderAsync();

        var insumos = new List<SiembraInsumoDto>();
        while (await reader.ReadAsync())
        {
            insumos.Add(new SiembraInsumoDto
            {
                SiembraInsumoId = reader.GetInt32(0),
                FechaAplicacion = reader.IsDBNull(1) ? null : DateOnly.FromDateTime(reader.GetDateTime(1)),
                Marca = reader.IsDBNull(2) ? null : reader.GetString(2),
                Tipo = reader.IsDBNull(3) ? null : reader.GetString(3),
                Variedad = reader.IsDBNull(4) ? null : reader.GetString(4),
                CantidadAplicada = reader.IsDBNull(5) ? null : reader.GetDecimal(5)
            });
        }

        return insumos;
    }

    public async Task<SiembraInsumoDto> AgregarInsumoAsync(int siembraId, CrearSiembraInsumoRequest request)
    {
        const string sql = """
            INSERT INTO dbo.SiembraInsumos (SiembraId, FechaAplicacion, Marca, Tipo, Variedad, CantidadAplicada)
            OUTPUT INSERTED.SiembraInsumoId
            VALUES (@SiembraId, @FechaAplicacion, @Marca, @Tipo, @Variedad, @CantidadAplicada);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        command.Parameters.AddWithValue("@FechaAplicacion", request.FechaAplicacion is null ? DBNull.Value : request.FechaAplicacion.Value.ToDateTime(TimeOnly.MinValue));
        command.Parameters.AddWithValue("@Marca", string.IsNullOrWhiteSpace(request.Marca) ? DBNull.Value : request.Marca.Trim());
        command.Parameters.AddWithValue("@Tipo", string.IsNullOrWhiteSpace(request.Tipo) ? DBNull.Value : request.Tipo.Trim());
        command.Parameters.AddWithValue("@Variedad", string.IsNullOrWhiteSpace(request.Variedad) ? DBNull.Value : request.Variedad.Trim());
        command.Parameters.AddWithValue("@CantidadAplicada", (object?)request.CantidadAplicada ?? DBNull.Value);

        var insumoId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo agregar el insumo."));

        return new SiembraInsumoDto
        {
            SiembraInsumoId = insumoId,
            FechaAplicacion = request.FechaAplicacion,
            Marca = request.Marca?.Trim(),
            Tipo = request.Tipo?.Trim(),
            Variedad = request.Variedad?.Trim(),
            CantidadAplicada = request.CantidadAplicada
        };
    }

    public async Task<bool> EliminarInsumoAsync(int siembraId, int insumoId)
    {
        const string sql = "DELETE FROM dbo.SiembraInsumos WHERE SiembraInsumoId = @Id AND SiembraId = @SiembraId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", insumoId);
        command.Parameters.AddWithValue("@SiembraId", siembraId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiembraDocumentoDto>> ObtenerDocumentosAsync(int siembraId)
    {
        const string sql = """
            SELECT d.SiembraDocumentoId, d.NombreArchivo, d.FechaCarga, u.Nombre, u.Apellido
            FROM dbo.SiembraDocumentos AS d
            LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = d.CargadoPorUsuarioId
            WHERE d.SiembraId = @SiembraId
            ORDER BY d.FechaCarga DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        await using var reader = await command.ExecuteReaderAsync();

        var documentos = new List<SiembraDocumentoDto>();
        while (await reader.ReadAsync())
        {
            var nombre = reader.IsDBNull(3) ? null : reader.GetString(3);
            var apellido = reader.IsDBNull(4) ? null : reader.GetString(4);
            var cargadoPor = string.IsNullOrWhiteSpace(nombre) && string.IsNullOrWhiteSpace(apellido)
                ? null
                : string.Join(' ', new[] { nombre, apellido }.Where(v => !string.IsNullOrWhiteSpace(v)));

            documentos.Add(new SiembraDocumentoDto
            {
                SiembraDocumentoId = reader.GetInt32(0),
                NombreArchivo = reader.GetString(1),
                FechaCarga = reader.GetDateTime(2),
                CargadoPor = cargadoPor
            });
        }

        return documentos;
    }

    public async Task<SiembraDocumentoDto> AgregarDocumentoAsync(int siembraId, string nombreArchivo, string rutaArchivo, int? usuarioId)
    {
        const string sql = """
            INSERT INTO dbo.SiembraDocumentos (SiembraId, NombreArchivo, RutaArchivo, CargadoPorUsuarioId)
            OUTPUT INSERTED.SiembraDocumentoId, INSERTED.FechaCarga
            VALUES (@SiembraId, @NombreArchivo, @RutaArchivo, @CargadoPorUsuarioId);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        command.Parameters.AddWithValue("@NombreArchivo", nombreArchivo);
        command.Parameters.AddWithValue("@RutaArchivo", rutaArchivo);
        command.Parameters.AddWithValue("@CargadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();

        return new SiembraDocumentoDto
        {
            SiembraDocumentoId = reader.GetInt32(0),
            NombreArchivo = nombreArchivo,
            FechaCarga = reader.GetDateTime(1),
            CargadoPor = null
        };
    }

    public async Task<string?> ObtenerRutaDocumentoAsync(int siembraId, int documentoId)
    {
        const string sql = "SELECT RutaArchivo FROM dbo.SiembraDocumentos WHERE SiembraDocumentoId = @Id AND SiembraId = @SiembraId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", documentoId);
        command.Parameters.AddWithValue("@SiembraId", siembraId);

        var result = await command.ExecuteScalarAsync();
        return result as string;
    }

    public async Task<bool> EliminarDocumentoAsync(int siembraId, int documentoId)
    {
        const string sql = "DELETE FROM dbo.SiembraDocumentos WHERE SiembraDocumentoId = @Id AND SiembraId = @SiembraId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", documentoId);
        command.Parameters.AddWithValue("@SiembraId", siembraId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    private static async Task<string> GenerarSiguienteNombreAsync(SqlConnection connection)
    {
        const string sql = """
            SELECT ISNULL(MAX(TRY_CAST(RIGHT(Nombre, 4) AS INT)), 0) + 1
            FROM dbo.Siembras;
            """;

        await using var command = new SqlCommand(sql, connection);
        var siguiente = (int)(await command.ExecuteScalarAsync() ?? 1);
        return $"SIEM - {siguiente:D4}";
    }

    private static void AgregarParametrosSiembra(
        SqlCommand command, int loteId, string? campaniaNombre, string producto, string? empresa,
        DateTime fechaInicio, DateTime fechaFin, string? variedadSemilla, decimal? pmg, decimal? densidadSiembra,
        decimal? profundidad, decimal? cantidadHectareasTrabajadas, decimal? cantidadSemillas, string? responsableACargo,
        DateTime? fechaMuestreo, DateTime? fechaAnalisis, int? cantidadMuestras, string? productoAntecesor,
        string? observacionesPreSiembra)
    {
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@CampaniaNombre", string.IsNullOrWhiteSpace(campaniaNombre) ? DBNull.Value : campaniaNombre.Trim());
        command.Parameters.AddWithValue("@Producto", producto.Trim());
        command.Parameters.AddWithValue("@Empresa", string.IsNullOrWhiteSpace(empresa) ? DBNull.Value : empresa.Trim());
        command.Parameters.AddWithValue("@FechaInicio", fechaInicio);
        command.Parameters.AddWithValue("@FechaFin", fechaFin);
        command.Parameters.AddWithValue("@VariedadSemilla", string.IsNullOrWhiteSpace(variedadSemilla) ? DBNull.Value : variedadSemilla.Trim());
        command.Parameters.AddWithValue("@PMG", (object?)pmg ?? DBNull.Value);
        command.Parameters.AddWithValue("@DensidadSiembra", (object?)densidadSiembra ?? DBNull.Value);
        command.Parameters.AddWithValue("@Profundidad", (object?)profundidad ?? DBNull.Value);
        command.Parameters.AddWithValue("@CantidadHectareasTrabajadas", (object?)cantidadHectareasTrabajadas ?? DBNull.Value);
        command.Parameters.AddWithValue("@CantidadSemillas", (object?)cantidadSemillas ?? DBNull.Value);
        command.Parameters.AddWithValue("@ResponsableACargo", string.IsNullOrWhiteSpace(responsableACargo) ? DBNull.Value : responsableACargo.Trim());
        command.Parameters.AddWithValue("@FechaMuestreo", (object?)fechaMuestreo ?? DBNull.Value);
        command.Parameters.AddWithValue("@FechaAnalisis", (object?)fechaAnalisis ?? DBNull.Value);
        command.Parameters.AddWithValue("@CantidadMuestras", (object?)cantidadMuestras ?? DBNull.Value);
        command.Parameters.AddWithValue("@ProductoAntecesor", string.IsNullOrWhiteSpace(productoAntecesor) ? DBNull.Value : productoAntecesor.Trim());
        command.Parameters.AddWithValue("@ObservacionesPreSiembra", string.IsNullOrWhiteSpace(observacionesPreSiembra) ? DBNull.Value : observacionesPreSiembra.Trim());
    }

    private static SiembraDto MapearSiembra(SqlDataReader reader)
    {
        return new SiembraDto
        {
            SiembraId = reader.GetInt32(0),
            Nombre = reader.GetString(1),
            LoteId = reader.GetInt32(2),
            LoteNombre = reader.GetString(3),
            CampaniaNombre = reader.IsDBNull(4) ? null : reader.GetString(4),
            Producto = reader.GetString(5),
            Empresa = reader.IsDBNull(6) ? null : reader.GetString(6),
            FechaInicio = reader.GetDateTime(7),
            FechaFin = reader.GetDateTime(8),
            VariedadSemilla = reader.IsDBNull(9) ? null : reader.GetString(9),
            PMG = reader.IsDBNull(10) ? null : reader.GetDecimal(10),
            DensidadSiembra = reader.IsDBNull(11) ? null : reader.GetDecimal(11),
            Profundidad = reader.IsDBNull(12) ? null : reader.GetDecimal(12),
            CantidadHectareasTrabajadas = reader.IsDBNull(13) ? null : reader.GetDecimal(13),
            CantidadSemillas = reader.IsDBNull(14) ? null : reader.GetDecimal(14),
            ResponsableACargo = reader.IsDBNull(15) ? null : reader.GetString(15),
            FechaMuestreo = reader.IsDBNull(16) ? null : reader.GetDateTime(16),
            FechaAnalisis = reader.IsDBNull(17) ? null : reader.GetDateTime(17),
            CantidadMuestras = reader.IsDBNull(18) ? null : reader.GetInt32(18),
            ProductoAntecesor = reader.IsDBNull(19) ? null : reader.GetString(19),
            ObservacionesPreSiembra = reader.IsDBNull(20) ? null : reader.GetString(20),
            Estado = reader.GetString(21)
        };
    }
}
