using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;
using System.Globalization;

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
                l.CultivoAnterior, l.CultivoAnteriorCampania, l.CultivoActual, l.EstadoCultivo,
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
            ORDER BY l.FechaCreacion DESC, l.LoteId DESC, c.Orden;
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

            if (!reader.IsDBNull(16))
            {
                lote.Coordenadas.Add(MapearCoordenada(reader, 16));
            }
        }

        var resultado = lotes.Values.ToList();
        foreach (var lote in resultado)
        {
            lote.HistorialCultivos = await ObtenerHistorialCultivosAsync(lote.LoteId, usuarioId, incluirTodos);
            lote.HistorialDeshabilitaciones = await ObtenerHistorialDeshabilitacionesAsync(lote.LoteId);
        }

        return resultado;
    }

    public async Task<LoteDto?> ObtenerPorIdAsync(int loteId, int usuarioId, bool incluirTodos = false)
    {
        const string sql = """
            SELECT
                l.LoteId, l.EmpresaId, l.Nombre, l.Pais, l.Provincia, l.Ciudad, l.Condicion,
                l.CultivoAnterior, l.CultivoAnteriorCampania, l.CultivoActual, l.EstadoCultivo,
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
            if (!reader.IsDBNull(16))
            {
                lote.Coordenadas.Add(MapearCoordenada(reader, 16));
            }
        }

        if (lote is not null)
        {
            lote.HistorialCultivos = await ObtenerHistorialCultivosAsync(loteId, usuarioId, incluirTodos);
            lote.HistorialDeshabilitaciones = await ObtenerHistorialDeshabilitacionesAsync(loteId);
        }

        return lote;
    }

    public async Task<bool> ExisteNombreAsync(string nombre, int usuarioId, bool incluirTodos = false, int? excluirLoteId = null)
    {
        const string sql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.Lotes AS l
                WHERE LOWER(LTRIM(RTRIM(l.Nombre))) COLLATE Latin1_General_100_CI_AI =
                      LOWER(LTRIM(RTRIM(@Nombre))) COLLATE Latin1_General_100_CI_AI
                  AND (@ExcluirLoteId IS NULL OR l.LoteId <> @ExcluirLoteId)
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
            ) THEN 1 ELSE 0 END;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Nombre", nombre.Trim());
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        command.Parameters.AddWithValue("@ExcluirLoteId", excluirLoteId.HasValue ? excluirLoteId.Value : (object)DBNull.Value);

        return Convert.ToInt32(await command.ExecuteScalarAsync()) == 1;
    }

    public async Task<LoteSuperpuestoInfo?> ObtenerSuperposicionAsync(IEnumerable<LoteCoordenadaDto> coordenadas, int usuarioId, bool incluirTodos = false, int? excluirLoteId = null)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var empresaId = excluirLoteId.HasValue
            ? await ObtenerEmpresaDelLoteAsync(connection, null, excluirLoteId.Value, usuarioId, incluirTodos)
            : await ObtenerEmpresaPrincipalAsync(connection, null, usuarioId, incluirTodos);

        return empresaId is null
            ? null
            : await BuscarLoteSuperpuestoAsync(connection, null, empresaId.Value, coordenadas, excluirLoteId);
    }

    public async Task<LoteDto> CrearAsync(CrearLoteRequest request, int usuarioId, bool incluirTodos = false)
    {
        const string insertLoteSql = """
            INSERT INTO dbo.Lotes (EmpresaId, Nombre, Pais, Provincia, Ciudad, Condicion, CultivoAnterior, CultivoAnteriorCampania, EstadoCultivo, Hectareas, SuperficieTotal, Activo)
            OUTPUT INSERTED.LoteId
            VALUES (@EmpresaId, @Nombre, @Pais, @Provincia, @Ciudad, @Condicion, @CultivoAnterior, @CultivoAnteriorCampania, N'Cosechado', @Hectareas, @SuperficieTotal, @Activo);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        try
        {
            var empresaId = await ObtenerEmpresaPrincipalAsync(connection, (SqlTransaction)transaction, usuarioId, incluirTodos);
            if (request.RegistrarDeshabilitado && request.Deshabilitacion?.Motivo == "Siniestro")
            {
                var periodo = await BuscarPeriodoDeshabilitacionAsync(connection, (SqlTransaction)transaction, null, empresaId);
                ValidarFechaSiniestroEnPeriodo(request.Deshabilitacion, periodo);
            }
            var loteSuperpuesto = await BuscarLoteSuperpuestoAsync(connection, (SqlTransaction)transaction, empresaId, request.Coordenadas);
            if (loteSuperpuesto is not null)
            {
                throw CrearExcepcionLoteSuperpuesto(loteSuperpuesto);
            }

            await using var command = new SqlCommand(insertLoteSql, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@EmpresaId", empresaId);
            command.Parameters.AddWithValue("@Activo", !request.RegistrarDeshabilitado);
            AgregarParametrosLote(command, request);

            var loteId = (int)(await command.ExecuteScalarAsync()
                ?? throw new InvalidOperationException("No se pudo crear el lote."));

            await ReemplazarCoordenadasAsync(connection, (SqlTransaction)transaction, loteId, request.Coordenadas);
            if (request.RegistrarDeshabilitado && request.Deshabilitacion is not null)
                await RegistrarDeshabilitacionAsync(connection, (SqlTransaction)transaction, loteId, usuarioId, request.Deshabilitacion, null);
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
                CultivoAnterior = @CultivoAnterior,
                CultivoAnteriorCampania = @CultivoAnteriorCampania,
                Hectareas = @Hectareas,
                SuperficieTotal = @SuperficieTotal,
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
            var empresaId = await ObtenerEmpresaDelLoteAsync(connection, (SqlTransaction)transaction, loteId, usuarioId, incluirTodos);
            if (empresaId is null)
            {
                await transaction.RollbackAsync();
                return false;
            }

            var loteSuperpuesto = await BuscarLoteSuperpuestoAsync(connection, (SqlTransaction)transaction, empresaId.Value, request.Coordenadas, loteId);
            if (loteSuperpuesto is not null)
            {
                throw CrearExcepcionLoteSuperpuesto(loteSuperpuesto);
            }

            await using var command = new SqlCommand(updateLoteSql, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@LoteId", loteId);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
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

    public async Task<bool> CambiarEstadoAsync(int loteId, bool activo, int usuarioId, bool incluirTodos = false, DeshabilitarLoteRequest? deshabilitacion = null)
    {
        const string sql = """
            UPDATE l
            SET Activo = @Activo,
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
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        try
        {
            var lote = await ObtenerEstadoLoteAsync(connection, transaction, loteId, usuarioId, incluirTodos);
            if (lote is null) return false;
            if (lote.Value == activo) return true;
            int? ultimaSiembraId = null;
            if (!activo)
            {
                if (deshabilitacion is null) throw new LoteDeshabilitacionBloqueadaException("Seleccioná un motivo para deshabilitar el lote.");
                if (deshabilitacion.Motivo == "Alquilado recientemente"
                    && !await PuedeDeshabilitarPorAlquilerRecienteAsync(connection, transaction, loteId))
                    throw new LoteDeshabilitacionBloqueadaException("Alquilado recientemente solo corresponde a un lote registrado durante la campaña activa y todavía no asociado a ella.");
                var estado = await ObtenerEstadoOperativoAsync(connection, transaction, loteId);
                if (estado.Bloqueo is not null) throw new LoteDeshabilitacionBloqueadaException(estado.Bloqueo);
                ultimaSiembraId = estado.UltimaSiembraId;
                if (deshabilitacion.Motivo == "Siniestro")
                {
                    var periodo = await BuscarPeriodoDeshabilitacionAsync(connection, transaction, loteId, null);
                    ValidarFechaSiniestroEnPeriodo(deshabilitacion, periodo);
                }
            }

            await using var command = new SqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@LoteId", loteId);
            command.Parameters.AddWithValue("@Activo", activo);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
            if (await command.ExecuteNonQueryAsync() == 0) return false;

            if (!activo && deshabilitacion is not null)
            {
                var bajaId = await RegistrarDeshabilitacionAsync(connection, transaction, loteId, usuarioId, deshabilitacion, ultimaSiembraId);
                if (ultimaSiembraId is not null)
                {
                    var periodo = await BuscarPeriodoDeshabilitacionAsync(connection, transaction, loteId, null);
                    await using (var snapshot = new SqlCommand("""
                        UPDATE dbo.LoteDeshabilitaciones
                        SET EstadoSeguimientoAnterior = (SELECT Estado FROM dbo.Siembras WHERE SiembraId = @SiembraId)
                        WHERE LoteDeshabilitacionId = @BajaId;
                        UPDATE dbo.Siembras SET DeshabilitacionId = @BajaId
                        WHERE LoteId = @LoteId AND DeshabilitacionId IS NULL
                          AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = @Periodo;
                        """, connection, transaction))
                    {
                        snapshot.Parameters.AddWithValue("@SiembraId", ultimaSiembraId.Value);
                        snapshot.Parameters.AddWithValue("@BajaId", bajaId);
                        snapshot.Parameters.AddWithValue("@LoteId", loteId);
                        snapshot.Parameters.AddWithValue("@Periodo", periodo);
                        await snapshot.ExecuteNonQueryAsync();
                    }
                    if (deshabilitacion.Motivo == "Siniestro")
                    {
                        const string insert = """
                            INSERT INTO dbo.SiembraSeguimientos (SiembraId, Fecha, TipoRegistro, Siniestro, Alcance, Observaciones, Cultivo, EsResiembra)
                            OUTPUT INSERTED.SiembraSeguimientoId
                            SELECT SiembraId, @Fecha, N'Siniestro', @Siniestro, N'Total',
                                   N'Registro automático por deshabilitación del lote.', Producto, 0
                            FROM dbo.Siembras WHERE SiembraId = @SiembraId;
                            """;
                        await using var siniestro = new SqlCommand(insert, connection, transaction);
                        siniestro.Parameters.AddWithValue("@SiembraId", ultimaSiembraId.Value);
                        siniestro.Parameters.AddWithValue("@Fecha", deshabilitacion.FechaSiniestro!.Value.Date);
                        siniestro.Parameters.AddWithValue("@Siniestro", deshabilitacion.Siniestro!);
                        var seguimientoId = Convert.ToInt32(await siniestro.ExecuteScalarAsync());
                        await using var guardarSeguimiento = new SqlCommand("UPDATE dbo.LoteDeshabilitaciones SET SeguimientoAutomaticoId = @SeguimientoId WHERE LoteDeshabilitacionId = @BajaId;", connection, transaction);
                        guardarSeguimiento.Parameters.AddWithValue("@SeguimientoId", seguimientoId);
                        guardarSeguimiento.Parameters.AddWithValue("@BajaId", bajaId);
                        await guardarSeguimiento.ExecuteNonQueryAsync();
                    }
                    await using var finalizar = new SqlCommand("UPDATE dbo.Siembras SET Estado = N'Finalizado', FechaModificacion = SYSDATETIME() WHERE SiembraId = @SiembraId;", connection, transaction);
                    finalizar.Parameters.AddWithValue("@SiembraId", ultimaSiembraId.Value);
                    await finalizar.ExecuteNonQueryAsync();
                }
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

    public async Task<bool> DeshabilitarSiembraAsync(int siembraId, DeshabilitarSiembraRequest request, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        try
        {
            const string contextSql = """
                SELECT s.LoteId, s.CicloEstacional, c.CampaniaId, c.Periodo, l.Activo
                FROM dbo.Siembras s WITH (UPDLOCK, HOLDLOCK)
                JOIN dbo.Lotes l WITH (UPDLOCK, HOLDLOCK) ON l.LoteId = s.LoteId
                JOIN dbo.Campanias c ON c.Nombre = s.CampaniaNombre AND c.EmpresaId = l.EmpresaId
                WHERE s.SiembraId = @SiembraId AND (@IncluirTodos = 1 OR EXISTS
                    (SELECT 1 FROM dbo.UsuarioEmpresas ue WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = l.EmpresaId AND ue.Activo = 1));
                """;
            int loteId, campaniaId;
            string ciclo, periodo;
            bool activo;
            await using (var context = new SqlCommand(contextSql, connection, transaction))
            {
                context.Parameters.AddWithValue("@SiembraId", siembraId);
                context.Parameters.AddWithValue("@UsuarioId", usuarioId);
                context.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
                await using var reader = await context.ExecuteReaderAsync();
                if (!await reader.ReadAsync()) return false;
                loteId = reader.GetInt32(0);
                ciclo = reader.GetString(1);
                campaniaId = reader.GetInt32(2);
                periodo = reader.GetString(3);
                activo = reader.GetBoolean(4);
            }
            if (!activo) throw new LoteDeshabilitacionBloqueadaException("El lote ya está deshabilitado.");
            await using (var activeCampaign = new SqlCommand("""
                SELECT COUNT(1) FROM dbo.CampaniaCombinaciones cc
                JOIN dbo.Lotes l ON l.LoteId = cc.LoteId AND l.Activo = 1
                WHERE cc.CampaniaId = @CampaniaId AND cc.Estado <> N'Finalizado';
                """, connection, transaction))
            {
                activeCampaign.Parameters.AddWithValue("@CampaniaId", campaniaId);
                if (Convert.ToInt32(await activeCampaign.ExecuteScalarAsync()) == 0)
                    throw new LoteDeshabilitacionBloqueadaException("La campaña ya finalizó.");
            }
            if (request.Motivo == "Alquilado recientemente") throw new LoteDeshabilitacionBloqueadaException("Seleccioná un motivo válido para esta siembra.");
            if (request.Motivo == "Siniestro") ValidarFechaSiniestroEnPeriodo(request, periodo);

            const string chainSql = """
                SELECT SiembraId, Estado, EstadoSiembra, DeshabilitacionId
                FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
                WHERE LoteId = @LoteId AND CampaniaNombre = @CampaniaNombre AND CicloEstacional = @Ciclo
                  AND DeshabilitacionId IS NULL ORDER BY SiembraId DESC;
                """;
            var chain = new List<(int Id, string Estado, string EstadoSiembra)>();
            await using (var query = new SqlCommand(chainSql, connection, transaction))
            {
                query.Parameters.AddWithValue("@LoteId", loteId);
                query.Parameters.AddWithValue("@CampaniaNombre", await ObtenerNombreCampaniaAsync(connection, transaction, campaniaId));
                query.Parameters.AddWithValue("@Ciclo", ciclo);
                await using var reader = await query.ExecuteReaderAsync();
                while (await reader.ReadAsync()) chain.Add((reader.GetInt32(0), reader.GetString(1), reader.GetString(2)));
            }
            if (!chain.Any(s => s.Id == siembraId)) throw new LoteDeshabilitacionBloqueadaException("Esta siembra ya no está activa.");
            if (chain.Any(s => s.EstadoSiembra != "Finalizado")) throw new LoteDeshabilitacionBloqueadaException("Finalizá la siembra o resiembra antes de deshabilitarla.");
            var ultima = chain[0];
            await using (var harvest = new SqlCommand("""
                SELECT COUNT(1) FROM dbo.Cosechas c
                WHERE c.SiembraId IN (SELECT s.SiembraId FROM dbo.Siembras s
                                       WHERE s.LoteId = @LoteId AND s.CampaniaNombre = @CampaniaNombre
                                         AND s.CicloEstacional = @Ciclo AND s.DeshabilitacionId IS NULL)
                   OR (c.SiembraId IS NULL AND c.LoteId = @LoteId AND c.CampaniaNombre = @CampaniaNombre
                       AND EXISTS (SELECT 1 FROM dbo.Siembras s WHERE s.LoteId = @LoteId
                                   AND s.CampaniaNombre = @CampaniaNombre AND s.CicloEstacional = @Ciclo
                                   AND s.DeshabilitacionId IS NULL AND s.Producto = c.Producto));
                """, connection, transaction))
            {
                harvest.Parameters.AddWithValue("@LoteId", loteId);
                harvest.Parameters.AddWithValue("@CampaniaNombre", await ObtenerNombreCampaniaAsync(connection, transaction, campaniaId));
                harvest.Parameters.AddWithValue("@Ciclo", ciclo);
                if (Convert.ToInt32(await harvest.ExecuteScalarAsync()) > 0) throw new LoteDeshabilitacionBloqueadaException("La siembra ya tiene una cosecha registrada.");
            }
            var winterPlan = false;
            if (ciclo == "Verano")
            {
                await using var check = new SqlCommand("SELECT COUNT(1) FROM dbo.CampaniaCombinaciones WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId AND CicloEstacional = N'Invierno';", connection, transaction);
                check.Parameters.AddWithValue("@CampaniaId", campaniaId);
                check.Parameters.AddWithValue("@LoteId", loteId);
                winterPlan = Convert.ToInt32(await check.ExecuteScalarAsync()) > 0;
            }
            if (winterPlan && request.AfectarInvierno is null) throw new LoteDeshabilitacionBloqueadaException("Indicá si la baja afecta la planificación de invierno.");
            var full = !winterPlan || request.AfectarInvierno == true;
            if (winterPlan && full)
            {
                await using var check = new SqlCommand("SELECT COUNT(1) FROM dbo.Siembras WHERE LoteId = @LoteId AND CampaniaNombre = @CampaniaNombre AND CicloEstacional = N'Invierno';", connection, transaction);
                check.Parameters.AddWithValue("@LoteId", loteId);
                check.Parameters.AddWithValue("@CampaniaNombre", await ObtenerNombreCampaniaAsync(connection, transaction, campaniaId));
                if (Convert.ToInt32(await check.ExecuteScalarAsync()) > 0) throw new LoteDeshabilitacionBloqueadaException("El cultivo de invierno ya tiene siembras; no se puede retirar su planificación.");
            }
            var bajaId = await RegistrarDeshabilitacionAsync(connection, transaction, loteId, usuarioId, request, ultima.Id);
            await using (var mark = new SqlCommand("""
                UPDATE dbo.LoteDeshabilitaciones SET AfectoLote = @Full, CicloEstacional = @Ciclo,
                    CampaniaId = @CampaniaId, EstadoSeguimientoAnterior = @EstadoAnterior
                WHERE LoteDeshabilitacionId = @BajaId;
                UPDATE dbo.Siembras SET DeshabilitacionId = @BajaId, FechaModificacion = SYSDATETIME()
                WHERE LoteId = @LoteId AND CampaniaNombre = @CampaniaNombre AND CicloEstacional = @Ciclo AND DeshabilitacionId IS NULL;
                UPDATE dbo.Siembras SET Estado = N'Finalizado', FechaModificacion = SYSDATETIME() WHERE SiembraId = @UltimaId;
                """, connection, transaction))
            {
                mark.Parameters.AddWithValue("@Full", full);
                mark.Parameters.AddWithValue("@Ciclo", ciclo);
                mark.Parameters.AddWithValue("@CampaniaId", campaniaId);
                mark.Parameters.AddWithValue("@EstadoAnterior", ultima.Estado);
                mark.Parameters.AddWithValue("@BajaId", bajaId);
                mark.Parameters.AddWithValue("@LoteId", loteId);
                mark.Parameters.AddWithValue("@CampaniaNombre", await ObtenerNombreCampaniaAsync(connection, transaction, campaniaId));
                mark.Parameters.AddWithValue("@UltimaId", ultima.Id);
                await mark.ExecuteNonQueryAsync();
            }
            if (request.Motivo == "Siniestro")
            {
                await using var automatic = new SqlCommand("""
                    INSERT INTO dbo.SiembraSeguimientos (SiembraId, Fecha, TipoRegistro, Siniestro, Alcance, Observaciones, Cultivo, EsResiembra)
                    OUTPUT INSERTED.SiembraSeguimientoId
                    SELECT SiembraId, @Fecha, N'Siniestro', @Siniestro, N'Total', N'Registro automático por deshabilitación de la siembra.', Producto, 0
                    FROM dbo.Siembras WHERE SiembraId = @SiembraId;
                    """, connection, transaction);
                automatic.Parameters.AddWithValue("@SiembraId", ultima.Id);
                automatic.Parameters.AddWithValue("@Fecha", request.FechaSiniestro!.Value.Date);
                automatic.Parameters.AddWithValue("@Siniestro", request.Siniestro!);
                var automaticId = Convert.ToInt32(await automatic.ExecuteScalarAsync());
                await using var link = new SqlCommand("UPDATE dbo.LoteDeshabilitaciones SET SeguimientoAutomaticoId = @AutomaticId WHERE LoteDeshabilitacionId = @BajaId;", connection, transaction);
                link.Parameters.AddWithValue("@AutomaticId", automaticId);
                link.Parameters.AddWithValue("@BajaId", bajaId);
                await link.ExecuteNonQueryAsync();
            }
            if (winterPlan && full)
            {
                await using var remove = new SqlCommand("""
                    INSERT INTO dbo.CampaniaPlanificacionBajas (CampaniaId, LoteId, Producto, CicloEstacional, Motivo, Detalle, Siniestro, FechaSiniestro, LoteDeshabilitado, LoteDeshabilitacionId, UsuarioId)
                    SELECT CampaniaId, LoteId, Producto, CicloEstacional, @Motivo, @Detalle, @Siniestro, @FechaSiniestro, 1, @BajaId, @UsuarioId
                    FROM dbo.CampaniaCombinaciones WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId AND CicloEstacional = N'Invierno';
                    DELETE FROM dbo.CampaniaCombinaciones WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId AND CicloEstacional = N'Invierno';
                    """, connection, transaction);
                remove.Parameters.AddWithValue("@CampaniaId", campaniaId);
                remove.Parameters.AddWithValue("@LoteId", loteId);
                remove.Parameters.AddWithValue("@Motivo", request.Motivo);
                remove.Parameters.AddWithValue("@Detalle", request.Motivo == "Otro motivo" ? request.Detalle!.Trim() : DBNull.Value);
                remove.Parameters.AddWithValue("@Siniestro", request.Motivo == "Siniestro" ? request.Siniestro! : DBNull.Value);
                remove.Parameters.AddWithValue("@FechaSiniestro", request.Motivo == "Siniestro" ? request.FechaSiniestro!.Value.Date : DBNull.Value);
                remove.Parameters.AddWithValue("@BajaId", bajaId);
                remove.Parameters.AddWithValue("@UsuarioId", usuarioId);
                await remove.ExecuteNonQueryAsync();
            }
            await using (var close = new SqlCommand("""
                UPDATE dbo.CampaniaCombinaciones SET Estado = N'Finalizado', EtapaActual = N'Finalizada'
                WHERE CampaniaId = @CampaniaId AND LoteId = @LoteId AND CicloEstacional = @Ciclo;
                """, connection, transaction))
            {
                close.Parameters.AddWithValue("@CampaniaId", campaniaId);
                close.Parameters.AddWithValue("@LoteId", loteId);
                close.Parameters.AddWithValue("@Ciclo", ciclo);
                await close.ExecuteNonQueryAsync();
            }
            if (full)
            {
                await using var disable = new SqlCommand("UPDATE dbo.Lotes SET Activo = 0, FechaModificacion = SYSDATETIME() WHERE LoteId = @LoteId;", connection, transaction);
                disable.Parameters.AddWithValue("@LoteId", loteId);
                await disable.ExecuteNonQueryAsync();
            }
            await using (var recalc = new SqlCommand(LoteCultivoEstadoSql.Recalcular, connection, transaction))
            {
                recalc.Parameters.AddWithValue("@LoteId", loteId);
                await recalc.ExecuteNonQueryAsync();
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

    private static async Task<string> ObtenerNombreCampaniaAsync(SqlConnection connection, SqlTransaction transaction, int campaniaId)
    {
        await using var command = new SqlCommand("SELECT Nombre FROM dbo.Campanias WHERE CampaniaId = @CampaniaId;", connection, transaction);
        command.Parameters.AddWithValue("@CampaniaId", campaniaId);
        return (string)(await command.ExecuteScalarAsync() ?? throw new InvalidOperationException("Campaña no encontrada."));
    }

    private static async Task RestaurarPlanInviernoAsync(SqlConnection connection, SqlTransaction transaction, int bajaId)
    {
        await using var command = new SqlCommand("""
            IF EXISTS (SELECT 1 FROM dbo.CampaniaPlanificacionBajas p JOIN dbo.CampaniaCombinaciones cc
                       ON cc.CampaniaId = p.CampaniaId AND cc.LoteId = p.LoteId AND cc.CicloEstacional = p.CicloEstacional
                       WHERE p.LoteDeshabilitacionId = @BajaId)
                THROW 50001, N'El ciclo de invierno ya fue planificado nuevamente; no se puede restaurar la baja anterior.', 1;
            INSERT INTO dbo.CampaniaCombinaciones (CampaniaId, LoteId, Producto, CicloEstacional, FechaInicio, FechaFin, Estado, EtapaActual)
            SELECT p.CampaniaId, p.LoteId, p.Producto, p.CicloEstacional, c.FechaInicio, c.FechaFin, N'Pendiente', N'Sin etapa'
            FROM dbo.CampaniaPlanificacionBajas p
            JOIN dbo.Campanias c ON c.CampaniaId = p.CampaniaId
            WHERE p.LoteDeshabilitacionId = @BajaId
              AND NOT EXISTS (SELECT 1 FROM dbo.CampaniaCombinaciones cc
                              WHERE cc.CampaniaId = p.CampaniaId AND cc.LoteId = p.LoteId AND cc.CicloEstacional = p.CicloEstacional);
            DELETE FROM dbo.CampaniaPlanificacionBajas WHERE LoteDeshabilitacionId = @BajaId;
            """, connection, transaction);
        command.Parameters.AddWithValue("@BajaId", bajaId);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task RestaurarPlanEjecutadoAsync(SqlConnection connection, SqlTransaction transaction, int bajaId)
    {
        await using var command = new SqlCommand("""
            UPDATE cc SET Estado = N'En curso', EtapaActual = N'Siembra'
            FROM dbo.CampaniaCombinaciones cc
            JOIN dbo.LoteDeshabilitaciones d ON d.CampaniaId = cc.CampaniaId
                AND d.LoteId = cc.LoteId AND d.CicloEstacional = cc.CicloEstacional
            WHERE d.LoteDeshabilitacionId = @BajaId;
            """, connection, transaction);
        command.Parameters.AddWithValue("@BajaId", bajaId);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<bool> HabilitarSiembraAsync(int siembraId, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        int loteId, bajaId;
        bool afectaLote;
        await using (var context = new SqlCommand("""
            SELECT s.LoteId, d.LoteDeshabilitacionId, d.AfectoLote
            FROM dbo.Siembras s JOIN dbo.LoteDeshabilitaciones d ON d.LoteDeshabilitacionId = s.DeshabilitacionId
            JOIN dbo.Lotes l ON l.LoteId = s.LoteId
            WHERE s.SiembraId = @SiembraId AND d.LoteDeshabilitacionId =
                (SELECT MAX(d2.LoteDeshabilitacionId) FROM dbo.LoteDeshabilitaciones d2 WHERE d2.LoteId = s.LoteId)
              AND (@IncluirTodos = 1 OR EXISTS (SELECT 1 FROM dbo.UsuarioEmpresas ue WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = l.EmpresaId AND ue.Activo = 1));
            """, connection))
        {
            context.Parameters.AddWithValue("@SiembraId", siembraId);
            context.Parameters.AddWithValue("@UsuarioId", usuarioId);
            context.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
            await using var reader = await context.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return false;
            loteId = reader.GetInt32(0);
            bajaId = reader.GetInt32(1);
            afectaLote = reader.GetBoolean(2);
        }
        if (afectaLote)
        {
            await using var activeCheck = new SqlCommand("SELECT Activo FROM dbo.Lotes WHERE LoteId = @LoteId;", connection);
            activeCheck.Parameters.AddWithValue("@LoteId", loteId);
            if (Convert.ToBoolean(await activeCheck.ExecuteScalarAsync()))
                throw new LoteDeshabilitacionBloqueadaException("La baja anterior ya no se puede revertir porque el lote fue habilitado para nuevas siembras.");
            return await HabilitarAsync(loteId, usuarioId, incluirTodos, "Restaurar");
        }
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        try
        {
            await using (var winter = new SqlCommand("""
                SELECT COUNT(1) FROM dbo.LoteDeshabilitaciones d
                JOIN dbo.Campanias c ON c.CampaniaId = d.CampaniaId
                JOIN dbo.Siembras s ON s.LoteId = d.LoteId AND s.CampaniaNombre = c.Nombre
                    AND s.CicloEstacional = N'Invierno' AND s.DeshabilitacionId IS NULL
                WHERE d.LoteDeshabilitacionId = @BajaId AND d.CicloEstacional = N'Verano';
                """, connection, transaction))
            {
                winter.Parameters.AddWithValue("@BajaId", bajaId);
                if (Convert.ToInt32(await winter.ExecuteScalarAsync()) > 0)
                    throw new LoteDeshabilitacionBloqueadaException("El cultivo de invierno ya fue sembrado; no se puede restaurar la siembra de verano sin alterar ese seguimiento.");
            }
            await using var restore = new SqlCommand("""
                IF NOT EXISTS (SELECT 1 FROM dbo.Campanias c JOIN dbo.LoteDeshabilitaciones d ON d.CampaniaId = c.CampaniaId
                               WHERE d.LoteDeshabilitacionId = @BajaId AND EXISTS
                                 (SELECT 1 FROM dbo.CampaniaCombinaciones cc JOIN dbo.Lotes l ON l.LoteId = cc.LoteId
                                  WHERE cc.CampaniaId = c.CampaniaId AND cc.Estado <> N'Finalizado' AND l.Activo = 1))
                    THROW 50001, N'La campaña ya finalizó; no se puede revertir esta baja.', 1;
                UPDATE dbo.Siembras SET DeshabilitacionId = NULL, FechaModificacion = SYSDATETIME()
                WHERE LoteId = @LoteId AND DeshabilitacionId = @BajaId;
                UPDATE s SET Estado = d.EstadoSeguimientoAnterior, FechaModificacion = SYSDATETIME()
                FROM dbo.Siembras s JOIN dbo.LoteDeshabilitaciones d ON d.SiembraId = s.SiembraId
                WHERE d.LoteDeshabilitacionId = @BajaId AND d.EstadoSeguimientoAnterior IS NOT NULL;
                DELETE ss FROM dbo.SiembraSeguimientos ss JOIN dbo.LoteDeshabilitaciones d ON d.SeguimientoAutomaticoId = ss.SiembraSeguimientoId
                WHERE d.LoteDeshabilitacionId = @BajaId;
                """, connection, transaction);
            restore.Parameters.AddWithValue("@LoteId", loteId);
            restore.Parameters.AddWithValue("@BajaId", bajaId);
            await restore.ExecuteNonQueryAsync();
            await RestaurarPlanInviernoAsync(connection, transaction, bajaId);
            await RestaurarPlanEjecutadoAsync(connection, transaction, bajaId);
            await using var delete = new SqlCommand("DELETE FROM dbo.LoteDeshabilitaciones WHERE LoteDeshabilitacionId = @BajaId;", connection, transaction);
            delete.Parameters.AddWithValue("@BajaId", bajaId);
            await delete.ExecuteNonQueryAsync();
            await using (var recalc = new SqlCommand(LoteCultivoEstadoSql.Recalcular, connection, transaction))
            {
                recalc.Parameters.AddWithValue("@LoteId", loteId);
                await recalc.ExecuteNonQueryAsync();
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

    public async Task<string?> ObtenerBloqueoDeshabilitacionAsync(int loteId, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        if (await ObtenerEstadoLoteAsync(connection, null, loteId, usuarioId, incluirTodos) is null) return null;
        return (await ObtenerEstadoOperativoAsync(connection, null, loteId)).Bloqueo;
    }

    public async Task<string?> ObtenerPeriodoDeshabilitacionAsync(int loteId, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        if (await ObtenerEstadoLoteAsync(connection, null, loteId, usuarioId, incluirTodos) is null) return null;
        return await BuscarPeriodoDeshabilitacionAsync(connection, null, loteId, null);
    }

    public async Task<bool> PuedeDeshabilitarPorAlquilerRecienteAsync(int loteId, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        if (await ObtenerEstadoLoteAsync(connection, null, loteId, usuarioId, incluirTodos) is null) return false;
        return await PuedeDeshabilitarPorAlquilerRecienteAsync(connection, null, loteId);
    }

    private static async Task<bool> PuedeDeshabilitarPorAlquilerRecienteAsync(SqlConnection connection, SqlTransaction? transaction, int loteId)
    {
        const string sql = """
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1 FROM dbo.Lotes l
                INNER JOIN dbo.Campanias c ON c.EmpresaId = l.EmpresaId
                WHERE l.LoteId = @LoteId
                  AND YEAR(l.FechaCreacion) BETWEEN TRY_CONVERT(int, LEFT(c.Periodo, 4))
                                                AND TRY_CONVERT(int, RIGHT(c.Periodo, 4))
                  AND EXISTS (
                      SELECT 1 FROM dbo.CampaniaCombinaciones activa
                      INNER JOIN dbo.Lotes loteActivo ON loteActivo.LoteId = activa.LoteId AND loteActivo.Activo = 1
                      WHERE activa.CampaniaId = c.CampaniaId AND activa.Estado <> N'Finalizado'
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.CampaniaCombinaciones asignada
                      INNER JOIN dbo.Campanias ca ON ca.CampaniaId = asignada.CampaniaId
                      WHERE asignada.LoteId = l.LoteId AND ca.Periodo = c.Periodo
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.Siembras s WHERE s.LoteId = l.LoteId
                        AND LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9) = c.Periodo
                  )
            ) THEN 1 ELSE 0 END AS bit);
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@LoteId", loteId);
        return Convert.ToBoolean(await command.ExecuteScalarAsync());
    }

    public async Task<HabilitacionLoteDto?> ObtenerHabilitacionAsync(int loteId, int usuarioId, bool incluirTodos = false)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        if (await ObtenerEstadoLoteAsync(connection, null, loteId, usuarioId, incluirTodos) is null) return null;
        return await LeerHabilitacionAsync(connection, null, loteId);
    }

    private static async Task<HabilitacionLoteDto> LeerHabilitacionAsync(SqlConnection connection, SqlTransaction? transaction, int loteId)
    {
        var result = new HabilitacionLoteDto();
        const string campaignSql = """
            SELECT TOP (1) c.CampaniaId, c.Nombre, c.Periodo,
                CAST(CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.CampaniaCombinaciones cc
                    JOIN dbo.Lotes l ON l.LoteId = cc.LoteId AND l.Activo = 1
                    WHERE cc.CampaniaId = c.CampaniaId AND cc.Estado <> N'Finalizado'
                ) THEN 1 ELSE 0 END AS bit) AS Activa
            FROM dbo.Campanias c
            JOIN dbo.Lotes origen ON origen.EmpresaId = c.EmpresaId
            WHERE origen.LoteId = @LoteId
            ORDER BY CASE WHEN EXISTS (
                SELECT 1 FROM dbo.LoteDeshabilitaciones d
                INNER JOIN dbo.Siembras s ON s.SiembraId = d.SiembraId
                WHERE d.LoteId = @LoteId
                  AND d.LoteDeshabilitacionId = (SELECT MAX(d2.LoteDeshabilitacionId)
                                                   FROM dbo.LoteDeshabilitaciones d2 WHERE d2.LoteId = @LoteId)
                  AND LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9) = c.Periodo
            ) THEN 0 ELSE 1 END,
            Activa DESC, c.Periodo DESC, c.CampaniaId DESC;
            """;
        await using (var command = new SqlCommand(campaignSql, connection, transaction))
        {
            command.Parameters.AddWithValue("@LoteId", loteId);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                result.CampaniaId = reader.GetInt32(0);
                result.CampaniaNombre = reader.GetString(1);
                result.Periodo = reader.GetString(2);
                result.CampaniaActiva = reader.GetBoolean(3);
            }
        }
        if (result.Periodo is not null)
        {
            await using var count = new SqlCommand("SELECT COUNT(1) FROM dbo.Siembras WHERE LoteId = @LoteId AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = @Periodo;", connection, transaction);
            count.Parameters.AddWithValue("@LoteId", loteId);
            count.Parameters.AddWithValue("@Periodo", result.Periodo);
            result.TieneSiembras = Convert.ToInt32(await count.ExecuteScalarAsync()) > 0;
        }
        await using (var command = new SqlCommand("""
            SELECT TOP (1) d.LoteDeshabilitacionId, d.SiembraId, d.Motivo, d.Detalle, d.Siniestro,
                   d.FechaSiniestro, d.EstadoSeguimientoAnterior, d.SeguimientoAutomaticoId,
                   s.Nombre, s.TipoRegistro, s.Producto
            FROM dbo.LoteDeshabilitaciones d
            LEFT JOIN dbo.Siembras s ON s.SiembraId = d.SiembraId
            WHERE d.LoteId = @LoteId
            ORDER BY d.LoteDeshabilitacionId DESC;
            """, connection, transaction))
        {
            command.Parameters.AddWithValue("@LoteId", loteId);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                result.UltimaBajaId = reader.GetInt32(0);
                result.UltimaSiembraId = reader.IsDBNull(1) ? null : reader.GetInt32(1);
                result.Motivo = reader.GetString(2);
                result.Detalle = reader.IsDBNull(3) ? null : reader.GetString(3);
                result.Siniestro = reader.IsDBNull(4) ? null : reader.GetString(4);
                result.FechaSiniestro = reader.IsDBNull(5) ? null : reader.GetDateTime(5);
                result.EstadoSeguimientoAnterior = reader.IsDBNull(6) ? null : reader.GetString(6);
                result.SeguimientoAutomaticoId = reader.IsDBNull(7) ? null : reader.GetInt32(7);
                result.UltimaSiembraNombre = reader.IsDBNull(8) ? null : reader.GetString(8);
                result.UltimaSiembraTipo = reader.IsDBNull(9) ? null : reader.GetString(9);
                result.UltimoCultivo = reader.IsDBNull(10) ? null : reader.GetString(10);
            }
        }
        if (result.CampaniaActiva && result.TieneSiembras && result.UltimaBajaId.HasValue && result.UltimaSiembraId is null)
            result.PuedeRestaurar = true; // La última baja no afectó etapas: solo se revierte el estado del lote.
        if (result.CampaniaActiva && result.TieneSiembras && result.UltimaBajaId.HasValue
            && result.UltimaSiembraId.HasValue && result.EstadoSeguimientoAnterior is not null)
        {
            await using var check = new SqlCommand("""
                SELECT COUNT(1) FROM dbo.Siembras
                WHERE SiembraId = @SiembraId AND LoteId = @LoteId AND DeshabilitacionId = @BajaId
                  AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = @Periodo;
                """, connection, transaction);
            check.Parameters.AddWithValue("@SiembraId", result.UltimaSiembraId.Value);
            check.Parameters.AddWithValue("@LoteId", loteId);
            check.Parameters.AddWithValue("@BajaId", result.UltimaBajaId.Value);
            check.Parameters.AddWithValue("@Periodo", result.Periodo!);
            result.PuedeRestaurar = Convert.ToInt32(await check.ExecuteScalarAsync()) == 1;
        }
        return result;
    }

    public async Task<bool> HabilitarAsync(int loteId, int usuarioId, bool incluirTodos = false, string? modo = null)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        try
        {
            var activo = await ObtenerEstadoLoteAsync(connection, transaction, loteId, usuarioId, incluirTodos);
            if (activo is null) return false;
            if (activo.Value) return true;
            var contexto = await LeerHabilitacionAsync(connection, transaction, loteId);
            if (contexto.TieneSiembras)
            {
                if (!contexto.CampaniaActiva)
                    throw new LoteDeshabilitacionBloqueadaException("La campaña ya finalizó: no se puede revertir la baja ni registrar una nueva siembra en ella.");
                if (modo == "Restaurar")
                {
                    if (!contexto.PuedeRestaurar)
                        throw new LoteDeshabilitacionBloqueadaException("Esta baja anterior no conserva el estado necesario para restaurar las siembras con seguridad. Podés habilitar el lote para nuevas siembras.");
                    if (contexto.UltimaSiembraId.HasValue)
                    {
                        await RestaurarPlanInviernoAsync(connection, transaction, contexto.UltimaBajaId!.Value);
                        await RestaurarPlanEjecutadoAsync(connection, transaction, contexto.UltimaBajaId.Value);
                        await using var restore = new SqlCommand("""
                        UPDATE dbo.Siembras SET DeshabilitacionId = NULL, FechaModificacion = SYSDATETIME()
                        WHERE LoteId = @LoteId AND DeshabilitacionId = @BajaId;
                        UPDATE dbo.Siembras SET Estado = @EstadoAnterior, FechaModificacion = SYSDATETIME()
                        WHERE SiembraId = @SiembraId;
                        DELETE FROM dbo.SiembraSeguimientos WHERE SiembraSeguimientoId = @SeguimientoId AND SiembraId = @SiembraId;
                        DELETE FROM dbo.LoteDeshabilitaciones WHERE LoteDeshabilitacionId = @BajaId;
                        """, connection, transaction);
                        restore.Parameters.AddWithValue("@LoteId", loteId);
                        restore.Parameters.AddWithValue("@BajaId", contexto.UltimaBajaId!.Value);
                        restore.Parameters.AddWithValue("@EstadoAnterior", contexto.EstadoSeguimientoAnterior!);
                        restore.Parameters.AddWithValue("@SiembraId", contexto.UltimaSiembraId.Value);
                        restore.Parameters.AddWithValue("@SeguimientoId", (object?)contexto.SeguimientoAutomaticoId ?? DBNull.Value);
                        await restore.ExecuteNonQueryAsync();
                    }
                    else
                    {
                        await using var quitarMotivo = new SqlCommand("DELETE FROM dbo.LoteDeshabilitaciones WHERE LoteDeshabilitacionId = @BajaId AND LoteId = @LoteId;", connection, transaction);
                        quitarMotivo.Parameters.AddWithValue("@BajaId", contexto.UltimaBajaId!.Value);
                        quitarMotivo.Parameters.AddWithValue("@LoteId", loteId);
                        await quitarMotivo.ExecuteNonQueryAsync();
                    }
                }
                else if (modo == "Nuevas")
                {
                    // Compatibilidad: marcar también las siembras de bajas previas al registro del snapshot.
                    await using var mark = new SqlCommand("""
                        UPDATE dbo.Siembras SET DeshabilitacionId = @BajaId
                        WHERE LoteId = @LoteId AND DeshabilitacionId IS NULL
                          AND LEFT(LTRIM(RTRIM(ISNULL(CampaniaNombre, N''))), 9) = @Periodo;
                        """, connection, transaction);
                    mark.Parameters.AddWithValue("@BajaId", (object?)contexto.UltimaBajaId ?? throw new LoteDeshabilitacionBloqueadaException("No se encontró el motivo de baja."));
                    mark.Parameters.AddWithValue("@LoteId", loteId);
                    mark.Parameters.AddWithValue("@Periodo", contexto.Periodo!);
                    await mark.ExecuteNonQueryAsync();
                    await using var cerrarCombinaciones = new SqlCommand("""
                        UPDATE cc SET Estado = N'Finalizado', EtapaActual = N'Finalizada'
                        FROM dbo.CampaniaCombinaciones cc
                        JOIN dbo.Campanias c ON c.CampaniaId = cc.CampaniaId
                        WHERE cc.LoteId = @LoteId AND c.Periodo = @Periodo
                          AND EXISTS (SELECT 1 FROM dbo.Siembras s
                                      WHERE s.LoteId = cc.LoteId AND s.Producto = cc.Producto
                                        AND s.CicloEstacional = cc.CicloEstacional
                                        AND s.DeshabilitacionId = @BajaId
                                        AND LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9) = c.Periodo);
                        """, connection, transaction);
                    cerrarCombinaciones.Parameters.AddWithValue("@LoteId", loteId);
                    cerrarCombinaciones.Parameters.AddWithValue("@Periodo", contexto.Periodo!);
                    cerrarCombinaciones.Parameters.AddWithValue("@BajaId", contexto.UltimaBajaId!.Value);
                    await cerrarCombinaciones.ExecuteNonQueryAsync();
                }
                else throw new LoteDeshabilitacionBloqueadaException("Elegí si querés restaurar las siembras o habilitar el lote para una nueva siembra.");
            }
            await using (var enable = new SqlCommand("UPDATE dbo.Lotes SET Activo = 1, FechaModificacion = SYSDATETIME() WHERE LoteId = @LoteId;", connection, transaction))
            {
                enable.Parameters.AddWithValue("@LoteId", loteId);
                await enable.ExecuteNonQueryAsync();
            }
            await using (var recalc = new SqlCommand(LoteCultivoEstadoSql.Recalcular, connection, transaction))
            {
                recalc.Parameters.AddWithValue("@LoteId", loteId);
                await recalc.ExecuteNonQueryAsync();
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

    private static async Task<string> BuscarPeriodoDeshabilitacionAsync(SqlConnection connection, SqlTransaction? transaction, int? loteId, int? empresaId)
    {
        const string sql = """
            SELECT COALESCE(
                (SELECT TOP (1) c.Periodo FROM dbo.CampaniaCombinaciones cc
                 INNER JOIN dbo.Campanias c ON c.CampaniaId = cc.CampaniaId
                 WHERE cc.LoteId = @LoteId ORDER BY c.Periodo DESC, c.CampaniaId DESC),
                (SELECT TOP (1) c.Periodo FROM dbo.Campanias c
                 WHERE c.EmpresaId = COALESCE(@EmpresaId, (SELECT EmpresaId FROM dbo.Lotes WHERE LoteId = @LoteId))
                 ORDER BY c.Periodo DESC, c.CampaniaId DESC));
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@LoteId", loteId.HasValue ? loteId.Value : DBNull.Value);
        command.Parameters.AddWithValue("@EmpresaId", empresaId.HasValue ? empresaId.Value : DBNull.Value);
        var periodo = await command.ExecuteScalarAsync() as string;
        if (!string.IsNullOrWhiteSpace(periodo)) return periodo;
        var firstYear = DateTime.Today.Month >= 6 ? DateTime.Today.Year : DateTime.Today.Year - 1;
        return $"{firstYear}-{firstYear + 1}";
    }

    private static void ValidarFechaSiniestroEnPeriodo(DeshabilitarLoteRequest request, string periodo)
    {
        if (periodo.Length != 9 || periodo[4] != '-' || !int.TryParse(periodo[..4], out var firstYear) || !int.TryParse(periodo[5..9], out var lastYear))
            throw new LoteDeshabilitacionBloqueadaException("No se pudo determinar el período de campaña para validar la fecha del siniestro.");
        var date = request.FechaSiniestro?.Date;
        if (date < new DateTime(firstYear, 1, 1) || date > new DateTime(lastYear, 12, 31))
            throw new LoteDeshabilitacionBloqueadaException($"La fecha del siniestro debe estar entre el 01/01/{firstYear} y el 31/12/{lastYear}.");
    }

    private static async Task<bool?> ObtenerEstadoLoteAsync(SqlConnection connection, SqlTransaction? transaction, int loteId, int usuarioId, bool incluirTodos)
    {
        const string sql = """
            SELECT Activo FROM dbo.Lotes WITH (UPDLOCK, HOLDLOCK) WHERE LoteId = @LoteId
              AND (@IncluirTodos = 1 OR EXISTS (SELECT 1 FROM dbo.UsuarioEmpresas ue WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = Lotes.EmpresaId AND ue.Activo = 1));
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        var result = await command.ExecuteScalarAsync();
        return result is null ? null : Convert.ToBoolean(result);
    }

    private static async Task<(int? UltimaSiembraId, DateTime? FechaInicio, string? Bloqueo)> ObtenerEstadoOperativoAsync(SqlConnection connection, SqlTransaction? transaction, int loteId)
    {
        const string siembraEnCursoSql = """
            SELECT TOP (1) SiembraId, FechaInicio FROM dbo.Siembras WITH (UPDLOCK, HOLDLOCK)
            WHERE LoteId = @LoteId AND EstadoSiembra <> N'Finalizado' AND DeshabilitacionId IS NULL
            ORDER BY SiembraId DESC;
            """;
        await using (var pendiente = new SqlCommand(siembraEnCursoSql, connection, transaction))
        {
            pendiente.Parameters.AddWithValue("@LoteId", loteId);
            await using var ongoing = await pendiente.ExecuteReaderAsync();
            if (await ongoing.ReadAsync())
                return (ongoing.GetInt32(0), ongoing.GetDateTime(1),
                    "Primero debés finalizar la siembra o resiembra en curso antes de deshabilitar este lote.");
        }
        const string sql = """
            DECLARE @Periodo NVARCHAR(9) = (
                SELECT TOP (1) ca.Periodo
                FROM dbo.CampaniaCombinaciones cc
                INNER JOIN dbo.Campanias ca ON ca.CampaniaId = cc.CampaniaId
                WHERE cc.LoteId = @LoteId
                ORDER BY ca.Periodo DESC, ca.CampaniaId DESC, cc.CampaniaCombinacionId DESC
            );
            SELECT TOP (1) s.SiembraId, s.FechaInicio, s.EstadoSiembra,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM dbo.Cosechas c
                       WHERE c.SiembraId = s.SiembraId
                          OR (c.SiembraId IS NULL AND c.LoteId = s.LoteId AND c.Producto = s.Producto
                              AND LEFT(LTRIM(RTRIM(ISNULL(c.CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9))
                   ) THEN 1 ELSE 0 END,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM dbo.Cosechas c
                       WHERE c.Estado <> N'Finalizado' AND (c.SiembraId = s.SiembraId
                          OR (c.SiembraId IS NULL AND c.LoteId = s.LoteId AND c.Producto = s.Producto
                              AND LEFT(LTRIM(RTRIM(ISNULL(c.CampaniaNombre, N''))), 9) = LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9)))
                   ) THEN 1 ELSE 0 END
            FROM dbo.Siembras s WITH (UPDLOCK, HOLDLOCK)
            WHERE s.LoteId = @LoteId
              AND s.DeshabilitacionId IS NULL
              AND (@Periodo IS NULL OR LEFT(LTRIM(RTRIM(ISNULL(s.CampaniaNombre, N''))), 9) = @Periodo)
            ORDER BY s.SiembraId DESC;
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@LoteId", loteId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return (null, null, null);
        var siembraId = reader.GetInt32(0);
        var fechaInicio = reader.GetDateTime(1);
        var estadoSiembra = reader.GetString(2);
        var tieneCosecha = reader.GetInt32(3) == 1;
        var cosechaEnCurso = reader.GetInt32(4) == 1;
        var bloqueo = cosechaEnCurso
            ? "Finalizá la cosecha antes de deshabilitar este lote."
            : estadoSiembra != "Finalizado"
                ? "Primero debés finalizar la siembra o resiembra en curso antes de deshabilitar este lote."
                : null;
        // Una cosecha finalizada es historial: la baja afecta al lote, no a la siembra ya cosechada.
        return tieneCosecha && bloqueo is null ? (null, null, null) : (siembraId, fechaInicio, bloqueo);
    }

    private static async Task<int> RegistrarDeshabilitacionAsync(SqlConnection connection, SqlTransaction transaction, int loteId, int usuarioId, DeshabilitarLoteRequest request, int? siembraId)
    {
        const string sql = """
            INSERT INTO dbo.LoteDeshabilitaciones (LoteId, SiembraId, Motivo, Detalle, Siniestro, FechaSiniestro, UsuarioId)
            OUTPUT INSERTED.LoteDeshabilitacionId
            VALUES (@LoteId, @SiembraId, @Motivo, @Detalle, @Siniestro, @FechaSiniestro, @UsuarioId);
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@SiembraId", siembraId.HasValue ? siembraId.Value : DBNull.Value);
        command.Parameters.AddWithValue("@Motivo", request.Motivo);
        command.Parameters.AddWithValue("@Detalle", string.IsNullOrWhiteSpace(request.Detalle) ? DBNull.Value : request.Detalle.Trim());
        command.Parameters.AddWithValue("@Siniestro", request.Siniestro is null ? DBNull.Value : request.Siniestro);
        command.Parameters.AddWithValue("@FechaSiniestro", request.FechaSiniestro.HasValue ? request.FechaSiniestro.Value.Date : DBNull.Value);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static async Task<int> ObtenerEmpresaPrincipalAsync(SqlConnection connection, SqlTransaction? transaction, int usuarioId, bool incluirTodos)
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

    private static async Task<int?> ObtenerEmpresaDelLoteAsync(SqlConnection connection, SqlTransaction? transaction, int loteId, int usuarioId, bool incluirTodos)
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
        return result is null or DBNull ? null : Convert.ToInt32(result);
    }

    private static async Task<LoteSuperpuestoInfo?> BuscarLoteSuperpuestoAsync(
        SqlConnection connection,
        SqlTransaction? transaction,
        int empresaId,
        IEnumerable<LoteCoordenadaDto> coordenadas,
        int? excluirLoteId = null)
    {
        const string sql = """
            DECLARE @Nuevo geometry = geometry::STGeomFromText(@Poligono, 4326).MakeValid();
            DECLARE @AreaNuevo float = @Nuevo.STArea();

            ;WITH PoligonosExistentes AS (
                SELECT l.LoteId,
                       l.Nombre,
                       geometry::STGeomFromText(N'POLYGON((' + puntos.Puntos + N',' + primero.Punto + N'))', 4326).MakeValid() AS Geometria
                FROM dbo.Lotes AS l
                CROSS APPLY (
                    SELECT STRING_AGG(CONVERT(nvarchar(max), CONCAT(CONVERT(varchar(50), lc.Longitud), N' ', CONVERT(varchar(50), lc.Latitud))), N',')
                           WITHIN GROUP (ORDER BY lc.Orden) AS Puntos
                    FROM dbo.LoteCoordenadas AS lc
                    WHERE lc.LoteId = l.LoteId
                ) AS puntos
                CROSS APPLY (
                    SELECT TOP (1) CONCAT(CONVERT(varchar(50), lc.Longitud), N' ', CONVERT(varchar(50), lc.Latitud)) AS Punto
                    FROM dbo.LoteCoordenadas AS lc
                    WHERE lc.LoteId = l.LoteId
                    ORDER BY lc.Orden
                ) AS primero
                WHERE l.EmpresaId = @EmpresaId
                  AND (@ExcluirLoteId IS NULL OR l.LoteId <> @ExcluirLoteId)
                  AND puntos.Puntos IS NOT NULL
                  AND (SELECT COUNT(*) FROM dbo.LoteCoordenadas AS lc WHERE lc.LoteId = l.LoteId) >= 3
            ), Superposiciones AS (
                SELECT LoteId,
                       Nombre,
                       Geometria.STArea() AS AreaExistente,
                       Geometria.STIntersection(@Nuevo).STArea() AS AreaComun
                FROM PoligonosExistentes
                WHERE Geometria.STIntersects(@Nuevo) = 1
            )
            SELECT TOP (1) LoteId, Nombre
            FROM Superposiciones
            WHERE @AreaNuevo > 0
              AND AreaExistente > 0
              AND AreaComun / AreaExistente >= 0.90
              AND AreaComun / @AreaNuevo >= 0.90
            ORDER BY AreaComun DESC, LoteId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@ExcluirLoteId", excluirLoteId.HasValue ? excluirLoteId.Value : (object)DBNull.Value);
        command.Parameters.AddWithValue("@Poligono", CrearPoligonoWkt(coordenadas));
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync()
            ? new LoteSuperpuestoInfo(reader.GetInt32(0), reader.GetString(1))
            : null;
    }

    private static string CrearPoligonoWkt(IEnumerable<LoteCoordenadaDto> coordenadas)
    {
        var puntos = coordenadas
            .OrderBy(coordenada => coordenada.Orden)
            .Select(coordenada => string.Create(CultureInfo.InvariantCulture, $"{coordenada.Longitud} {coordenada.Latitud}"))
            .ToList();

        if (puntos.Count < 3)
        {
            throw new InvalidOperationException("Un lote debe tener al menos tres coordenadas para comparar su poligono.");
        }

        puntos.Add(puntos[0]);
        return $"POLYGON(({string.Join(',', puntos)}))";
    }

    private static LoteSuperpuestoException CrearExcepcionLoteSuperpuesto(LoteSuperpuestoInfo loteSuperpuesto) =>
        new(LoteSuperpuestoException.CrearMensaje(loteSuperpuesto));

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
        command.Parameters.AddWithValue("@CultivoAnterior", request.CultivoAnterior.Trim());
        command.Parameters.AddWithValue("@CultivoAnteriorCampania", request.CultivoAnteriorCampania.Trim());
        command.Parameters.AddWithValue("@Hectareas", request.Hectareas);
        command.Parameters.AddWithValue("@SuperficieTotal", request.SuperficieTotal);
    }

    private async Task<List<LoteCultivoHistorialDto>> ObtenerHistorialCultivosAsync(int loteId, int usuarioId, bool incluirTodos)
    {
        const string sql = """
            SELECT COALESCE(c.CampaniaNombre, N'Sin campaña'), c.Producto,
                   MIN(c.FechaInicio) AS FechaInicio, MAX(c.FechaFinReal) AS FechaFin,
                   N'Cosechado', 0 AS OrdenInicial
            FROM dbo.Cosechas AS c
            INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
            WHERE c.LoteId = @LoteId
              AND c.Estado = N'Finalizado'
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
            GROUP BY c.CampaniaNombre, c.Producto
            UNION ALL

            SELECT l.CultivoAnteriorCampania, l.CultivoAnterior, NULL, NULL, N'Cosechado', 1 AS OrdenInicial
            FROM dbo.Lotes AS l
            WHERE l.LoteId = @LoteId
              AND NULLIF(LTRIM(RTRIM(l.CultivoAnterior)), N'') IS NOT NULL
              AND NULLIF(LTRIM(RTRIM(l.CultivoAnteriorCampania)), N'') IS NOT NULL
              AND LTRIM(RTRIM(l.CultivoAnterior)) <> N'Sin dato'
              AND LTRIM(RTRIM(l.CultivoAnteriorCampania)) <> N'Sin dato'
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
            ORDER BY OrdenInicial, FechaFin DESC, FechaInicio DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@LoteId", loteId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        var historial = new List<LoteCultivoHistorialDto>();
        while (await reader.ReadAsync())
        {
            historial.Add(new LoteCultivoHistorialDto
            {
                Campania = reader.GetString(0),
                Cultivo = reader.GetString(1),
                FechaInicio = reader.IsDBNull(2) ? null : reader.GetDateTime(2),
                FechaFin = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                EstadoCultivo = reader.GetString(4) switch
                {
                    "Finalizado" => "Cosechado",
                    "Cosechado" => "Cosechado",
                    "En curso" => "Cultivado",
                    "Cultivado" => "Cultivado",
                    _ => "Pendiente"
                }
            });
        }

        return historial;
    }

    private async Task<List<LoteDeshabilitacionDto>> ObtenerHistorialDeshabilitacionesAsync(int loteId)
    {
        const string sql = """
            SELECT CASE WHEN d.AfectoLote = 1 THEN N'Lote' ELSE N'Siembra' END AS TipoRegistro, d.LoteDeshabilitacionId AS RegistroId, d.SiembraId,
                   d.CicloEstacional, s.Producto,
                   d.Motivo, d.Detalle, d.Siniestro, d.FechaSiniestro, d.FechaCreacion,
                   d.AfectoLote AS LoteDeshabilitado
            FROM dbo.LoteDeshabilitaciones AS d
            LEFT JOIN dbo.Siembras AS s ON s.SiembraId = d.SiembraId
            WHERE d.LoteId = @LoteId
            UNION ALL
            SELECT N'Planificación', p.CampaniaPlanificacionBajaId, NULL,
                   p.CicloEstacional, p.Producto,
                   p.Motivo, p.Detalle, p.Siniestro, p.FechaSiniestro, p.FechaCreacion,
                   p.LoteDeshabilitado
            FROM dbo.CampaniaPlanificacionBajas AS p
            WHERE p.LoteId = @LoteId
            UNION ALL
            SELECT N'Omisión de Verano', o.CampaniaVeranoOmisionId, NULL,
                   N'Verano', NULL,
                   o.Motivo, o.Detalle, o.Siniestro, o.FechaSiniestro, o.FechaCreacion,
                   CAST(0 AS bit)
            FROM dbo.CampaniaVeranoOmisiones AS o
            WHERE o.LoteId = @LoteId AND o.RegistradaEnBajaPlanificacion = 0
            ORDER BY FechaCreacion DESC, TipoRegistro, RegistroId DESC;
            """;
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@LoteId", loteId);
        await using var reader = await command.ExecuteReaderAsync();
        var result = new List<LoteDeshabilitacionDto>();
        while (await reader.ReadAsync())
            result.Add(new LoteDeshabilitacionDto
            {
                TipoRegistro = reader.GetString(0),
                RegistroId = $"{reader.GetString(0) switch { "Planificación" => "plan", "Omisión de Verano" => "omision", _ => "lote" }}-{reader.GetInt32(1)}",
                LoteDeshabilitacionId = reader.GetString(0) is "Planificación" or "Omisión de Verano" ? 0 : reader.GetInt32(1),
                SiembraId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                CicloEstacional = reader.IsDBNull(3) ? null : reader.GetString(3),
                Producto = reader.IsDBNull(4) ? null : reader.GetString(4),
                Motivo = reader.GetString(5),
                Detalle = reader.IsDBNull(6) ? null : reader.GetString(6),
                Siniestro = reader.IsDBNull(7) ? null : reader.GetString(7),
                FechaSiniestro = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                FechaCreacion = reader.GetDateTime(9),
                LoteDeshabilitado = reader.GetBoolean(10)
            });
        return result;
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
            CultivoAnterior = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
            CultivoAnteriorCampania = reader.IsDBNull(8) ? null : reader.GetString(8),
            CultivoActual = reader.IsDBNull(9) ? null : reader.GetString(9),
            EstadoCultivo = reader.IsDBNull(10) ? "Sin cultivo" : reader.GetString(10),
            Hectareas = reader.GetDecimal(11),
            SuperficieTotal = reader.GetDecimal(12),
            Activo = reader.GetBoolean(13),
            FechaCreacion = reader.GetDateTime(14),
            FechaModificacion = reader.IsDBNull(15) ? null : reader.GetDateTime(15),
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

public sealed record LoteSuperpuestoInfo(int LoteId, string Nombre);

public sealed class LoteSuperpuestoException(string message) : Exception(message)
{
    public static string CrearMensaje(LoteSuperpuestoInfo loteSuperpuesto) =>
        $"El poligono se superpone en al menos un 90 % con el lote '{loteSuperpuesto.Nombre}'. Revisa los puntos marcados o edita el lote existente.";
}

public sealed class LoteDeshabilitacionBloqueadaException(string message) : Exception(message);
