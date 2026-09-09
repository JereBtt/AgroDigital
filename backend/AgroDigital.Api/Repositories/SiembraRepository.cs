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
               s.Producto, s.Empresa, s.TipoRegistro, s.SiembraOriginalId, so.Nombre AS SiembraOriginalNombre,
               s.TipoResiembra, s.Siniestro, s.FechaInicio, s.FechaFin, s.FechaFinReal,
               s.JustificacionDesvioFin, s.HectareasHora, s.VariedadSemilla, s.PMG,
               s.DensidadSiembra, s.Profundidad, s.CantidadHectareasTrabajadas, s.UreaKgHa, s.CantidadSemillas,
               s.ResponsableACargo, s.FechaMuestreo, s.FechaAnalisis, s.CantidadMuestras,
               s.ProductoAntecesor, s.ObservacionesPreSiembra, s.EstadoSiembra, s.Estado
        FROM dbo.Siembras AS s
        INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
        LEFT JOIN dbo.Siembras AS so ON so.SiembraId = s.SiembraOriginalId
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
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;
            IF @TipoRegistro <> N'Resiembra' AND EXISTS (
                SELECT 1 FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
                WHERE LoteId = @LoteId AND ISNULL(TipoRegistro, N'Siembra') <> N'Resiembra'
                  AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(@CampaniaNombre, N''))), 9)
            )
                THROW 50001, N'Este lote ya tiene una siembra registrada en este periodo de campaña. Utiliza Registrar resiembra si corresponde.', 1;
            IF @TipoRegistro = N'Resiembra' AND EXISTS (
                SELECT 1 FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
                WHERE LoteId = @LoteId AND TipoRegistro = N'Resiembra'
                  AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(@CampaniaNombre, N''))), 9)
                  
            )
                THROW 50001, N'Este lote ya tiene una resiembra registrada en este periodo de campaña. Solo se permite una.', 1;
            INSERT INTO dbo.Siembras
                (Nombre, LoteId, CampaniaNombre, Producto, Empresa, TipoRegistro, SiembraOriginalId, TipoResiembra, Siniestro,
                 FechaInicio, FechaFin,
                 VariedadSemilla, PMG, DensidadSiembra, Profundidad, CantidadHectareasTrabajadas, UreaKgHa,
                 CantidadSemillas, ResponsableACargo, FechaMuestreo, FechaAnalisis, CantidadMuestras,
                 ProductoAntecesor, ObservacionesPreSiembra, CreadoPorUsuarioId)
            OUTPUT INSERTED.SiembraId
            VALUES
                (@Nombre, @LoteId, @CampaniaNombre, @Producto, @Empresa, @TipoRegistro, @SiembraOriginalId, @TipoResiembra, @Siniestro,
                 @FechaInicio, @FechaFin,
                 @VariedadSemilla, @PMG, @DensidadSiembra, @Profundidad, @CantidadHectareasTrabajadas, @UreaKgHa,
                 @CantidadSemillas, @ResponsableACargo, @FechaMuestreo, @FechaAnalisis, @CantidadMuestras,
                 @ProductoAntecesor, @ObservacionesPreSiembra, @CreadoPorUsuarioId);
            COMMIT TRANSACTION;
            """;

        await using var command = new SqlCommand(insertSql, connection);
        command.Parameters.AddWithValue("@Nombre", nombre);
        AgregarParametrosSiembra(command, request.LoteId, request.CampaniaNombre, request.Producto, request.Empresa,
            request.TipoRegistro, request.SiembraOriginalId, request.TipoResiembra, request.Siniestro,
            request.FechaInicio, request.FechaFin, request.VariedadSemilla, request.PMG, request.DensidadSiembra,
            request.Profundidad, request.CantidadHectareasTrabajadas, request.UreaKgHa, request.CantidadSemillas, request.ResponsableACargo,
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
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;
            IF @TipoRegistro <> N'Resiembra' AND EXISTS (
                SELECT 1 FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
                WHERE LoteId = @LoteId AND SiembraId <> @SiembraId
                  AND ISNULL(TipoRegistro, N'Siembra') <> N'Resiembra'
                  AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(@CampaniaNombre, N''))), 9)
            )
                THROW 50001, N'Este lote ya tiene una siembra registrada en este periodo de campaña. Utiliza Registrar resiembra si corresponde.', 1;
            IF @TipoRegistro = N'Resiembra' AND EXISTS (
                SELECT 1 FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
                WHERE LoteId = @LoteId AND TipoRegistro = N'Resiembra'
                  AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(@CampaniaNombre, N''))), 9)
                  AND SiembraId <> @SiembraId
            )
                THROW 50001, N'Este lote ya tiene una resiembra registrada en este periodo de campaña. Solo se permite una.', 1;
            UPDATE dbo.Siembras
            SET LoteId = @LoteId, CampaniaNombre = @CampaniaNombre, Producto = @Producto, Empresa = @Empresa,
                TipoRegistro = @TipoRegistro, SiembraOriginalId = @SiembraOriginalId,
                TipoResiembra = @TipoResiembra, Siniestro = @Siniestro,
                FechaInicio = @FechaInicio, FechaFin = @FechaFin, VariedadSemilla = @VariedadSemilla, PMG = @PMG,
                DensidadSiembra = @DensidadSiembra, Profundidad = @Profundidad,
                CantidadHectareasTrabajadas = @CantidadHectareasTrabajadas, UreaKgHa = @UreaKgHa, CantidadSemillas = @CantidadSemillas,
                ResponsableACargo = @ResponsableACargo, FechaMuestreo = @FechaMuestreo, FechaAnalisis = @FechaAnalisis,
                CantidadMuestras = @CantidadMuestras, ProductoAntecesor = @ProductoAntecesor,
                ObservacionesPreSiembra = @ObservacionesPreSiembra, FechaModificacion = SYSDATETIME()
            WHERE SiembraId = @SiembraId;
            COMMIT TRANSACTION;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        AgregarParametrosSiembra(command, request.LoteId, request.CampaniaNombre, request.Producto, request.Empresa,
            request.TipoRegistro, request.SiembraOriginalId, request.TipoResiembra, request.Siniestro,
            request.FechaInicio, request.FechaFin, request.VariedadSemilla, request.PMG, request.DensidadSiembra,
            request.Profundidad, request.CantidadHectareasTrabajadas, request.UreaKgHa, request.CantidadSemillas, request.ResponsableACargo,
            request.FechaMuestreo, request.FechaAnalisis, request.CantidadMuestras, request.ProductoAntecesor,
            request.ObservacionesPreSiembra);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<bool> FinalizarSiembraAsync(int siembraId, FinalizarSiembraRequest request)
    {
        const string sql = """
            UPDATE dbo.Siembras
            SET FechaFinReal = @FechaFinReal,
                JustificacionDesvioFin = @JustificacionDesvioFin,
                HectareasHora = @HectareasHora,
                EstadoSiembra = N'Finalizado',
                FechaModificacion = SYSDATETIME()
            WHERE SiembraId = @SiembraId AND EstadoSiembra = N'En curso';

            UPDATE l
            SET CultivoActual = s.Producto,
                EstadoCultivo = N'Cultivado',
                FechaModificacion = SYSDATETIME()
            FROM dbo.Lotes AS l
            INNER JOIN dbo.Siembras AS s ON s.LoteId = l.LoteId
            WHERE s.SiembraId = @SiembraId
              AND s.EstadoSiembra = N'Finalizado';
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        command.Parameters.AddWithValue("@FechaFinReal", request.FechaFinReal);
        command.Parameters.AddWithValue("@JustificacionDesvioFin", string.IsNullOrWhiteSpace(request.JustificacionDesvioFin) ? DBNull.Value : request.JustificacionDesvioFin.Trim());
        command.Parameters.AddWithValue("@HectareasHora", request.HectareasHora);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<SiembraInsumoDto>> ObtenerInsumosAsync(int siembraId)
    {
        const string sql = """
            SELECT SiembraInsumoId, FechaAplicacion, Marca, Tipo, Variedad, CantidadAplicada, UnidadMedida
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
                CantidadAplicada = reader.IsDBNull(5) ? null : reader.GetDecimal(5),
                UnidadMedida = reader.IsDBNull(6) ? null : reader.GetString(6)
            });
        }

        return insumos;
    }

    public async Task<SiembraInsumoDto> AgregarInsumoAsync(int siembraId, CrearSiembraInsumoRequest request)
    {
        const string sql = """
            INSERT INTO dbo.SiembraInsumos (SiembraId, FechaAplicacion, Marca, Tipo, Variedad, CantidadAplicada, UnidadMedida)
            OUTPUT INSERTED.SiembraInsumoId
            VALUES (@SiembraId, @FechaAplicacion, @Marca, @Tipo, @Variedad, @CantidadAplicada, @UnidadMedida);
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
        command.Parameters.AddWithValue("@UnidadMedida", string.IsNullOrWhiteSpace(request.UnidadMedida) ? DBNull.Value : request.UnidadMedida.Trim());

        var insumoId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo agregar el insumo."));

        return new SiembraInsumoDto
        {
            SiembraInsumoId = insumoId,
            FechaAplicacion = request.FechaAplicacion,
            Marca = request.Marca?.Trim(),
            Tipo = request.Tipo?.Trim(),
            Variedad = request.Variedad?.Trim(),
            CantidadAplicada = request.CantidadAplicada,
            UnidadMedida = request.UnidadMedida?.Trim()
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
        string tipoRegistro, int? siembraOriginalId, string? tipoResiembra, string? siniestro,
        DateTime fechaInicio, DateTime fechaFin, string? variedadSemilla, decimal? pmg, decimal? densidadSiembra,
        decimal? profundidad, decimal? cantidadHectareasTrabajadas, decimal? ureaKgHa, decimal? cantidadSemillas, string? responsableACargo,
        DateTime? fechaMuestreo, DateTime? fechaAnalisis, int? cantidadMuestras, string? productoAntecesor,
        string? observacionesPreSiembra)
    {
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@CampaniaNombre", string.IsNullOrWhiteSpace(campaniaNombre) ? DBNull.Value : campaniaNombre.Trim());
        command.Parameters.AddWithValue("@Producto", producto.Trim());
        command.Parameters.AddWithValue("@Empresa", string.IsNullOrWhiteSpace(empresa) ? DBNull.Value : empresa.Trim());
        command.Parameters.AddWithValue("@TipoRegistro", string.IsNullOrWhiteSpace(tipoRegistro) ? "Siembra" : tipoRegistro.Trim());
        command.Parameters.AddWithValue("@SiembraOriginalId", (object?)siembraOriginalId ?? DBNull.Value);
        command.Parameters.AddWithValue("@TipoResiembra", string.IsNullOrWhiteSpace(tipoResiembra) ? DBNull.Value : tipoResiembra.Trim());
        command.Parameters.AddWithValue("@Siniestro", string.IsNullOrWhiteSpace(siniestro) ? DBNull.Value : siniestro.Trim());
        command.Parameters.AddWithValue("@FechaInicio", fechaInicio);
        command.Parameters.AddWithValue("@FechaFin", fechaFin);
        command.Parameters.AddWithValue("@VariedadSemilla", string.IsNullOrWhiteSpace(variedadSemilla) ? DBNull.Value : variedadSemilla.Trim());
        command.Parameters.AddWithValue("@PMG", (object?)pmg ?? DBNull.Value);
        command.Parameters.AddWithValue("@DensidadSiembra", (object?)densidadSiembra ?? DBNull.Value);
        command.Parameters.AddWithValue("@Profundidad", (object?)profundidad ?? DBNull.Value);
        command.Parameters.AddWithValue("@CantidadHectareasTrabajadas", (object?)cantidadHectareasTrabajadas ?? DBNull.Value);
        command.Parameters.AddWithValue("@UreaKgHa", (object?)ureaKgHa ?? DBNull.Value);
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
            TipoRegistro = reader.GetString(7),
            SiembraOriginalId = reader.IsDBNull(8) ? null : reader.GetInt32(8),
            SiembraOriginalNombre = reader.IsDBNull(9) ? null : reader.GetString(9),
            TipoResiembra = reader.IsDBNull(10) ? null : reader.GetString(10),
            Siniestro = reader.IsDBNull(11) ? null : reader.GetString(11),
            FechaInicio = reader.GetDateTime(12),
            FechaFin = reader.GetDateTime(13),
            FechaFinReal = reader.IsDBNull(14) ? null : reader.GetDateTime(14),
            JustificacionDesvioFin = reader.IsDBNull(15) ? null : reader.GetString(15),
            HectareasHora = reader.IsDBNull(16) ? null : reader.GetDecimal(16),
            VariedadSemilla = reader.IsDBNull(17) ? null : reader.GetString(17),
            PMG = reader.IsDBNull(18) ? null : reader.GetDecimal(18),
            DensidadSiembra = reader.IsDBNull(19) ? null : reader.GetDecimal(19),
            Profundidad = reader.IsDBNull(20) ? null : reader.GetDecimal(20),
            CantidadHectareasTrabajadas = reader.IsDBNull(21) ? null : reader.GetDecimal(21),
            UreaKgHa = reader.IsDBNull(22) ? null : reader.GetDecimal(22),
            CantidadSemillas = reader.IsDBNull(23) ? null : reader.GetDecimal(23),
            ResponsableACargo = reader.IsDBNull(24) ? null : reader.GetString(24),
            FechaMuestreo = reader.IsDBNull(25) ? null : reader.GetDateTime(25),
            FechaAnalisis = reader.IsDBNull(26) ? null : reader.GetDateTime(26),
            CantidadMuestras = reader.IsDBNull(27) ? null : reader.GetInt32(27),
            ProductoAntecesor = reader.IsDBNull(28) ? null : reader.GetString(28),
            ObservacionesPreSiembra = reader.IsDBNull(29) ? null : reader.GetString(29),
            EstadoSiembra = reader.IsDBNull(30) ? "En curso" : reader.GetString(30),
            Estado = reader.GetString(31)
        };
    }
}
