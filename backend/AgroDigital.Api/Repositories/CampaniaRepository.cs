using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;
using System.Data;

namespace AgroDigital.Api.Repositories;

public sealed class CampaniaPeriodoDuplicadoException(string message) : InvalidOperationException(message);
public sealed class CampaniaLotesSinAsociarException(string message) : InvalidOperationException(message);
public sealed class CampaniaPlanificacionBloqueadaException(string message) : InvalidOperationException(message);

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
                   COALESCE(cc.FechaInicio, c.FechaInicio), COALESCE(cc.FechaFin, c.FechaFin), cc.Estado, cc.EtapaActual, cc.CicloEstacional,
                   CASE WHEN cc.Estado = N'Finalizado' THEN N'Cosechado'
                   WHEN cc.Estado = N'Pendiente' THEN N'Pendiente'
                   WHEN ultimaSiembra.EstadoSiembra = N'Finalizado' THEN N'Cultivado'
                   ELSE N'Pendiente' END AS EtapaProductiva
            FROM dbo.Campanias AS c
            LEFT JOIN dbo.CampaniaCombinaciones AS cc ON cc.CampaniaId = c.CampaniaId
            LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = c.EmpresaId
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
            OUTER APPLY (
                SELECT TOP (1) s.SiembraId, s.EstadoSiembra
                FROM dbo.Siembras AS s
                WHERE s.LoteId = cc.LoteId AND s.Producto = cc.Producto AND s.CicloEstacional = cc.CicloEstacional
                  AND s.DeshabilitacionId IS NULL
                  AND (s.CampaniaNombre = c.Nombre OR LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9) = LEFT(c.Periodo, 9))
                ORDER BY s.SiembraId DESC
            ) AS ultimaSiembra
            WHERE @IncluirTodos = 1
               OR EXISTS (
                    SELECT 1
                    FROM dbo.UsuarioEmpresas AS ue
                    WHERE ue.UsuarioId = @UsuarioId
                      AND ue.EmpresaId = c.EmpresaId
                      AND ue.Activo = 1
               )
            ORDER BY c.FechaCreacion DESC, c.CampaniaId DESC,
                     cc.FechaCreacion DESC, l.FechaCreacion DESC, cc.CampaniaCombinacionId DESC;
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
                CampaniaCombinacionId = reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
                CampaniaId = reader.GetInt32(1),
                CampaniaNombre = reader.GetString(2),
                Observaciones = reader.IsDBNull(3) ? null : reader.GetString(3),
                EmpresaId = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                EmpresaNombre = reader.IsDBNull(5) ? null : reader.GetString(5),
                Periodo = reader.IsDBNull(6) ? null : reader.GetString(6),
                LoteId = reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
                LoteNombre = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                LoteHectareas = reader.IsDBNull(9) ? null : reader.GetDecimal(9),
                LoteZona = reader.IsDBNull(10) ? null : reader.GetString(10),
                CultivoAntecesor = reader.IsDBNull(11) ? null : reader.GetString(11),
                Producto = reader.IsDBNull(12) ? string.Empty : reader.GetString(12),
                FechaInicio = reader.GetDateTime(13),
                FechaFin = reader.GetDateTime(14),
                Estado = reader.IsDBNull(15) ? "Sin lotes" : reader.GetString(15),
                EtapaActual = reader.IsDBNull(16) ? "Sin etapa" : reader.GetString(16),
                CicloEstacional = reader.IsDBNull(17) ? "Verano" : reader.GetString(17),
                EtapaProductiva = reader.GetString(18)
            });
        }

        return items;
    }

    public async Task<CampaniaDto?> ObtenerPorIdAsync(int campaniaId, int usuarioId, bool incluirTodos = false)
    {
        const string sql = """
            SELECT c.CampaniaId, c.EmpresaId, e.Nombre AS EmpresaNombre, c.Periodo, c.Nombre, c.FechaInicio, c.FechaFin, c.Observaciones, c.FechaCreacion, c.FechaModificacion,
                   cc.CampaniaCombinacionId, cc.LoteId, l.Nombre AS LoteNombre, l.Hectareas, l.Ciudad, ultimo.CultivoAntecesor,
                   cc.Producto, cc.FechaInicio, cc.FechaFin, cc.Estado, cc.EtapaActual, cc.CicloEstacional,
                   CASE WHEN cc.Estado = N'Finalizado' THEN N'Cosechado'
                   WHEN cc.Estado = N'Pendiente' THEN N'Pendiente'
                   WHEN ultimaSiembra.EstadoSiembra = N'Finalizado' THEN N'Cultivado'
                   ELSE N'Pendiente' END AS EtapaProductiva
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
            OUTER APPLY (
                SELECT TOP (1) s.SiembraId, s.EstadoSiembra
                FROM dbo.Siembras AS s
                WHERE s.LoteId = cc.LoteId AND s.Producto = cc.Producto AND s.CicloEstacional = cc.CicloEstacional
                  AND s.DeshabilitacionId IS NULL
                  AND (s.CampaniaNombre = c.Nombre OR LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9) = LEFT(c.Periodo, 9))
                ORDER BY s.SiembraId DESC
            ) AS ultimaSiembra
            WHERE c.CampaniaId = @CampaniaId
              AND (
                    @IncluirTodos = 1
                    OR EXISTS (SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                               WHERE ue.EmpresaId = c.EmpresaId AND ue.UsuarioId = @UsuarioId AND ue.Activo = 1)
              )
            ORDER BY cc.FechaCreacion DESC, l.FechaCreacion DESC, cc.CampaniaCombinacionId DESC;
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
                    EtapaActual = reader.GetString(20),
                    CicloEstacional = reader.GetString(21),
                    EtapaProductiva = reader.GetString(22)
                });
            }
        }

        await reader.DisposeAsync();
        if (campania is not null)
        {
            const string omissionsSql = "SELECT LoteId FROM dbo.CampaniaVeranoOmisiones WHERE CampaniaId = @CampaniaId AND Vigente = 1;";
            await using var omissions = new SqlCommand(omissionsSql, connection);
            omissions.Parameters.AddWithValue("@CampaniaId", campaniaId);
            await using var omissionReader = await omissions.ExecuteReaderAsync();
            while (await omissionReader.ReadAsync()) campania.LotesConOmisionVerano.Add(omissionReader.GetInt32(0));
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
            await ValidarLotesHabilitadosAsociadosAsync(connection, (SqlTransaction)transaction, empresaId, request.Combinaciones, request.OmisionesVerano, periodo);
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
            await GuardarOmisionesVeranoAsync(connection, (SqlTransaction)transaction, campaniaId, request.Combinaciones, request.OmisionesVerano, usuarioId);
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
            await ValidarLotesHabilitadosAsociadosAsync(connection, (SqlTransaction)transaction, existe.EmpresaId.Value, request.Combinaciones, request.OmisionesVerano, periodo, campaniaId);
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
            var estadosOriginales = await ObtenerEstadosCombinacionesAsync(connection, (SqlTransaction)transaction, campaniaId);
            var ciclosSolicitados = request.Combinaciones.ToDictionary(item => (item.LoteId, item.CicloEstacional));
            const string existingCyclesSql = "SELECT LoteId, CicloEstacional, Producto, Estado, EtapaActual FROM dbo.CampaniaCombinaciones WITH (UPDLOCK, HOLDLOCK) WHERE CampaniaId = @CampaniaId;";
            await using (var existingCycles = new SqlCommand(existingCyclesSql, connection, (SqlTransaction)transaction))
            {
                existingCycles.Parameters.AddWithValue("@CampaniaId", campaniaId);
                await using var reader = await existingCycles.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var key = (reader.GetInt32(0), reader.GetString(1));
                    var started = reader.GetString(3) != "Pendiente" || reader.GetString(4) != "Sin etapa";
                    if (started && (!ciclosSolicitados.TryGetValue(key, out var requested) ||
                                    !string.Equals(requested.Producto.Trim(), reader.GetString(2), StringComparison.OrdinalIgnoreCase)))
                        throw new CampaniaPlanificacionBloqueadaException("No se puede quitar ni cambiar el cultivo de una planificación con siembra iniciada.");
                }
            }
            command.Parameters.AddWithValue("@CampaniaId", campaniaId);
            command.Parameters.AddWithValue("@Periodo", periodo);
            command.Parameters.AddWithValue("@Nombre", nombre);
            command.Parameters.AddWithValue("@FechaInicio", request.FechaInicio);
            command.Parameters.AddWithValue("@FechaFin", request.FechaFin);
            command.Parameters.AddWithValue("@Observaciones", string.IsNullOrWhiteSpace(request.Observaciones) ? DBNull.Value : request.Observaciones.Trim());
            await command.ExecuteNonQueryAsync();

            await InsertarCombinacionesAsync(connection, (SqlTransaction)transaction, campaniaId, request.Combinaciones, usuarioId, incluirTodos, estadosOriginales);
            await GuardarOmisionesVeranoAsync(connection, (SqlTransaction)transaction, campaniaId, request.Combinaciones, request.OmisionesVerano, usuarioId);
            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> RetirarPlanificacionAsync(int campaniaId, int combinacionId, RetirarPlanificacionRequest request, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            const string contextSql = """
                SELECT cc.LoteId, c.Periodo, l.Activo
                FROM dbo.CampaniaCombinaciones AS cc WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.Campanias AS c ON c.CampaniaId = cc.CampaniaId
                INNER JOIN dbo.Lotes AS l WITH (UPDLOCK, HOLDLOCK) ON l.LoteId = cc.LoteId
                WHERE cc.CampaniaId = @CampaniaId AND cc.CampaniaCombinacionId = @CombinacionId
                  AND (@IncluirTodos = 1 OR EXISTS (
                      SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                      WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = c.EmpresaId AND ue.Activo = 1));
                """;
            int loteId;
            string periodo;
            bool activo;
            await using (var context = new SqlCommand(contextSql, connection, transaction))
            {
                context.Parameters.AddWithValue("@CampaniaId", campaniaId);
                context.Parameters.AddWithValue("@CombinacionId", combinacionId);
                context.Parameters.AddWithValue("@UsuarioId", usuarioId);
                context.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
                await using var reader = await context.ExecuteReaderAsync();
                if (!await reader.ReadAsync()) return false;
                loteId = reader.GetInt32(0);
                periodo = reader.GetString(1);
                activo = reader.GetBoolean(2);
            }
            if (!activo) throw new CampaniaPlanificacionBloqueadaException("El lote ya está deshabilitado.");

            if (request.Motivo == "Siniestro")
            {
                var match = System.Text.RegularExpressions.Regex.Match(periodo, @"^(\d{4})-(\d{4})$");
                if (!match.Success || request.FechaSiniestro!.Value.Date < new DateTime(int.Parse(match.Groups[1].Value), 1, 1)
                    || request.FechaSiniestro.Value.Date > new DateTime(int.Parse(match.Groups[2].Value), 12, 31))
                    throw new CampaniaPlanificacionBloqueadaException("La fecha del siniestro debe estar dentro del período de campaña.");
            }

            const string plansSql = """
                SELECT CampaniaCombinacionId, Producto, CicloEstacional, Estado, EtapaActual
                FROM dbo.CampaniaCombinaciones WITH (UPDLOCK, HOLDLOCK)
                WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId;
                """;
            var plans = new List<(int Id, string Producto, string Ciclo, string Estado, string Etapa)>();
            await using (var command = new SqlCommand(plansSql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CampaniaId", campaniaId);
                command.Parameters.AddWithValue("@LoteId", loteId);
                await using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    plans.Add((reader.GetInt32(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4)));
            }
            var targets = request.AfectarOtroCiclo ? plans : plans.Where(p => p.Id == combinacionId).ToList();
            if (targets.Count == 0) return false;
            if (targets.Any(p => p.Estado != "Pendiente" || p.Etapa != "Sin etapa"))
                throw new CampaniaPlanificacionBloqueadaException("Esta planificación ya inició una etapa operativa. La baja de lotes sembrados se gestionará desde Siembras.");

            const string sowingSql = """
                SELECT COUNT(1) FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
                WHERE LoteId = @LoteId
                  AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = @Periodo
                  AND CicloEstacional = @Ciclo;
                """;
            foreach (var plan in targets)
            {
                await using var command = new SqlCommand(sowingSql, connection, transaction);
                command.Parameters.AddWithValue("@LoteId", loteId);
                command.Parameters.AddWithValue("@Periodo", periodo);
                command.Parameters.AddWithValue("@Ciclo", plan.Ciclo);
                if (Convert.ToInt32(await command.ExecuteScalarAsync()) > 0)
                    throw new CampaniaPlanificacionBloqueadaException($"La planificación de {plan.Ciclo} ya tiene una siembra. Gestioná su baja desde Siembras.");
            }

            var disableLot = targets.Count == plans.Count;
            const string auditSql = """
                INSERT INTO dbo.CampaniaPlanificacionBajas
                    (CampaniaId, LoteId, Producto, CicloEstacional, Motivo, Detalle, Siniestro, FechaSiniestro, LoteDeshabilitado, UsuarioId)
                VALUES (@CampaniaId, @LoteId, @Producto, @Ciclo, @Motivo, @Detalle, @Siniestro, @FechaSiniestro, @LoteDeshabilitado, @UsuarioId);
                DELETE FROM dbo.CampaniaCombinaciones WHERE CampaniaCombinacionId = @CombinacionId;
                """;
            foreach (var plan in targets)
            {
                await using var command = new SqlCommand(auditSql, connection, transaction);
                command.Parameters.AddWithValue("@CampaniaId", campaniaId);
                command.Parameters.AddWithValue("@CombinacionId", plan.Id);
                command.Parameters.AddWithValue("@LoteId", loteId);
                command.Parameters.AddWithValue("@Producto", plan.Producto);
                command.Parameters.AddWithValue("@Ciclo", plan.Ciclo);
                command.Parameters.AddWithValue("@Motivo", request.Motivo);
                command.Parameters.AddWithValue("@Detalle", request.Motivo == "Otro motivo" ? request.Detalle!.Trim() : DBNull.Value);
                command.Parameters.AddWithValue("@Siniestro", request.Motivo == "Siniestro" ? request.Siniestro! : DBNull.Value);
                command.Parameters.AddWithValue("@FechaSiniestro", request.Motivo == "Siniestro" ? request.FechaSiniestro!.Value.Date : DBNull.Value);
                command.Parameters.AddWithValue("@LoteDeshabilitado", disableLot);
                command.Parameters.AddWithValue("@UsuarioId", usuarioId);
                await command.ExecuteNonQueryAsync();
            }

            if (!disableLot && targets.Any(plan => plan.Ciclo == "Verano"))
            {
                const string omitSql = """
                    UPDATE dbo.CampaniaVeranoOmisiones SET Vigente = 0
                    WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId AND Vigente = 1;
                    INSERT INTO dbo.CampaniaVeranoOmisiones (CampaniaId, LoteId, Motivo, Detalle, Siniestro, FechaSiniestro, RegistradaEnBajaPlanificacion, UsuarioId)
                    VALUES (@CampaniaId, @LoteId, @Motivo, @Detalle, @Siniestro, @FechaSiniestro, 1, @UsuarioId);
                    """;
                await using var omit = new SqlCommand(omitSql, connection, transaction);
                omit.Parameters.AddWithValue("@CampaniaId", campaniaId);
                omit.Parameters.AddWithValue("@LoteId", loteId);
                omit.Parameters.AddWithValue("@Motivo", request.Motivo);
                omit.Parameters.AddWithValue("@Detalle", request.Motivo == "Otro motivo" ? request.Detalle!.Trim() : DBNull.Value);
                omit.Parameters.AddWithValue("@Siniestro", request.Motivo == "Siniestro" ? request.Siniestro! : DBNull.Value);
                omit.Parameters.AddWithValue("@FechaSiniestro", request.Motivo == "Siniestro" ? request.FechaSiniestro!.Value.Date : DBNull.Value);
                omit.Parameters.AddWithValue("@UsuarioId", usuarioId);
                await omit.ExecuteNonQueryAsync();
            }

            if (disableLot)
            {
                await using (var closeOmission = new SqlCommand("UPDATE dbo.CampaniaVeranoOmisiones SET Vigente = 0 WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId AND Vigente = 1;", connection, transaction))
                {
                    closeOmission.Parameters.AddWithValue("@CampaniaId", campaniaId);
                    closeOmission.Parameters.AddWithValue("@LoteId", loteId);
                    await closeOmission.ExecuteNonQueryAsync();
                }
                const string disableSql = """
                    UPDATE dbo.Lotes SET Activo = 0, FechaModificacion = SYSDATETIME() WHERE LoteId = @LoteId;
                    INSERT INTO dbo.LoteDeshabilitaciones (LoteId, Motivo, Detalle, Siniestro, FechaSiniestro, UsuarioId)
                    VALUES (@LoteId, @Motivo, @Detalle, @Siniestro, @FechaSiniestro, @UsuarioId);
                    """;
                await using var command = new SqlCommand(disableSql, connection, transaction);
                command.Parameters.AddWithValue("@LoteId", loteId);
                command.Parameters.AddWithValue("@Motivo", request.Motivo);
                command.Parameters.AddWithValue("@Detalle", request.Motivo == "Otro motivo" ? request.Detalle!.Trim() : DBNull.Value);
                command.Parameters.AddWithValue("@Siniestro", request.Motivo == "Siniestro" ? request.Siniestro! : DBNull.Value);
                command.Parameters.AddWithValue("@FechaSiniestro", request.Motivo == "Siniestro" ? request.FechaSiniestro!.Value.Date : DBNull.Value);
                command.Parameters.AddWithValue("@UsuarioId", usuarioId);
                await command.ExecuteNonQueryAsync();
            }
            else
            {
                await using var command = new SqlCommand(LoteCultivoEstadoSql.Recalcular, connection, transaction);
                command.Parameters.AddWithValue("@LoteId", loteId);
                await command.ExecuteNonQueryAsync();
            }
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

    private static async Task ValidarLotesHabilitadosAsociadosAsync(SqlConnection connection, SqlTransaction transaction, int empresaId, IReadOnlyList<CrearCampaniaCombinacionRequest> combinaciones, IReadOnlyList<OmisionVeranoRequest> omisiones, string periodo, int? campaniaId = null)
    {
        const string sql = "SELECT LoteId, Nombre FROM dbo.Lotes WITH (UPDLOCK, HOLDLOCK) WHERE EmpresaId = @EmpresaId AND Activo = 1;";
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        var lotesActivos = new Dictionary<int, string>();
        await using (var reader = await command.ExecuteReaderAsync())
            while (await reader.ReadAsync()) lotesActivos.Add(reader.GetInt32(0), reader.GetString(1));

        var verano = combinaciones.Where(item => item.CicloEstacional == "Verano").Select(item => item.LoteId).ToHashSet();
        var invierno = combinaciones.Where(item => item.CicloEstacional == "Invierno").Select(item => item.LoteId).ToHashSet();
        var motivos = omisiones.Select(item => item.LoteId).ToHashSet();
        if (motivos.Count != omisiones.Count || omisiones.Any(item => !lotesActivos.ContainsKey(item.LoteId) || !invierno.Contains(item.LoteId) || verano.Contains(item.LoteId)))
            throw new CampaniaLotesSinAsociarException("Los motivos de omisión de Verano solo corresponden a lotes habilitados planificados en Invierno y sin Verano.");
        var inicioPeriodo = new DateTime(int.Parse(periodo[..4]), 1, 1);
        var finPeriodo = new DateTime(int.Parse(periodo[5..]), 12, 31);
        if (omisiones.Any(item => item.Motivo == "Siniestro" && (item.FechaSiniestro!.Value.Date < inicioPeriodo || item.FechaSiniestro.Value.Date > finPeriodo)))
            throw new CampaniaLotesSinAsociarException("La fecha del siniestro debe estar dentro del período de campaña.");

        var motivosVigentes = new HashSet<int>();
        if (campaniaId is not null)
        {
            const string existingSql = "SELECT LoteId FROM dbo.CampaniaVeranoOmisiones WITH (UPDLOCK, HOLDLOCK) WHERE CampaniaId = @CampaniaId AND Vigente = 1;";
            await using var existing = new SqlCommand(existingSql, connection, transaction);
            existing.Parameters.AddWithValue("@CampaniaId", campaniaId.Value);
            await using var reader = await existing.ExecuteReaderAsync();
            while (await reader.ReadAsync()) motivosVigentes.Add(reader.GetInt32(0));
        }

        var sinAsociar = lotesActivos.Where(item => !verano.Contains(item.Key) && !invierno.Contains(item.Key)).Select(item => item.Value).ToList();
        if (sinAsociar.Count > 0)
            throw new CampaniaLotesSinAsociarException($"Asociá o deshabilitá estos lotes: {string.Join(", ", sinAsociar)}.");
        var sinVerano = lotesActivos.Where(item => !verano.Contains(item.Key) && !motivos.Contains(item.Key) && !motivosVigentes.Contains(item.Key)).Select(item => item.Value).ToList();
        if (sinVerano.Count > 0)
            throw new CampaniaLotesSinAsociarException($"Indicá por qué estos lotes no se planifican en Verano: {string.Join(", ", sinVerano)}.");
    }

    private static async Task GuardarOmisionesVeranoAsync(SqlConnection connection, SqlTransaction transaction, int campaniaId, IReadOnlyList<CrearCampaniaCombinacionRequest> combinaciones, IReadOnlyList<OmisionVeranoRequest> omisiones, int usuarioId)
    {
        var lotesVerano = combinaciones.Where(item => item.CicloEstacional == "Verano").Select(item => item.LoteId).ToHashSet();
        const string existingSql = "SELECT CampaniaVeranoOmisionId, LoteId FROM dbo.CampaniaVeranoOmisiones WITH (UPDLOCK, HOLDLOCK) WHERE CampaniaId = @CampaniaId AND Vigente = 1;";
        var existentes = new List<(int Id, int LoteId)>();
        await using (var command = new SqlCommand(existingSql, connection, transaction))
        {
            command.Parameters.AddWithValue("@CampaniaId", campaniaId);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) existentes.Add((reader.GetInt32(0), reader.GetInt32(1)));
        }
        foreach (var vigente in existentes.Where(item => lotesVerano.Contains(item.LoteId)))
        {
            await using var command = new SqlCommand("UPDATE dbo.CampaniaVeranoOmisiones SET Vigente = 0 WHERE CampaniaVeranoOmisionId = @Id;", connection, transaction);
            command.Parameters.AddWithValue("@Id", vigente.Id);
            await command.ExecuteNonQueryAsync();
        }
        foreach (var omision in omisiones)
        {
            if (existentes.Any(item => item.LoteId == omision.LoteId)) continue;
            await using var command = new SqlCommand("INSERT INTO dbo.CampaniaVeranoOmisiones (CampaniaId, LoteId, Motivo, Detalle, Siniestro, FechaSiniestro, UsuarioId) VALUES (@CampaniaId, @LoteId, @Motivo, @Detalle, @Siniestro, @FechaSiniestro, @UsuarioId);", connection, transaction);
            command.Parameters.AddWithValue("@CampaniaId", campaniaId);
            command.Parameters.AddWithValue("@LoteId", omision.LoteId);
            command.Parameters.AddWithValue("@Motivo", omision.Motivo);
            command.Parameters.AddWithValue("@Detalle", omision.Motivo == "Otro motivo" ? omision.Detalle!.Trim() : DBNull.Value);
            command.Parameters.AddWithValue("@Siniestro", omision.Motivo == "Siniestro" ? omision.Siniestro! : DBNull.Value);
            command.Parameters.AddWithValue("@FechaSiniestro", omision.Motivo == "Siniestro" ? omision.FechaSiniestro!.Value.Date : DBNull.Value);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            await command.ExecuteNonQueryAsync();
        }
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

    private static async Task<Dictionary<string, (string Estado, string Etapa, DateTime FechaCreacion)>> ObtenerEstadosCombinacionesAsync(SqlConnection connection, SqlTransaction transaction, int campaniaId)
    {
        const string sql = "SELECT LoteId, Producto, Estado, EtapaActual, CicloEstacional, FechaCreacion FROM dbo.CampaniaCombinaciones WHERE CampaniaId = @CampaniaId;";
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@CampaniaId", campaniaId);
        await using var reader = await command.ExecuteReaderAsync();

        var estados = new Dictionary<string, (string Estado, string Etapa, DateTime FechaCreacion)>(StringComparer.OrdinalIgnoreCase);
        while (await reader.ReadAsync())
        {
            estados[CrearClaveCombinacion(reader.GetInt32(0), reader.GetString(1), reader.GetString(4))] = (reader.GetString(2), reader.GetString(3), reader.GetDateTime(5));
        }

        return estados;
    }

    private static string CrearClaveCombinacion(int loteId, string producto, string cicloEstacional) => $"{loteId}|{producto.Trim()}|{cicloEstacional}";

    private static async Task InsertarCombinacionesAsync(SqlConnection connection, SqlTransaction transaction, int campaniaId, IEnumerable<CrearCampaniaCombinacionRequest> combinaciones, int usuarioId, bool incluirTodos, IReadOnlyDictionary<string, (string Estado, string Etapa, DateTime FechaCreacion)>? estadosOriginales = null)
    {
        const string insertSql = """
            INSERT INTO dbo.CampaniaCombinaciones (CampaniaId, LoteId, Producto, CicloEstacional, FechaInicio, FechaFin, Estado, EtapaActual, FechaCreacion)
            SELECT @CampaniaId, l.LoteId, @Producto, @CicloEstacional, @FechaInicio, @FechaFin, @Estado, @EtapaActual, COALESCE(@FechaCreacion, SYSDATETIME())
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
            var producto = item.Producto.Trim();
            var estado = estadosOriginales is not null && estadosOriginales.TryGetValue(CrearClaveCombinacion(item.LoteId, producto, item.CicloEstacional), out var estadoOriginal)
                ? estadoOriginal
                : (Estado: "Pendiente", Etapa: "Sin etapa", FechaCreacion: (DateTime?)null);
            await using var command = new SqlCommand(insertSql, connection, transaction);
            command.Parameters.AddWithValue("@CampaniaId", campaniaId);
            command.Parameters.AddWithValue("@LoteId", item.LoteId);
            command.Parameters.AddWithValue("@Producto", producto);
            command.Parameters.AddWithValue("@CicloEstacional", item.CicloEstacional);
            command.Parameters.AddWithValue("@FechaInicio", item.FechaInicio);
            command.Parameters.AddWithValue("@FechaFin", item.FechaFin);
            command.Parameters.AddWithValue("@Estado", estado.Estado);
            command.Parameters.AddWithValue("@EtapaActual", estado.Etapa);
            command.Parameters.AddWithValue("@FechaCreacion", estado.FechaCreacion is DateTime fechaCreacion ? fechaCreacion : DBNull.Value);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);

            if (await command.ExecuteNonQueryAsync() == 0)
            {
                throw new InvalidOperationException("Uno de los lotes seleccionados no existe o no pertenece al usuario.");
            }

            await using var updateLoteCommand = new SqlCommand(LoteCultivoEstadoSql.Recalcular, connection, transaction);
            updateLoteCommand.Parameters.AddWithValue("@LoteId", item.LoteId);
            await updateLoteCommand.ExecuteNonQueryAsync();
        }
    }
}
