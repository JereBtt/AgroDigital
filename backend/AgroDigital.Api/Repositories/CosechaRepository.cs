using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class CosechaRepository(IConfiguration configuration) : ICosechaRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectCosechaColumns = """
        SELECT c.CosechaId, c.Nombre, c.SiembraId, s.Nombre AS SiembraNombre,
               c.LoteId, l.Nombre AS LoteNombre, c.CampaniaNombre, c.Producto, c.Empresa,
               c.FechaInicio, c.FechaFin, c.FechaFinReal, c.JustificacionDesvioFin,
               c.CantidadGranoCosechado, c.CantidadHectareasTrabajadas,
               c.HumedadGrano, c.Impurezas, c.ResponsableACargo, c.RindeKgHa, c.Estado
        FROM dbo.Cosechas AS c
        INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
        LEFT JOIN dbo.Siembras AS s ON s.SiembraId = c.SiembraId
        """;

    public async Task<IReadOnlyList<CosechaDto>> ObtenerTodosAsync()
    {
        var sql = SelectCosechaColumns + " ORDER BY c.FechaCreacion DESC, c.CosechaId DESC;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var cosechas = new List<CosechaDto>();
        while (await reader.ReadAsync())
        {
            cosechas.Add(MapearCosecha(reader));
        }

        return cosechas;
    }

    public async Task<CosechaDto?> ObtenerPorIdAsync(int cosechaId)
    {
        var sql = SelectCosechaColumns + " WHERE c.CosechaId = @CosechaId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearCosecha(reader) : null;
    }

    public async Task<CosechaDto> CrearAsync(CrearCosechaRequest request, int? usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var nombre = await GenerarSiguienteNombreAsync(connection);
        var rinde = CalcularRinde(request);

        const string insertSql = """
            INSERT INTO dbo.Cosechas
                (Nombre, SiembraId, LoteId, CampaniaNombre, Producto, Empresa, FechaInicio, FechaFin,
                 FechaFinReal, JustificacionDesvioFin, CantidadGranoCosechado, CantidadHectareasTrabajadas,
                 HumedadGrano, Impurezas, ResponsableACargo, RindeKgHa, Estado, CreadoPorUsuarioId)
            OUTPUT INSERTED.CosechaId
            VALUES
                (@Nombre, @SiembraId, @LoteId, @CampaniaNombre, @Producto, @Empresa, @FechaInicio, @FechaFin,
                 @FechaFinReal, @JustificacionDesvioFin, @CantidadGranoCosechado, @CantidadHectareasTrabajadas,
                 @HumedadGrano, @Impurezas, @ResponsableACargo, @RindeKgHa, N'En curso', @CreadoPorUsuarioId);
            """;

        await using var command = new SqlCommand(insertSql, connection);
        command.Parameters.AddWithValue("@Nombre", nombre);
        AgregarParametros(command, request, rinde);
        command.Parameters.AddWithValue("@CreadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        var cosechaId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo registrar la cosecha."));

        return (await ObtenerPorIdAsync(cosechaId))!;
    }

    public async Task<bool> ActualizarAsync(int cosechaId, ActualizarCosechaRequest request)
    {
        var rinde = CalcularRinde(request);

        const string sql = """
            UPDATE dbo.Cosechas
            SET SiembraId = @SiembraId, LoteId = @LoteId, CampaniaNombre = @CampaniaNombre,
                Producto = @Producto, Empresa = @Empresa, FechaInicio = @FechaInicio, FechaFin = @FechaFin,
                FechaFinReal = @FechaFinReal, JustificacionDesvioFin = @JustificacionDesvioFin,
                CantidadGranoCosechado = @CantidadGranoCosechado,
                CantidadHectareasTrabajadas = @CantidadHectareasTrabajadas,
                HumedadGrano = @HumedadGrano, Impurezas = @Impurezas,
                ResponsableACargo = @ResponsableACargo, RindeKgHa = @RindeKgHa,
                FechaModificacion = SYSDATETIME()
            WHERE CosechaId = @CosechaId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        AgregarParametros(command, request, rinde);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<bool> FinalizarAsync(int cosechaId, FinalizarCosechaRequest request)
    {
        var rinde = CalcularRinde(request);

        const string sql = """
            UPDATE dbo.Cosechas
            SET FechaFinReal = @FechaFinReal,
                JustificacionDesvioFin = @JustificacionDesvioFin,
                CantidadGranoCosechado = @CantidadGranoCosechado,
                CantidadHectareasTrabajadas = @CantidadHectareasTrabajadas,
                HumedadGrano = @HumedadGrano,
                Impurezas = @Impurezas,
                ResponsableACargo = @ResponsableACargo,
                RindeKgHa = @RindeKgHa,
                Estado = N'Finalizado',
                FechaModificacion = SYSDATETIME()
            WHERE CosechaId = @CosechaId;

            UPDATE l
            SET CultivoActual = c.Producto,
                CultivoAnterior = c.Producto,
                EstadoCultivo = N'Cosechado',
                FechaModificacion = SYSDATETIME()
            FROM dbo.Lotes AS l
            INNER JOIN dbo.Cosechas AS c ON c.LoteId = l.LoteId
            WHERE c.CosechaId = @CosechaId
              AND c.Estado = N'Finalizado';
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        command.Parameters.AddWithValue("@FechaFinReal", request.FechaFinReal);
        command.Parameters.AddWithValue("@JustificacionDesvioFin", string.IsNullOrWhiteSpace(request.JustificacionDesvioFin) ? DBNull.Value : request.JustificacionDesvioFin.Trim());
        command.Parameters.AddWithValue("@CantidadGranoCosechado", request.CantidadGranoCosechado);
        command.Parameters.AddWithValue("@CantidadHectareasTrabajadas", request.CantidadHectareasTrabajadas);
        command.Parameters.AddWithValue("@HumedadGrano", (object?)request.HumedadGrano ?? DBNull.Value);
        command.Parameters.AddWithValue("@Impurezas", (object?)request.Impurezas ?? DBNull.Value);
        command.Parameters.AddWithValue("@ResponsableACargo", string.IsNullOrWhiteSpace(request.ResponsableACargo) ? DBNull.Value : request.ResponsableACargo.Trim());
        command.Parameters.AddWithValue("@RindeKgHa", rinde);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<CosechaTiradaAroDto>> ObtenerTiradasAsync(int cosechaId)
    {
        const string sql = """
            SELECT CosechaTiradaAroId, CosechaId, Fecha, Latitud, Longitud, AroCabezal,
                   AroCola1, AroCola2, AroCola3, PMG, PerdidaCabezalKgHa,
                   PerdidaColaKgHa, PerdidaTotalKgHa, Severidad, AjustoMaquinaria, Observaciones
            FROM dbo.CosechaTiradaAros
            WHERE CosechaId = @CosechaId
            ORDER BY Fecha DESC, CosechaTiradaAroId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();

        var tiradas = new List<CosechaTiradaAroDto>();
        while (await reader.ReadAsync())
        {
            tiradas.Add(MapearTirada(reader));
        }

        return tiradas;
    }

    public async Task<CosechaTiradaAroDto> AgregarTiradaAsync(int cosechaId, CrearCosechaTiradaAroRequest request, int? usuarioId)
    {
        var calculo = CalcularPerdidas(request);

        const string sql = """
            INSERT INTO dbo.CosechaTiradaAros
                (CosechaId, Fecha, Latitud, Longitud, AroCabezal, AroCola1, AroCola2, AroCola3,
                 PMG, PerdidaCabezalKgHa, PerdidaColaKgHa, PerdidaTotalKgHa, Severidad,
                 AjustoMaquinaria, Observaciones, CreadoPorUsuarioId)
            OUTPUT INSERTED.CosechaTiradaAroId
            VALUES
                (@CosechaId, @Fecha, @Latitud, @Longitud, @AroCabezal, @AroCola1, @AroCola2, @AroCola3,
                 @PMG, @PerdidaCabezalKgHa, @PerdidaColaKgHa, @PerdidaTotalKgHa, @Severidad,
                 @AjustoMaquinaria, @Observaciones, @CreadoPorUsuarioId);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        AgregarParametrosTirada(command, request, calculo);
        command.Parameters.AddWithValue("@CreadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        var tiradaId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo registrar la Tirada de Aros."));

        var tiradas = await ObtenerTiradasAsync(cosechaId);
        return tiradas.First(t => t.CosechaTiradaAroId == tiradaId);
    }

    public async Task<bool> ActualizarTiradaAsync(int cosechaId, int tiradaId, ActualizarCosechaTiradaAroRequest request)
    {
        var calculo = CalcularPerdidas(request);

        const string sql = """
            UPDATE dbo.CosechaTiradaAros
            SET Fecha = @Fecha,
                Latitud = @Latitud,
                Longitud = @Longitud,
                AroCabezal = @AroCabezal,
                AroCola1 = @AroCola1,
                AroCola2 = @AroCola2,
                AroCola3 = @AroCola3,
                PMG = @PMG,
                PerdidaCabezalKgHa = @PerdidaCabezalKgHa,
                PerdidaColaKgHa = @PerdidaColaKgHa,
                PerdidaTotalKgHa = @PerdidaTotalKgHa,
                Severidad = @Severidad,
                AjustoMaquinaria = @AjustoMaquinaria,
                Observaciones = @Observaciones,
                FechaModificacion = SYSDATETIME()
            WHERE CosechaId = @CosechaId AND CosechaTiradaAroId = @TiradaId;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        command.Parameters.AddWithValue("@TiradaId", tiradaId);
        AgregarParametrosTirada(command, request, calculo);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<bool> EliminarTiradaAsync(int cosechaId, int tiradaId)
    {
        const string sql = "DELETE FROM dbo.CosechaTiradaAros WHERE CosechaId = @CosechaId AND CosechaTiradaAroId = @TiradaId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        command.Parameters.AddWithValue("@TiradaId", tiradaId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<CosechaDocumentoDto>> ObtenerDocumentosAsync(int cosechaId)
    {
        const string sql = """
            SELECT d.CosechaDocumentoId, d.NombreArchivo, d.FechaCarga, u.Nombre, u.Apellido
            FROM dbo.CosechaDocumentos AS d
            LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = d.CargadoPorUsuarioId
            WHERE d.CosechaId = @CosechaId
            ORDER BY d.FechaCarga DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();

        var documentos = new List<CosechaDocumentoDto>();
        while (await reader.ReadAsync())
        {
            var nombre = reader.IsDBNull(3) ? null : reader.GetString(3);
            var apellido = reader.IsDBNull(4) ? null : reader.GetString(4);
            var cargadoPor = string.IsNullOrWhiteSpace(nombre) && string.IsNullOrWhiteSpace(apellido)
                ? null
                : string.Join(' ', new[] { nombre, apellido }.Where(v => !string.IsNullOrWhiteSpace(v)));

            documentos.Add(new CosechaDocumentoDto
            {
                CosechaDocumentoId = reader.GetInt32(0),
                NombreArchivo = reader.GetString(1),
                FechaCarga = reader.GetDateTime(2),
                CargadoPor = cargadoPor
            });
        }

        return documentos;
    }

    public async Task<CosechaDocumentoDto> AgregarDocumentoAsync(int cosechaId, string nombreArchivo, string rutaArchivo, int? usuarioId)
    {
        const string sql = """
            INSERT INTO dbo.CosechaDocumentos (CosechaId, NombreArchivo, RutaArchivo, CargadoPorUsuarioId)
            OUTPUT INSERTED.CosechaDocumentoId, INSERTED.FechaCarga
            VALUES (@CosechaId, @NombreArchivo, @RutaArchivo, @CargadoPorUsuarioId);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        command.Parameters.AddWithValue("@NombreArchivo", nombreArchivo);
        command.Parameters.AddWithValue("@RutaArchivo", rutaArchivo);
        command.Parameters.AddWithValue("@CargadoPorUsuarioId", (object?)usuarioId ?? DBNull.Value);

        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();

        return new CosechaDocumentoDto
        {
            CosechaDocumentoId = reader.GetInt32(0),
            NombreArchivo = nombreArchivo,
            FechaCarga = reader.GetDateTime(1),
            CargadoPor = null
        };
    }

    public async Task<string?> ObtenerRutaDocumentoAsync(int cosechaId, int documentoId)
    {
        const string sql = "SELECT RutaArchivo FROM dbo.CosechaDocumentos WHERE CosechaDocumentoId = @Id AND CosechaId = @CosechaId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", documentoId);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);

        return await command.ExecuteScalarAsync() as string;
    }

    public async Task<bool> EliminarDocumentoAsync(int cosechaId, int documentoId)
    {
        const string sql = "DELETE FROM dbo.CosechaDocumentos WHERE CosechaDocumentoId = @Id AND CosechaId = @CosechaId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", documentoId);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    private static async Task<string> GenerarSiguienteNombreAsync(SqlConnection connection)
    {
        const string sql = """
            SELECT ISNULL(MAX(TRY_CAST(RIGHT(Nombre, 4) AS INT)), 0) + 1
            FROM dbo.Cosechas;
            """;

        await using var command = new SqlCommand(sql, connection);
        var siguiente = (int)(await command.ExecuteScalarAsync() ?? 1);
        return $"COS - {siguiente:D4}";
    }

    private static decimal? CalcularRinde(CrearCosechaRequest request)
    {
        if (request.RindeKgHa is > 0) return request.RindeKgHa.Value;
        if (request.CantidadGranoCosechado is > 0 && request.CantidadHectareasTrabajadas is > 0)
        {
            return request.CantidadGranoCosechado.Value / request.CantidadHectareasTrabajadas.Value;
        }

        return null;
    }

    private static decimal CalcularRinde(FinalizarCosechaRequest request)
    {
        if (request.RindeKgHa is > 0) return request.RindeKgHa.Value;
        return request.CantidadGranoCosechado / request.CantidadHectareasTrabajadas;
    }

    private static (decimal PerdidaCabezal, decimal PerdidaCola, decimal PerdidaTotal, string Severidad) CalcularPerdidas(CrearCosechaTiradaAroRequest request)
    {
        var pmg = request.PMG ?? 0;
        var perdidaCabezal = ((request.AroCabezal / 0.25m) * pmg) / 100m;
        var promedioCola = (request.AroCola1 + request.AroCola2 + request.AroCola3) / 3m;
        var perdidaCola = ((promedioCola / 0.25m) * pmg) / 100m;
        var perdidaTotal = perdidaCabezal + perdidaCola;
        var severidad = perdidaTotal switch
        {
            < 80m => "Baja",
            <= 150m => "Media",
            _ => "Alta"
        };

        return (decimal.Round(perdidaCabezal, 4), decimal.Round(perdidaCola, 4), decimal.Round(perdidaTotal, 4), severidad);
    }

    private static void AgregarParametros(SqlCommand command, CrearCosechaRequest request, decimal? rinde)
    {
        command.Parameters.AddWithValue("@SiembraId", (object?)request.SiembraId ?? DBNull.Value);
        command.Parameters.AddWithValue("@LoteId", request.LoteId);
        command.Parameters.AddWithValue("@CampaniaNombre", string.IsNullOrWhiteSpace(request.CampaniaNombre) ? DBNull.Value : request.CampaniaNombre.Trim());
        command.Parameters.AddWithValue("@Producto", request.Producto.Trim());
        command.Parameters.AddWithValue("@Empresa", string.IsNullOrWhiteSpace(request.Empresa) ? DBNull.Value : request.Empresa.Trim());
        command.Parameters.AddWithValue("@FechaInicio", request.FechaInicio);
        command.Parameters.AddWithValue("@FechaFin", request.FechaFin);
        command.Parameters.AddWithValue("@FechaFinReal", (object?)request.FechaFinReal ?? DBNull.Value);
        command.Parameters.AddWithValue("@JustificacionDesvioFin", string.IsNullOrWhiteSpace(request.JustificacionDesvioFin) ? DBNull.Value : request.JustificacionDesvioFin.Trim());
        command.Parameters.AddWithValue("@CantidadGranoCosechado", (object?)request.CantidadGranoCosechado ?? DBNull.Value);
        command.Parameters.AddWithValue("@CantidadHectareasTrabajadas", (object?)request.CantidadHectareasTrabajadas ?? DBNull.Value);
        command.Parameters.AddWithValue("@HumedadGrano", (object?)request.HumedadGrano ?? DBNull.Value);
        command.Parameters.AddWithValue("@Impurezas", (object?)request.Impurezas ?? DBNull.Value);
        command.Parameters.AddWithValue("@ResponsableACargo", string.IsNullOrWhiteSpace(request.ResponsableACargo) ? DBNull.Value : request.ResponsableACargo.Trim());
        command.Parameters.AddWithValue("@RindeKgHa", (object?)rinde ?? DBNull.Value);
    }

    private static void AgregarParametrosTirada(SqlCommand command, CrearCosechaTiradaAroRequest request, (decimal PerdidaCabezal, decimal PerdidaCola, decimal PerdidaTotal, string Severidad) calculo)
    {
        command.Parameters.AddWithValue("@Fecha", request.Fecha);
        command.Parameters.AddWithValue("@Latitud", (object?)request.Latitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@Longitud", (object?)request.Longitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@AroCabezal", request.AroCabezal);
        command.Parameters.AddWithValue("@AroCola1", request.AroCola1);
        command.Parameters.AddWithValue("@AroCola2", request.AroCola2);
        command.Parameters.AddWithValue("@AroCola3", request.AroCola3);
        command.Parameters.AddWithValue("@PMG", request.PMG!.Value);
        command.Parameters.AddWithValue("@PerdidaCabezalKgHa", calculo.PerdidaCabezal);
        command.Parameters.AddWithValue("@PerdidaColaKgHa", calculo.PerdidaCola);
        command.Parameters.AddWithValue("@PerdidaTotalKgHa", calculo.PerdidaTotal);
        command.Parameters.AddWithValue("@Severidad", calculo.Severidad);
        command.Parameters.AddWithValue("@AjustoMaquinaria", request.AjustoMaquinaria);
        command.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());
    }

    private static CosechaDto MapearCosecha(SqlDataReader reader)
    {
        return new CosechaDto
        {
            CosechaId = reader.GetInt32(0),
            Nombre = reader.GetString(1),
            SiembraId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
            SiembraNombre = reader.IsDBNull(3) ? null : reader.GetString(3),
            LoteId = reader.GetInt32(4),
            LoteNombre = reader.GetString(5),
            CampaniaNombre = reader.IsDBNull(6) ? null : reader.GetString(6),
            Producto = reader.GetString(7),
            Empresa = reader.IsDBNull(8) ? null : reader.GetString(8),
            FechaInicio = reader.GetDateTime(9),
            FechaFin = reader.GetDateTime(10),
            FechaFinReal = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
            JustificacionDesvioFin = reader.IsDBNull(12) ? null : reader.GetString(12),
            CantidadGranoCosechado = reader.IsDBNull(13) ? null : reader.GetDecimal(13),
            CantidadHectareasTrabajadas = reader.IsDBNull(14) ? null : reader.GetDecimal(14),
            HumedadGrano = reader.IsDBNull(15) ? null : reader.GetDecimal(15),
            Impurezas = reader.IsDBNull(16) ? null : reader.GetDecimal(16),
            ResponsableACargo = reader.IsDBNull(17) ? null : reader.GetString(17),
            RindeKgHa = reader.IsDBNull(18) ? null : reader.GetDecimal(18),
            Estado = reader.GetString(19)
        };
    }

    private static CosechaTiradaAroDto MapearTirada(SqlDataReader reader)
    {
        return new CosechaTiradaAroDto
        {
            CosechaTiradaAroId = reader.GetInt32(0),
            CosechaId = reader.GetInt32(1),
            Fecha = reader.GetDateTime(2),
            Latitud = reader.IsDBNull(3) ? null : reader.GetDecimal(3),
            Longitud = reader.IsDBNull(4) ? null : reader.GetDecimal(4),
            AroCabezal = reader.GetInt32(5),
            AroCola1 = reader.GetInt32(6),
            AroCola2 = reader.GetInt32(7),
            AroCola3 = reader.GetInt32(8),
            PMG = reader.GetDecimal(9),
            PerdidaCabezalKgHa = reader.GetDecimal(10),
            PerdidaColaKgHa = reader.GetDecimal(11),
            PerdidaTotalKgHa = reader.GetDecimal(12),
            Severidad = reader.GetString(13),
            AjustoMaquinaria = reader.GetBoolean(14),
            Observaciones = reader.IsDBNull(15) ? null : reader.GetString(15)
        };
    }
}
