using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public class SiloRepository(IConfiguration configuration) : ISiloRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectSilo = """
        SELECT
            s.SiloId, s.LoteId, l.Nombre AS LoteNombre, s.Nombre, s.TipoSilo, s.CapacidadMax,
            s.Producto, s.CantidadGranoAlmacenado, s.Pais, s.Provincia, s.Ciudad,
            s.Activo, s.FechaCreacion, s.FechaModificacion,
            s.EmpresaId, s.Codigo, s.EstadoOperativo,
            s.Latitud, s.Longitud, s.DiametroM, s.AlturaM, s.TieneAireacion, s.TieneTermometria,
            s.LargoM, s.DiametroBolsonPies, s.FechaEmbolsado, s.FechaVencimientoEstimada, s.IdentificacionEnLote,
            ctrl.Fecha AS UltimoControlFecha, ctrl.Resultado AS UltimoControlResultado, ctrl.FechaProximoControl,
            ant.Dias AS DiasAntiguedadPromedio
        FROM dbo.Silos AS s
        LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
        OUTER APPLY (
            SELECT TOP (1) sc.Fecha, sc.Resultado, sc.FechaProximoControl
            FROM dbo.SiloControles AS sc
            WHERE sc.SiloId = s.SiloId
            ORDER BY sc.Fecha DESC, sc.SiloControlId DESC
        ) AS ctrl
        OUTER APPLY (
            SELECT CAST(ROUND(
                       SUM(DATEDIFF(DAY, p.FechaIngreso, CAST(SYSDATETIME() AS DATE)) * p.KgRestantes)
                       / NULLIF(SUM(p.KgRestantes), 0), 0) AS INT) AS Dias
            FROM dbo.AlmacenamientoPartidas AS p
            WHERE p.SiloId = s.SiloId AND p.KgRestantes > 0
        ) AS ant
        """;

    // Mismo criterio que Lotes: el usuario ve los silos de sus empresas; Admin ve todos.
    private const string AccesoSilo = """
        (@IncluirTodos = 1 OR EXISTS (
            SELECT 1 FROM dbo.UsuarioEmpresas AS ue
            WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = s.EmpresaId AND ue.Activo = 1))
        """;

    public async Task<IReadOnlyList<SiloDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos)
    {
        var sql = SelectSilo + $" WHERE {AccesoSilo} ORDER BY s.SiloId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        var silos = new List<SiloDto>();
        while (await reader.ReadAsync())
        {
            silos.Add(MapearSilo(reader));
        }

        return silos;
    }

    public async Task<SiloDto?> ObtenerPorIdAsync(int siloId, int usuarioId = 0, bool incluirTodos = true)
    {
        var sql = SelectSilo + $" WHERE s.SiloId = @SiloId AND {AccesoSilo};";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearSilo(reader) : null;
    }

    public async Task<SiloFichaDto?> ObtenerFichaAsync(int siloId, int usuarioId, bool incluirTodos)
    {
        // Primero el silo con control de acceso: si no es de las empresas del usuario, no hay ficha.
        var silo = await ObtenerPorIdAsync(siloId, usuarioId, incluirTodos);
        if (silo is null)
        {
            return null;
        }

        const string sql = """
            SELECT
                p.PartidaId, p.SiloId, p.CosechaId, c.Nombre AS CosechaNombre,
                p.CampaniaId, cp.Nombre AS CampaniaNombre, lo.Nombre AS LoteNombre,
                p.Producto, p.FechaIngreso, p.KgIniciales, p.KgRestantes
            FROM dbo.AlmacenamientoPartidas AS p
            LEFT JOIN dbo.Cosechas AS c ON c.CosechaId = p.CosechaId
            LEFT JOIN dbo.Lotes AS lo ON lo.LoteId = c.LoteId
            LEFT JOIN dbo.Campanias AS cp ON cp.CampaniaId = p.CampaniaId
            WHERE p.SiloId = @SiloId AND p.KgRestantes > 0
            ORDER BY p.FechaIngreso, p.PartidaId;

            SELECT sc.SiloControlId, sc.Fecha, sc.HumedadGrano, sc.Temperatura, sc.EstadoGrano, sc.Resultado
            FROM dbo.SiloControles AS sc
            WHERE sc.SiloId = @SiloId
            ORDER BY sc.Fecha, sc.SiloControlId;

            SELECT d.SiloDocumentoId, d.NombreArchivo, d.FechaCarga, u.Nombre, u.Apellido, sc.SiloControlId, sc.Fecha
            FROM dbo.SiloDocumentos AS d
            INNER JOIN dbo.SiloControles AS sc ON sc.SiloControlId = d.SiloControlId
            LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = d.CargadoPorUsuarioId
            WHERE sc.SiloId = @SiloId
            ORDER BY d.FechaCarga DESC, d.SiloDocumentoId DESC;
            """;

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var partidas = new List<PartidaDto>();
        var controles = new List<SiloControlPuntoDto>();
        var documentos = new List<SiloDocumentoDto>();

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        await using var reader = await command.ExecuteReaderAsync();

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

        await reader.NextResultAsync();
        while (await reader.ReadAsync())
        {
            controles.Add(new SiloControlPuntoDto
            {
                SiloControlId = reader.GetInt32(0),
                Fecha = reader.GetDateTime(1),
                HumedadGrano = reader.GetDecimal(2),
                Temperatura = reader.GetDecimal(3),
                EstadoGrano = reader.GetString(4),
                Resultado = reader.IsDBNull(5) ? null : reader.GetString(5),
            });
        }

        await reader.NextResultAsync();
        while (await reader.ReadAsync())
        {
            var nombre = reader.IsDBNull(3) ? null : reader.GetString(3);
            var apellido = reader.IsDBNull(4) ? null : reader.GetString(4);
            documentos.Add(new SiloDocumentoDto
            {
                SiloDocumentoId = reader.GetInt32(0),
                NombreArchivo = reader.GetString(1),
                FechaCarga = reader.GetDateTime(2),
                CargadoPor = string.Join(' ', new[] { nombre, apellido }.Where(v => !string.IsNullOrWhiteSpace(v))) is { Length: > 0 } texto ? texto : null,
                SiloControlId = reader.GetInt32(5),
                FechaControl = reader.GetDateTime(6),
            });
        }

        return new SiloFichaDto
        {
            Silo = silo,
            Partidas = partidas,
            Controles = controles,
            Documentos = documentos,
        };
    }

    public async Task<SiloDto> CrearAsync(CrearSiloRequest request, int usuarioId, bool incluirTodos)
    {
        // Empresa: la del lote si el silo esta en uno; si no, la indicada (validando
        // que el usuario pertenezca); si no, la principal del usuario.
        // Codigo SILO - #### numerado por empresa. Nombre unico por empresa.
        const string sql = """
            DECLARE @Empresa INT =
                COALESCE(
                    (SELECT l.EmpresaId FROM dbo.Lotes AS l WHERE l.LoteId = @LoteId),
                    (SELECT e.EmpresaId FROM dbo.Empresas AS e
                     WHERE e.EmpresaId = @EmpresaId AND e.Activo = 1
                       AND (@IncluirTodos = 1 OR EXISTS (
                            SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                            WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = e.EmpresaId AND ue.Activo = 1))),
                    (SELECT TOP (1) COALESCE(u.EmpresaPrincipalId, ue.EmpresaId)
                     FROM dbo.Usuarios AS u
                     INNER JOIN dbo.UsuarioEmpresas AS ue ON ue.UsuarioId = u.UsuarioId AND ue.Activo = 1
                     WHERE u.UsuarioId = @UsuarioId
                     ORDER BY CASE WHEN ue.EmpresaId = u.EmpresaPrincipalId THEN 0 ELSE 1 END, ue.EmpresaId));

            IF @Empresa IS NOT NULL AND EXISTS (
                SELECT 1 FROM dbo.Silos WITH (UPDLOCK, HOLDLOCK)
                WHERE EmpresaId = @Empresa AND LTRIM(RTRIM(Nombre)) = @Nombre)
                THROW 50001, N'Ya existe un silo con ese nombre en la empresa.', 1;

            DECLARE @Numero INT =
                ISNULL((SELECT MAX(TRY_CAST(REPLACE(x.Codigo, N'SILO - ', N'') AS INT))
                        FROM dbo.Silos AS x WITH (UPDLOCK, HOLDLOCK)
                        WHERE x.EmpresaId = @Empresa), 0) + 1;

            INSERT INTO dbo.Silos
                (EmpresaId, Codigo, LoteId, Nombre, TipoSilo, CapacidadMax, Producto, CantidadGranoAlmacenado,
                 Pais, Provincia, Ciudad, Latitud, Longitud, DiametroM, AlturaM, TieneAireacion, TieneTermometria,
                 LargoM, DiametroBolsonPies, FechaEmbolsado, FechaVencimientoEstimada, IdentificacionEnLote)
            OUTPUT INSERTED.SiloId
            VALUES
                (@Empresa,
                 CASE WHEN @Empresa IS NULL THEN NULL ELSE CONCAT(N'SILO - ', RIGHT(CONCAT(N'0000', @Numero), 4)) END,
                 @LoteId, @Nombre, @TipoSilo, @CapacidadMax, @Producto, 0,
                 @Pais, @Provincia, @Ciudad, @Latitud, @Longitud, @DiametroM, @AlturaM, @TieneAireacion, @TieneTermometria,
                 @LargoM, @DiametroBolsonPies, @FechaEmbolsado, @FechaVencimientoEstimada, @IdentificacionEnLote);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            // El silo siempre arranca en 0: si viene con stock inicial, ese
            // valor se aplica como Ingreso automatico en Almacenamiento
            // (ALM-04), que es quien termina fijando CantidadGranoAlmacenado.
            // Esto evita contar el stock inicial dos veces. El grano solo se
            // guarda si hay stock inicial: un silo vacio no tiene grano.
            await using var command = new SqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@LoteId", (object?)request.LoteId ?? DBNull.Value);
            command.Parameters.AddWithValue("@EmpresaId", (object?)request.EmpresaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
            command.Parameters.AddWithValue("@Producto",
                request.CantidadGranoAlmacenado is > 0 && !string.IsNullOrWhiteSpace(request.Producto)
                    ? request.Producto.Trim()
                    : DBNull.Value);
            AgregarParametrosFormulario(command, request);

            var siloId = (int)(await command.ExecuteScalarAsync()
                ?? throw new InvalidOperationException("No se pudo crear el silo."));

            await transaction.CommitAsync();
            return (await ObtenerPorIdAsync(siloId))!;
        }
        catch (SqlException ex) when (ex.Number is >= 50001 and <= 50004)
        {
            await transaction.RollbackAsync();
            throw TraducirError(ex);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> ActualizarAsync(int siloId, ActualizarSiloRequest request, int usuarioId, bool incluirTodos)
    {
        // Producto y Activo del request se ignoran a proposito: el grano lo
        // mantiene Almacenamiento y el estado se cambia con CambiarEstadoAsync.
        var sql = $"""
            DECLARE @Empresa INT, @Stock DECIMAL(18,4);

            SELECT @Empresa = s.EmpresaId, @Stock = s.CantidadGranoAlmacenado
            FROM dbo.Silos AS s WITH (UPDLOCK, ROWLOCK)
            WHERE s.SiloId = @SiloId AND {AccesoSilo};

            IF @@ROWCOUNT = 0
            BEGIN
                SELECT CAST(0 AS INT);
                RETURN;
            END;

            IF @CapacidadMax < @Stock
                THROW 50003, N'La capacidad maxima no puede ser menor al grano que ya tiene el silo.', 1;

            IF @LoteId IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM dbo.Lotes
                WHERE LoteId = @LoteId AND (@Empresa IS NULL OR EmpresaId = @Empresa))
                THROW 50002, N'El lote elegido no pertenece a la empresa del silo.', 1;

            IF @Empresa IS NOT NULL AND EXISTS (
                SELECT 1 FROM dbo.Silos
                WHERE EmpresaId = @Empresa AND LTRIM(RTRIM(Nombre)) = @Nombre AND SiloId <> @SiloId)
                THROW 50001, N'Ya existe un silo con ese nombre en la empresa.', 1;

            UPDATE dbo.Silos
            SET EmpresaId = COALESCE(EmpresaId, (SELECT l.EmpresaId FROM dbo.Lotes AS l WHERE l.LoteId = @LoteId)),
                LoteId = @LoteId,
                Nombre = @Nombre,
                TipoSilo = @TipoSilo,
                CapacidadMax = @CapacidadMax,
                Pais = @Pais,
                Provincia = @Provincia,
                Ciudad = @Ciudad,
                Latitud = @Latitud,
                Longitud = @Longitud,
                DiametroM = @DiametroM,
                AlturaM = @AlturaM,
                TieneAireacion = @TieneAireacion,
                TieneTermometria = @TieneTermometria,
                LargoM = @LargoM,
                DiametroBolsonPies = @DiametroBolsonPies,
                FechaEmbolsado = @FechaEmbolsado,
                FechaVencimientoEstimada = @FechaVencimientoEstimada,
                IdentificacionEnLote = @IdentificacionEnLote,
                FechaModificacion = SYSDATETIME()
            WHERE SiloId = @SiloId;

            SELECT @@ROWCOUNT;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            await using var command = new SqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@SiloId", siloId);
            command.Parameters.AddWithValue("@LoteId", (object?)request.LoteId ?? DBNull.Value);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
            AgregarParametrosFormulario(command, request);

            var filas = Convert.ToInt32(await command.ExecuteScalarAsync());
            await transaction.CommitAsync();
            return filas > 0;
        }
        catch (SqlException ex) when (ex.Number is >= 50001 and <= 50004)
        {
            await transaction.RollbackAsync();
            throw TraducirError(ex);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> CambiarEstadoAsync(int siloId, string estado, int usuarioId, bool incluirTodos)
    {
        // "Activo" reactiva el silo: queda Vacio o Con grano segun su stock.
        // Activo (columna vieja) se mantiene sincronizado para las pantallas actuales.
        var sql = $"""
            DECLARE @Stock DECIMAL(18,4);

            SELECT @Stock = s.CantidadGranoAlmacenado
            FROM dbo.Silos AS s WITH (UPDLOCK, ROWLOCK)
            WHERE s.SiloId = @SiloId AND {AccesoSilo};

            IF @@ROWCOUNT = 0
            BEGIN
                SELECT CAST(0 AS INT);
                RETURN;
            END;

            IF @Estado = N'Dado de baja' AND @Stock > 0
                THROW 50004, N'El silo todavia tiene grano. Vacialo con un egreso antes de darlo de baja.', 1;

            UPDATE dbo.Silos
            SET EstadoOperativo = CASE
                    WHEN @Estado = N'Activo' THEN CASE WHEN CantidadGranoAlmacenado > 0 THEN N'Con grano' ELSE N'Vacio' END
                    ELSE @Estado
                END,
                Activo = CASE WHEN @Estado = N'Dado de baja' THEN 0 ELSE 1 END,
                FechaModificacion = SYSDATETIME()
            WHERE SiloId = @SiloId;

            SELECT @@ROWCOUNT;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            await using var command = new SqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@SiloId", siloId);
            command.Parameters.AddWithValue("@Estado", estado);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);

            var filas = Convert.ToInt32(await command.ExecuteScalarAsync());
            await transaction.CommitAsync();
            return filas > 0;
        }
        catch (SqlException ex) when (ex.Number is >= 50001 and <= 50004)
        {
            await transaction.RollbackAsync();
            throw TraducirError(ex);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// Parametros comunes del formulario. Los campos que no corresponden al tipo
    /// de silo se guardan en NULL (un silo de chapa no tiene fecha de embolsado).
    /// </summary>
    private static void AgregarParametrosFormulario(SqlCommand command, ISiloFormulario request)
    {
        var esChapa = request.TipoSilo.Trim() == "Chapa";
        var esBolson = request.TipoSilo.Trim() == "Bolson";

        command.Parameters.AddWithValue("@Nombre", request.Nombre.Trim());
        command.Parameters.AddWithValue("@TipoSilo", request.TipoSilo.Trim());
        command.Parameters.AddWithValue("@CapacidadMax", request.CapacidadMax);
        command.Parameters.AddWithValue("@Pais", request.Pais.Trim());
        command.Parameters.AddWithValue("@Provincia", request.Provincia.Trim());
        command.Parameters.AddWithValue("@Ciudad", request.Ciudad.Trim());
        command.Parameters.AddWithValue("@Latitud", (object?)request.Latitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@Longitud", (object?)request.Longitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@DiametroM", esChapa ? (object?)request.DiametroM ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@AlturaM", esChapa ? (object?)request.AlturaM ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@TieneAireacion", esChapa ? (object?)request.TieneAireacion ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@TieneTermometria", esChapa ? (object?)request.TieneTermometria ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@LargoM", esBolson ? (object?)request.LargoM ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@DiametroBolsonPies", esBolson ? (object?)request.DiametroBolsonPies ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@FechaEmbolsado", esBolson ? (object?)request.FechaEmbolsado ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@FechaVencimientoEstimada", esBolson ? (object?)request.FechaVencimientoEstimada ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@IdentificacionEnLote",
            esBolson && !string.IsNullOrWhiteSpace(request.IdentificacionEnLote) ? request.IdentificacionEnLote.Trim() : DBNull.Value);
    }

    /// <summary>Convierte los THROW 5000x del SQL en excepciones que el controller sabe responder.</summary>
    private static Exception TraducirError(SqlException ex) => ex.Number == 50001
        ? new SiloNombreDuplicadoException(ex.Message)
        : new InvalidOperationException(ex.Message);

    public async Task<IReadOnlyList<SiloControlDto>> ObtenerControlesAsync(int siloId)
    {
        const string sql = """
            SELECT sc.SiloControlId, sc.SiloId, sc.Fecha, sc.HumedadGrano, sc.Temperatura, sc.EstadoGrano,
                   sc.RoturaBolsa, sc.Observaciones,
                   (SELECT COUNT(1) FROM dbo.SiloControlIncidencias AS i WHERE i.SiloControlId = sc.SiloControlId) AS CantidadIncidencias,
                   (SELECT COUNT(1) FROM dbo.SiloControlInsumos AS ins WHERE ins.SiloControlId = sc.SiloControlId) AS CantidadInsumos,
                   sc.Resultado, sc.FechaProximoControl
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
                   (SELECT COUNT(1) FROM dbo.SiloControlInsumos AS ins WHERE ins.SiloControlId = sc.SiloControlId) AS CantidadInsumos,
                   sc.Resultado, sc.FechaProximoControl
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

    public async Task<SiloControlDto?> RegistrarControlAsync(
        int siloId, CrearSiloControlRequest request, int? usuarioId, string resultado, DateOnly? fechaProximoControl)
    {
        const string insertSql = """
            INSERT INTO dbo.SiloControles
                (SiloId, Fecha, HumedadGrano, Temperatura, EstadoGrano, RoturaBolsa, Observaciones, CreadoPorUsuarioId,
                 Resultado, FechaProximoControl)
            OUTPUT INSERTED.SiloControlId
            VALUES
                (@SiloId, @Fecha, @HumedadGrano, @Temperatura, @EstadoGrano, @RoturaBolsa, @Observaciones, @CreadoPorUsuarioId,
                 @Resultado, @FechaProximoControl);
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
        command.Parameters.AddWithValue("@Resultado", resultado);
        command.Parameters.AddWithValue("@FechaProximoControl", (object?)fechaProximoControl ?? DBNull.Value);

        var controlId = (int)(await command.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("No se pudo registrar el control."));

        return await ObtenerControlPorIdAsync(siloId, controlId);
    }

    public async Task<bool> ActualizarControlAsync(
        int siloId, int controlId, ActualizarSiloControlRequest request, string resultado, DateOnly? fechaProximoControl)
    {
        const string sql = """
            UPDATE dbo.SiloControles
            SET Fecha = @Fecha,
                HumedadGrano = @HumedadGrano,
                Temperatura = @Temperatura,
                EstadoGrano = @EstadoGrano,
                RoturaBolsa = @RoturaBolsa,
                Observaciones = @Observaciones,
                Resultado = @Resultado,
                FechaProximoControl = @FechaProximoControl
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
        command.Parameters.AddWithValue("@Resultado", resultado);
        command.Parameters.AddWithValue("@FechaProximoControl", (object?)fechaProximoControl ?? DBNull.Value);

        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<ContextoControlSilo?> ObtenerContextoControlAsync(
        int siloId, DateTime fecha, int? excluirControlId, int usuarioId, bool incluirTodos)
    {
        var sql = $"""
            SELECT s.SiloId, s.TipoSilo, s.Producto, s.EmpresaId
            FROM dbo.Silos AS s
            WHERE s.SiloId = @SiloId AND {AccesoSilo};

            SELECT p.Producto, p.UmbralHumedad, p.MargenTemperaturaC, p.FrecuenciaControlDias
            FROM dbo.GranoParametrosAlmacenamiento AS p
            INNER JOIN dbo.Silos AS s ON s.EmpresaId = p.EmpresaId AND s.TipoSilo = p.TipoSilo
            WHERE s.SiloId = @SiloId;

            SELECT TOP (1) sc.Temperatura, sc.Fecha
            FROM dbo.SiloControles AS sc
            WHERE sc.SiloId = @SiloId
              AND sc.Fecha <= @Fecha
              AND (@Excluir IS NULL OR sc.SiloControlId <> @Excluir)
            ORDER BY sc.Fecha DESC, sc.SiloControlId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@SiloId", siloId);
        command.Parameters.AddWithValue("@Fecha", fecha);
        command.Parameters.AddWithValue("@Excluir", (object?)excluirControlId ?? DBNull.Value);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
        {
            return null; // no existe o no es de las empresas del usuario
        }

        var tipoSilo = reader.GetString(1);
        var producto = reader.IsDBNull(2) ? null : reader.GetString(2);

        // Parametros del grano del silo, comparando "Maiz" = "Maíz".
        await reader.NextResultAsync();
        decimal? umbral = null, margen = null;
        int? frecuencia = null;
        var granoSilo = EvaluadorControlSilo.NormalizarGrano(producto);
        while (await reader.ReadAsync())
        {
            if (granoSilo.Length > 0 && EvaluadorControlSilo.NormalizarGrano(reader.GetString(0)) == granoSilo)
            {
                umbral = reader.GetDecimal(1);
                margen = reader.GetDecimal(2);
                frecuencia = reader.GetInt16(3);
            }
        }

        await reader.NextResultAsync();
        decimal? temperaturaAnterior = null;
        DateTime? fechaAnterior = null;
        if (await reader.ReadAsync())
        {
            temperaturaAnterior = reader.GetDecimal(0);
            fechaAnterior = reader.GetDateTime(1);
        }

        return new ContextoControlSilo(siloId, tipoSilo, producto, umbral, margen, frecuencia, temperaturaAnterior, fechaAnterior);
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
            FechaModificacion = reader.IsDBNull(13) ? null : reader.GetDateTime(13),
            EmpresaId = reader.IsDBNull(14) ? null : reader.GetInt32(14),
            Codigo = reader.IsDBNull(15) ? null : reader.GetString(15),
            EstadoOperativo = reader.GetString(16),
            Latitud = reader.IsDBNull(17) ? null : reader.GetDecimal(17),
            Longitud = reader.IsDBNull(18) ? null : reader.GetDecimal(18),
            DiametroM = reader.IsDBNull(19) ? null : reader.GetDecimal(19),
            AlturaM = reader.IsDBNull(20) ? null : reader.GetDecimal(20),
            TieneAireacion = reader.IsDBNull(21) ? null : reader.GetBoolean(21),
            TieneTermometria = reader.IsDBNull(22) ? null : reader.GetBoolean(22),
            LargoM = reader.IsDBNull(23) ? null : reader.GetDecimal(23),
            DiametroBolsonPies = reader.IsDBNull(24) ? null : reader.GetDecimal(24),
            FechaEmbolsado = reader.IsDBNull(25) ? null : DateOnly.FromDateTime(reader.GetDateTime(25)),
            FechaVencimientoEstimada = reader.IsDBNull(26) ? null : DateOnly.FromDateTime(reader.GetDateTime(26)),
            IdentificacionEnLote = reader.IsDBNull(27) ? null : reader.GetString(27),
            UltimoControlFecha = reader.IsDBNull(28) ? null : DateOnly.FromDateTime(reader.GetDateTime(28)),
            UltimoControlResultado = reader.IsDBNull(29) ? null : reader.GetString(29),
            FechaProximoControl = reader.IsDBNull(30) ? null : DateOnly.FromDateTime(reader.GetDateTime(30)),
            DiasAntiguedadPromedio = reader.IsDBNull(31) ? null : reader.GetInt32(31)
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
            CantidadInsumos = reader.GetInt32(9),
            Resultado = reader.IsDBNull(10) ? null : reader.GetString(10),
            FechaProximoControl = reader.IsDBNull(11) ? null : DateOnly.FromDateTime(reader.GetDateTime(11))
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

/// <summary>Nombre de silo repetido dentro de la misma empresa (el controller responde 409).</summary>
public sealed class SiloNombreDuplicadoException(string message) : Exception(message);
