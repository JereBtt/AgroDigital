using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

/*
    Modulo Cosechas (29_cosechas_rediseno.sql).

    Reglas principales:
      - Una cosecha por siembra. Solo se cosecha una siembra Finalizada que sea la
        ultima de su cadena (sin resiembra posterior). Lote, grano, campania y
        empresa se toman de la siembra, nunca del cliente.
      - Al registrar queda En curso con fecha tentativa de fin. Al finalizar se
        cargan la fecha real (no futura) y el resultado; si la fecha real se aleja
        mas de 3 dias de la tentativa se exige justificacion. El rinde y el rinde
        seco los calcula la API.
      - El control de perdidas (Tirada de Aros) tiene su propio estado:
        Sin controles -> En curso (primera tirada) -> Finalizado (Finalizar control).
        Con el control finalizado no se agregan, editan ni eliminan tiradas.
      - Cada tirada guarda la tolerancia y el factor con que se clasifico.
      - Los partes diarios solo se cargan con la cosecha En curso. Un parte con
        destino silo genera su ingreso en Almacenamiento en la misma transaccion;
        despues solo se editan sus observaciones (el stock se corrige con un ajuste).
*/
public class CosechaRepository(IConfiguration configuration, IAlmacenamientoRepository almacenamientoRepository) : ICosechaRepository
{
    private const int DiasDesvioRequiereJustificacion = 3;
    private const int MesesMaximoCosecha = 6;

    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectCosecha = """
        SELECT c.CosechaId, c.Nombre, c.SiembraId, s.Nombre AS SiembraNombre, s.CicloEstacional,
               c.LoteId, l.Nombre AS LoteNombre, COALESCE(c.EmpresaId, l.EmpresaId) AS EmpresaId,
               COALESCE(e.Nombre, c.Empresa) AS Empresa, c.CampaniaNombre, c.Producto,
               c.FechaInicio, c.FechaFin, c.FechaFinReal, c.JustificacionDesvioFin,
               c.CantidadGranoCosechado, c.CantidadHectareasTrabajadas, c.HumedadGrano, c.Impurezas,
               c.ResponsableACargo, c.RindeKgHa, c.RindeSecoKgHa, c.HumedadBaseAplicada, c.HectareasHora,
               c.TipoServicio, c.Contratista, c.Cosechadora, c.AnchoCabezalM,
               c.Estado, c.EstadoControl,
               COALESCE(s.CantidadHectareasTrabajadas, l.Hectareas) AS HectareasSembradas,
               av.CantidadPartes, av.HectareasCosechadas, av.KgAcumulados, av.HumedadPromedioPct,
               av.KgASilo, av.KgDistribucionDirecta, av.KgPendientes, av.FechaUltimoParte,
               ti.CantidadTiradas, ti.PerdidaPromedioKgHa, ut.Severidad AS UltimaSeveridad
        FROM dbo.Cosechas AS c
        INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
        LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = COALESCE(c.EmpresaId, l.EmpresaId)
        LEFT JOIN dbo.Siembras AS s ON s.SiembraId = c.SiembraId
        LEFT JOIN dbo.vw_CosechasAvance AS av ON av.CosechaId = c.CosechaId
        OUTER APPLY (
            SELECT COUNT(1) AS CantidadTiradas, AVG(t.PerdidaTotalKgHa) AS PerdidaPromedioKgHa
            FROM dbo.CosechaTiradaAros AS t
            WHERE t.CosechaId = c.CosechaId
        ) AS ti
        OUTER APPLY (
            SELECT TOP (1) t.Severidad
            FROM dbo.CosechaTiradaAros AS t
            WHERE t.CosechaId = c.CosechaId
            ORDER BY t.Fecha DESC, t.CosechaTiradaAroId DESC
        ) AS ut
        """;

    private const string FiltroAccesoCosecha = """
        (@IncluirTodos = 1 OR EXISTS (
            SELECT 1 FROM dbo.UsuarioEmpresas AS ue
            WHERE ue.UsuarioId = @UsuarioId
              AND ue.EmpresaId = COALESCE(c.EmpresaId, l.EmpresaId)
              AND ue.Activo = 1))
        """;

    private const string SelectTirada = """
        SELECT t.CosechaTiradaAroId, t.CosechaId, t.Fecha, t.Latitud, t.Longitud,
               t.AroCabezal, t.AroCola1, t.AroCola2, t.AroCola3, t.GranosPrecosecha,
               t.PMG, t.PmgOrigen, t.PerdidaPrecosechaKgHa, t.PerdidaCabezalKgHa, t.PerdidaColaKgHa,
               t.PerdidaTotalKgHa, t.Severidad, t.ToleranciaAplicadaKgHa, t.FactorAltaAplicado,
               t.AjustoMaquinaria, t.Observaciones, t.CreadoPorUsuarioId
        FROM dbo.CosechaTiradaAros AS t
        """;

    private const string SelectParte = """
        SELECT p.CosechaParteId, p.CosechaId, p.Fecha, p.Hectareas, p.KgCosechados, p.HumedadPct,
               p.Destino, p.SiloId, si.Nombre AS SiloNombre, p.AlmacenamientoId, p.Observaciones,
               p.CreadoPorUsuarioId, u.Nombre AS UsuarioNombre, u.Apellido AS UsuarioApellido
        FROM dbo.CosechaPartes AS p
        LEFT JOIN dbo.Silos AS si ON si.SiloId = p.SiloId
        LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = p.CreadoPorUsuarioId
        """;

    // =====================================================================
    // Consultas
    // =====================================================================

    public async Task<IReadOnlyList<CosechaDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos)
    {
        var sql = SelectCosecha
            + " WHERE " + FiltroAccesoCosecha
            + " ORDER BY c.FechaInicio DESC, c.CosechaId DESC;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
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
        var sql = SelectCosecha + " WHERE c.CosechaId = @CosechaId;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapearCosecha(reader) : null;
    }

    public async Task<IReadOnlyList<SiembraParaCosechaDto>> ObtenerSiembrasDisponiblesAsync(int usuarioId, bool incluirTodos)
    {
        const string sql = """
            SELECT s.SiembraId, s.Nombre, ISNULL(s.TipoRegistro, N'Siembra') AS TipoRegistro,
                   ISNULL(s.CicloEstacional, N'Verano') AS CicloEstacional,
                   s.LoteId, l.Nombre AS LoteNombre, l.EmpresaId, e.Nombre AS Empresa,
                   s.Producto, s.CampaniaNombre, s.FechaFinReal,
                   COALESCE(s.CantidadHectareasTrabajadas, l.Hectareas) AS HectareasSembradas, s.PMG
            FROM dbo.Siembras AS s
            INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
            LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = l.EmpresaId
            WHERE s.EstadoSiembra = N'Finalizado'
              AND s.Estado = N'Finalizado'
              AND s.DeshabilitacionId IS NULL
              AND l.Activo = 1
              AND s.FechaFinReal IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM dbo.Siembras AS r WHERE r.SiembraOriginalId = s.SiembraId)
              AND l.EstadoCultivo = N'Cultivado'
              AND NOT EXISTS (SELECT 1 FROM dbo.Cosechas AS c WHERE c.SiembraId = s.SiembraId)
              AND (@IncluirTodos = 1 OR EXISTS (
                    SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                    WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = l.EmpresaId AND ue.Activo = 1))
            ORDER BY s.FechaFinReal DESC, s.SiembraId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        await using var reader = await command.ExecuteReaderAsync();

        var siembras = new List<SiembraParaCosechaDto>();
        while (await reader.ReadAsync())
        {
            siembras.Add(new SiembraParaCosechaDto
            {
                SiembraId = Int(reader, "SiembraId"),
                Nombre = Str(reader, "Nombre"),
                TipoRegistro = Str(reader, "TipoRegistro"),
                CicloEstacional = Str(reader, "CicloEstacional"),
                LoteId = Int(reader, "LoteId"),
                LoteNombre = Str(reader, "LoteNombre"),
                EmpresaId = IntN(reader, "EmpresaId"),
                Empresa = StrN(reader, "Empresa"),
                Producto = Str(reader, "Producto"),
                CampaniaNombre = StrN(reader, "CampaniaNombre"),
                FechaFinReal = Fecha(reader, "FechaFinReal"),
                HectareasSembradas = DecN(reader, "HectareasSembradas"),
                PMG = DecN(reader, "PMG")
            });
        }

        return siembras;
    }

    // =====================================================================
    // Alta, edicion y cierre
    // =====================================================================

    public async Task<CosechaDto> CrearAsync(CrearCosechaRequest request, int usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        int cosechaId;
        try
        {
            var siembra = await LeerSiembraParaCosechaAsync(connection, transaction, request.SiembraId)
                ?? throw new ReglaCosechaException("La siembra indicada no existe.");

            if (siembra.Deshabilitada)
            {
                throw new ConflictoCosechaException("La siembra deshabilitada se conserva como historial y no puede cosecharse.");
            }

            if (siembra.EstadoSiembra != "Finalizado" || siembra.FechaFinReal is null)
            {
                throw new ReglaCosechaException(
                    $"La siembra {siembra.Nombre} todavía no está finalizada. Finalizala antes de registrar su cosecha.");
            }
            if (siembra.EstadoSeguimiento != "Finalizado")
                throw new ReglaCosechaException("Finalizá el seguimiento de la siembra antes de registrar la cosecha.");
            if (!siembra.LoteActivo || siembra.EstadoCultivo != "Cultivado")
                throw new ConflictoCosechaException("El lote debe estar activo y cultivado para registrar su cosecha.");

            if (siembra.TieneResiembraPosterior)
            {
                throw new ReglaCosechaException(
                    $"{siembra.Nombre} tiene una resiembra posterior: registrá la cosecha sobre la última resiembra del lote.");
            }

            if (siembra.TieneCosecha)
            {
                throw new ConflictoCosechaException($"La siembra {siembra.Nombre} ya tiene una cosecha registrada.");
            }

            if (request.FechaInicio.Date < siembra.FechaFinReal.Value.Date)
            {
                throw new ReglaCosechaException(
                    $"La fecha de inicio no puede ser anterior al fin real de la siembra ({siembra.FechaFinReal.Value:dd/MM/yyyy}).");
            }
            ValidarInicioEnPeriodo(request.FechaInicio, siembra.CampaniaNombre);

            var nombre = await GenerarSiguienteNombreAsync(connection, transaction);

            const string insertSql = """
                INSERT INTO dbo.Cosechas
                    (Nombre, SiembraId, LoteId, EmpresaId, CampaniaNombre, Producto, Empresa, FechaInicio, FechaFin,
                     ResponsableACargo, TipoServicio, Contratista, Cosechadora, AnchoCabezalM,
                     Estado, EstadoControl, CreadoPorUsuarioId)
                OUTPUT INSERTED.CosechaId
                VALUES
                    (@Nombre, @SiembraId, @LoteId, @EmpresaId, @CampaniaNombre, @Producto, @Empresa, @FechaInicio, @FechaFin,
                     @ResponsableACargo, @TipoServicio, @Contratista, @Cosechadora, @AnchoCabezalM,
                     N'En curso', N'Sin controles', @CreadoPorUsuarioId);
                """;

            await using (var insert = new SqlCommand(insertSql, connection, transaction))
            {
                insert.Parameters.AddWithValue("@Nombre", nombre);
                insert.Parameters.AddWithValue("@SiembraId", siembra.SiembraId);
                insert.Parameters.AddWithValue("@LoteId", siembra.LoteId);
                insert.Parameters.AddWithValue("@EmpresaId", (object?)siembra.EmpresaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@CampaniaNombre", TextoONull(siembra.CampaniaNombre));
                insert.Parameters.AddWithValue("@Producto", siembra.Producto);
                insert.Parameters.AddWithValue("@Empresa", TextoONull(siembra.EmpresaNombre));
                insert.Parameters.AddWithValue("@FechaInicio", request.FechaInicio.Date);
                insert.Parameters.AddWithValue("@FechaFin", request.FechaFin.Date);
                AgregarParametrosGenerales(insert, request.ResponsableACargo, request.TipoServicio,
                    request.Contratista, request.Cosechadora, request.AnchoCabezalM);
                insert.Parameters.AddWithValue("@CreadoPorUsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);

                cosechaId = (int)(await insert.ExecuteScalarAsync()
                    ?? throw new InvalidOperationException("No se pudo registrar la cosecha."));
            }

            // La combinacion de la campania pasa a la etapa Cosecha.
            const string etapaSql = """
                UPDATE cc
                SET EtapaActual = N'Cosecha'
                FROM dbo.CampaniaCombinaciones AS cc
                INNER JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
                INNER JOIN dbo.Siembras AS s ON s.SiembraId = @SiembraId
                WHERE cc.LoteId = @LoteId
                  AND cc.Producto = @Producto
                  AND ca.Nombre = @CampaniaNombre
                  AND cc.CicloEstacional = s.CicloEstacional
                  AND cc.Estado <> N'Finalizado';
                """;

            await using (var etapa = new SqlCommand(etapaSql, connection, transaction))
            {
                etapa.Parameters.AddWithValue("@SiembraId", siembra.SiembraId);
                etapa.Parameters.AddWithValue("@LoteId", siembra.LoteId);
                etapa.Parameters.AddWithValue("@Producto", siembra.Producto);
                etapa.Parameters.AddWithValue("@CampaniaNombre", TextoONull(siembra.CampaniaNombre));
                await etapa.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw new ConflictoCosechaException("La siembra seleccionada ya tiene una cosecha registrada.");
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }

        return (await ObtenerPorIdAsync(cosechaId))!;
    }

    public async Task<bool> ActualizarAsync(int cosechaId, ActualizarCosechaRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId);
            if (actual is null)
            {
                await transaction.RollbackAsync();
                return false;
            }

            var inicio = request.FechaInicio.Date;
            ValidarInicioEnPeriodo(inicio, actual.CampaniaNombre);
            if (actual.SiembraFechaFinReal is not null && inicio < actual.SiembraFechaFinReal.Value.Date)
            {
                throw new ReglaCosechaException(
                    $"La fecha de inicio no puede ser anterior al fin real de la siembra ({actual.SiembraFechaFinReal.Value:dd/MM/yyyy}).");
            }

            if (actual.PrimeraFechaRegistro is not null && actual.PrimeraFechaRegistro.Value.Date < inicio)
            {
                throw new ReglaCosechaException(
                    $"Hay partes o tiradas registradas el {actual.PrimeraFechaRegistro.Value:dd/MM/yyyy}: la fecha de inicio no puede ser posterior.");
            }

            var finalizada = actual.Estado == "Finalizado";

            // Datos del resultado: solo se editan en una cosecha finalizada.
            DateTime? fechaFinReal = actual.FechaFinReal;
            string? justificacion = null;
            decimal? kg = null, hectareas = null, humedad = null, impurezas = null, hectareasHora = null;
            decimal? rinde = null, rindeSeco = null, humedadBase = null;

            if (finalizada)
            {
                fechaFinReal = (request.FechaFinReal ?? actual.FechaFinReal)
                    ?? throw new ReglaCosechaException("La fecha real de finalización es obligatoria.");
                kg = request.CantidadGranoCosechado
                    ?? throw new ReglaCosechaException("La cantidad de grano cosechado es obligatoria.");
                hectareas = request.CantidadHectareasTrabajadas
                    ?? throw new ReglaCosechaException("Las hectáreas trabajadas son obligatorias.");
                humedad = request.HumedadGrano
                    ?? throw new ReglaCosechaException("La humedad del grano es obligatoria.");
                hectareasHora = request.HectareasHora
                    ?? throw new ReglaCosechaException("Las hectáreas por hora son obligatorias.");
                impurezas = request.Impurezas;
                justificacion = request.JustificacionDesvioFin;

                // Se valida contra las fechas que quedan despues de la edicion.
                var paraValidar = actual with { FechaInicio = inicio, FechaFin = request.FechaFin.Date };
                ValidarResultado(paraValidar, fechaFinReal.Value, justificacion, kg.Value, hectareas.Value,
                    humedad.Value, impurezas, hectareasHora.Value);

                rinde = CalculadoraPerdidasCosecha.Rinde(kg.Value, hectareas.Value);
                humedadBase = await ObtenerHumedadBaseAsync(connection, transaction, actual.Producto);
                rindeSeco = CalculadoraPerdidasCosecha.RindeSeco(rinde.Value, humedad.Value, humedadBase);
            }

            const string sql = """
                UPDATE dbo.Cosechas
                SET FechaInicio = @FechaInicio,
                    FechaFin = @FechaFin,
                    ResponsableACargo = @ResponsableACargo,
                    TipoServicio = @TipoServicio,
                    Contratista = @Contratista,
                    Cosechadora = @Cosechadora,
                    AnchoCabezalM = @AnchoCabezalM,
                    FechaFinReal = CASE WHEN @Finalizada = 1 THEN @FechaFinReal ELSE FechaFinReal END,
                    JustificacionDesvioFin = CASE WHEN @Finalizada = 1 THEN @JustificacionDesvioFin ELSE JustificacionDesvioFin END,
                    CantidadGranoCosechado = CASE WHEN @Finalizada = 1 THEN @CantidadGranoCosechado ELSE CantidadGranoCosechado END,
                    CantidadHectareasTrabajadas = CASE WHEN @Finalizada = 1 THEN @CantidadHectareasTrabajadas ELSE CantidadHectareasTrabajadas END,
                    HumedadGrano = CASE WHEN @Finalizada = 1 THEN @HumedadGrano ELSE HumedadGrano END,
                    Impurezas = CASE WHEN @Finalizada = 1 THEN @Impurezas ELSE Impurezas END,
                    HectareasHora = CASE WHEN @Finalizada = 1 THEN @HectareasHora ELSE HectareasHora END,
                    RindeKgHa = CASE WHEN @Finalizada = 1 THEN @RindeKgHa ELSE RindeKgHa END,
                    RindeSecoKgHa = CASE WHEN @Finalizada = 1 THEN @RindeSecoKgHa ELSE RindeSecoKgHa END,
                    HumedadBaseAplicada = CASE WHEN @Finalizada = 1 THEN @HumedadBaseAplicada ELSE HumedadBaseAplicada END,
                    FechaModificacion = SYSDATETIME()
                WHERE CosechaId = @CosechaId;
                """;

            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                command.Parameters.AddWithValue("@FechaInicio", inicio);
                command.Parameters.AddWithValue("@FechaFin", request.FechaFin.Date);
                AgregarParametrosGenerales(command, request.ResponsableACargo, request.TipoServicio,
                    request.Contratista, request.Cosechadora, request.AnchoCabezalM);
                command.Parameters.AddWithValue("@Finalizada", finalizada);
                command.Parameters.AddWithValue("@FechaFinReal", (object?)fechaFinReal?.Date ?? DBNull.Value);
                command.Parameters.AddWithValue("@JustificacionDesvioFin", TextoONull(justificacion));
                command.Parameters.AddWithValue("@CantidadGranoCosechado", (object?)kg ?? DBNull.Value);
                command.Parameters.AddWithValue("@CantidadHectareasTrabajadas", (object?)hectareas ?? DBNull.Value);
                command.Parameters.AddWithValue("@HumedadGrano", (object?)humedad ?? DBNull.Value);
                command.Parameters.AddWithValue("@Impurezas", (object?)impurezas ?? DBNull.Value);
                command.Parameters.AddWithValue("@HectareasHora", (object?)hectareasHora ?? DBNull.Value);
                command.Parameters.AddWithValue("@RindeKgHa", (object?)rinde ?? DBNull.Value);
                command.Parameters.AddWithValue("@RindeSecoKgHa", (object?)rindeSeco ?? DBNull.Value);
                command.Parameters.AddWithValue("@HumedadBaseAplicada", (object?)humedadBase ?? DBNull.Value);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task FinalizarAsync(int cosechaId, FinalizarCosechaRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            if (actual.Estado != "En curso")
            {
                throw new ConflictoCosechaException($"La cosecha {actual.Nombre} ya está finalizada.");
            }

            ValidarResultado(actual, request.FechaFinReal, request.JustificacionDesvioFin, request.CantidadGranoCosechado,
                request.CantidadHectareasTrabajadas, request.HumedadGrano, request.Impurezas, request.HectareasHora);

            var rinde = CalculadoraPerdidasCosecha.Rinde(request.CantidadGranoCosechado, request.CantidadHectareasTrabajadas);
            var humedadBase = await ObtenerHumedadBaseAsync(connection, transaction, actual.Producto);
            var rindeSeco = CalculadoraPerdidasCosecha.RindeSeco(rinde, request.HumedadGrano, humedadBase);

            const string sql = """
                UPDATE dbo.Cosechas
                SET FechaFinReal = @FechaFinReal,
                    JustificacionDesvioFin = @JustificacionDesvioFin,
                    CantidadGranoCosechado = @CantidadGranoCosechado,
                    CantidadHectareasTrabajadas = @CantidadHectareasTrabajadas,
                    HumedadGrano = @HumedadGrano,
                    Impurezas = @Impurezas,
                    HectareasHora = @HectareasHora,
                    RindeKgHa = @RindeKgHa,
                    RindeSecoKgHa = @RindeSecoKgHa,
                    HumedadBaseAplicada = @HumedadBaseAplicada,
                    Estado = N'Finalizado',
                    EstadoControl = CASE WHEN @FinalizarControl = 1 AND EstadoControl = N'En curso'
                                         THEN N'Finalizado' ELSE EstadoControl END,
                    FechaModificacion = SYSDATETIME()
                WHERE CosechaId = @CosechaId AND Estado = N'En curso';

                UPDATE l
                SET CultivoActual = c.Producto,
                    CultivoAnterior = c.Producto,
                    EstadoCultivo = N'Cosechado',
                    FechaModificacion = SYSDATETIME()
                FROM dbo.Lotes AS l
                INNER JOIN dbo.Cosechas AS c ON c.LoteId = l.LoteId
                WHERE c.CosechaId = @CosechaId;

                UPDATE cc
                SET Estado = N'Finalizado',
                    EtapaActual = N'Finalizada'
                FROM dbo.CampaniaCombinaciones AS cc
                INNER JOIN dbo.Campanias AS ca ON ca.CampaniaId = cc.CampaniaId
                INNER JOIN dbo.Cosechas AS c ON c.LoteId = cc.LoteId
                    AND c.CampaniaNombre = ca.Nombre
                    AND c.Producto = cc.Producto
                INNER JOIN dbo.Siembras AS s ON s.SiembraId = c.SiembraId
                    AND s.CicloEstacional = cc.CicloEstacional
                WHERE c.CosechaId = @CosechaId;
                """;

            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                command.Parameters.AddWithValue("@FechaFinReal", request.FechaFinReal.Date);
                command.Parameters.AddWithValue("@JustificacionDesvioFin", TextoONull(request.JustificacionDesvioFin));
                command.Parameters.AddWithValue("@CantidadGranoCosechado", request.CantidadGranoCosechado);
                command.Parameters.AddWithValue("@CantidadHectareasTrabajadas", request.CantidadHectareasTrabajadas);
                command.Parameters.AddWithValue("@HumedadGrano", request.HumedadGrano);
                command.Parameters.AddWithValue("@Impurezas", (object?)request.Impurezas ?? DBNull.Value);
                command.Parameters.AddWithValue("@HectareasHora", request.HectareasHora);
                command.Parameters.AddWithValue("@RindeKgHa", rinde);
                command.Parameters.AddWithValue("@RindeSecoKgHa", (object?)rindeSeco ?? DBNull.Value);
                command.Parameters.AddWithValue("@HumedadBaseAplicada", (object?)humedadBase ?? DBNull.Value);
                command.Parameters.AddWithValue("@FinalizarControl", request.FinalizarControl);
                await command.ExecuteNonQueryAsync();
            }

            await using (var recalcular = new SqlCommand(
                "DECLARE @LoteId INT = (SELECT LoteId FROM dbo.Cosechas WHERE CosechaId = @CosechaId); " + LoteCultivoEstadoSql.Recalcular,
                connection, transaction))
            {
                recalcular.Parameters.AddWithValue("@CosechaId", cosechaId);
                await recalcular.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    // =====================================================================
    // Control de perdidas (Tirada de Aros)
    // =====================================================================

    public async Task<ParametrosPerdidaCosechaDto> ObtenerParametrosPerdidaAsync(int cosechaId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var actual = await LeerEstadoCosechaAsync(connection, null, cosechaId)
            ?? throw new ReglaCosechaException("La cosecha no existe.");

        return await ResolverParametrosAsync(connection, null, actual);
    }

    public async Task<IReadOnlyList<CosechaTiradaAroDto>> ObtenerTiradasAsync(int cosechaId)
    {
        var sql = SelectTirada + """
             WHERE t.CosechaId = @CosechaId
             ORDER BY t.Fecha DESC, t.CosechaTiradaAroId DESC;
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

    public async Task<CosechaTiradaAroDto> AgregarTiradaAsync(int cosechaId, CrearCosechaTiradaAroRequest request, int usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        int tiradaId;
        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            ValidarTiradaPermitida(actual, request.Fecha);
            var parametros = await ResolverParametrosAsync(connection, transaction, actual);
            var (pmg, pmgOrigen) = ResolverPmg(request.PMG, parametros);
            var calculo = CalculadoraPerdidasCosecha.Calcular(request.AroCabezal, request.AroCola1, request.AroCola2,
                request.AroCola3, request.GranosPrecosecha, pmg, parametros.ToleranciaKgHa, parametros.FactorAlta);

            const string sql = """
                INSERT INTO dbo.CosechaTiradaAros
                    (CosechaId, Fecha, Latitud, Longitud, AroCabezal, AroCola1, AroCola2, AroCola3,
                     GranosPrecosecha, PMG, PmgOrigen, PerdidaPrecosechaKgHa, PerdidaCabezalKgHa, PerdidaColaKgHa,
                     PerdidaTotalKgHa, Severidad, ToleranciaAplicadaKgHa, FactorAltaAplicado,
                     AjustoMaquinaria, Observaciones, CreadoPorUsuarioId)
                OUTPUT INSERTED.CosechaTiradaAroId
                VALUES
                    (@CosechaId, @Fecha, @Latitud, @Longitud, @AroCabezal, @AroCola1, @AroCola2, @AroCola3,
                     @GranosPrecosecha, @PMG, @PmgOrigen, @PerdidaPrecosechaKgHa, @PerdidaCabezalKgHa, @PerdidaColaKgHa,
                     @PerdidaTotalKgHa, @Severidad, @ToleranciaAplicadaKgHa, @FactorAltaAplicado,
                     @AjustoMaquinaria, @Observaciones, @CreadoPorUsuarioId);
                """;

            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                AgregarParametrosTirada(command, request, pmg, pmgOrigen, calculo, parametros);
                command.Parameters.AddWithValue("@CreadoPorUsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
                tiradaId = (int)(await command.ExecuteScalarAsync()
                    ?? throw new InvalidOperationException("No se pudo registrar la Tirada de Aros."));
            }

            // La primera tirada abre el control de perdidas.
            const string estadoSql = """
                UPDATE dbo.Cosechas
                SET EstadoControl = N'En curso', FechaModificacion = SYSDATETIME()
                WHERE CosechaId = @CosechaId AND EstadoControl = N'Sin controles';
                """;

            await using (var estado = new SqlCommand(estadoSql, connection, transaction))
            {
                estado.Parameters.AddWithValue("@CosechaId", cosechaId);
                await estado.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }

        return (await ObtenerTiradasAsync(cosechaId)).First(t => t.CosechaTiradaAroId == tiradaId);
    }

    public async Task<bool> ActualizarTiradaAsync(int cosechaId, int tiradaId, ActualizarCosechaTiradaAroRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            ValidarTiradaPermitida(actual, request.Fecha);
            var parametros = await ResolverParametrosAsync(connection, transaction, actual);
            var (pmg, pmgOrigen) = ResolverPmg(request.PMG, parametros);
            var calculo = CalculadoraPerdidasCosecha.Calcular(request.AroCabezal, request.AroCola1, request.AroCola2,
                request.AroCola3, request.GranosPrecosecha, pmg, parametros.ToleranciaKgHa, parametros.FactorAlta);

            const string sql = """
                UPDATE dbo.CosechaTiradaAros
                SET Fecha = @Fecha,
                    Latitud = @Latitud,
                    Longitud = @Longitud,
                    AroCabezal = @AroCabezal,
                    AroCola1 = @AroCola1,
                    AroCola2 = @AroCola2,
                    AroCola3 = @AroCola3,
                    GranosPrecosecha = @GranosPrecosecha,
                    PMG = @PMG,
                    PmgOrigen = @PmgOrigen,
                    PerdidaPrecosechaKgHa = @PerdidaPrecosechaKgHa,
                    PerdidaCabezalKgHa = @PerdidaCabezalKgHa,
                    PerdidaColaKgHa = @PerdidaColaKgHa,
                    PerdidaTotalKgHa = @PerdidaTotalKgHa,
                    Severidad = @Severidad,
                    ToleranciaAplicadaKgHa = @ToleranciaAplicadaKgHa,
                    FactorAltaAplicado = @FactorAltaAplicado,
                    AjustoMaquinaria = @AjustoMaquinaria,
                    Observaciones = @Observaciones,
                    FechaModificacion = SYSDATETIME()
                WHERE CosechaId = @CosechaId AND CosechaTiradaAroId = @TiradaId;
                """;

            int filas;
            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                command.Parameters.AddWithValue("@TiradaId", tiradaId);
                AgregarParametrosTirada(command, request, pmg, pmgOrigen, calculo, parametros);
                filas = await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return filas > 0;
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> EliminarTiradaAsync(int cosechaId, int tiradaId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            if (actual.EstadoControl == "Finalizado")
            {
                throw new ConflictoCosechaException(
                    $"El control de pérdidas de {actual.Nombre} está cerrado: sus tiradas quedan solo para consulta.");
            }

            // Si no quedan tiradas, el control vuelve a Sin controles.
            const string sql = """
                DELETE FROM dbo.CosechaTiradaAros WHERE CosechaId = @CosechaId AND CosechaTiradaAroId = @TiradaId;
                DECLARE @Eliminadas INT = @@ROWCOUNT;

                UPDATE dbo.Cosechas
                SET EstadoControl = N'Sin controles', FechaModificacion = SYSDATETIME()
                WHERE CosechaId = @CosechaId
                  AND EstadoControl = N'En curso'
                  AND NOT EXISTS (SELECT 1 FROM dbo.CosechaTiradaAros WHERE CosechaId = @CosechaId);

                SELECT @Eliminadas;
                """;

            int eliminadas;
            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                command.Parameters.AddWithValue("@TiradaId", tiradaId);
                eliminadas = Convert.ToInt32(await command.ExecuteScalarAsync());
            }

            await transaction.CommitAsync();
            return eliminadas > 0;
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task FinalizarControlAsync(int cosechaId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            if (actual.EstadoControl == "Finalizado")
            {
                throw new ConflictoCosechaException($"El control de pérdidas de {actual.Nombre} ya está cerrado.");
            }

            if (actual.EstadoControl == "Sin controles")
            {
                throw new ReglaCosechaException("Registrá al menos una Tirada de Aros antes de finalizar el control.");
            }

            const string sql = """
                UPDATE dbo.Cosechas
                SET EstadoControl = N'Finalizado', FechaModificacion = SYSDATETIME()
                WHERE CosechaId = @CosechaId AND EstadoControl = N'En curso';
                """;

            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    // =====================================================================
    // Partes diarios de avance
    // =====================================================================

    public async Task<IReadOnlyList<CosechaParteDto>> ObtenerPartesAsync(int cosechaId)
    {
        var sql = SelectParte + """
             WHERE p.CosechaId = @CosechaId
             ORDER BY p.Fecha DESC, p.CosechaParteId DESC;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();

        var partes = new List<CosechaParteDto>();
        while (await reader.ReadAsync())
        {
            partes.Add(MapearParte(reader));
        }

        return partes;
    }

    public async Task<CosechaParteDto> AgregarParteAsync(int cosechaId, CrearCosechaParteRequest request, int usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        int parteId;
        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            ValidarParte(actual, request, hectareasExcluidas: 0m);

            int? almacenamientoId = null;
            if (request.Destino == "Silo")
            {
                almacenamientoId = await RegistrarIngresoSiloAsync(connection, transaction, actual, request, usuarioId);
            }

            const string sql = """
                INSERT INTO dbo.CosechaPartes
                    (CosechaId, Fecha, Hectareas, KgCosechados, HumedadPct, Destino, SiloId, AlmacenamientoId,
                     Observaciones, CreadoPorUsuarioId)
                OUTPUT INSERTED.CosechaParteId
                VALUES
                    (@CosechaId, @Fecha, @Hectareas, @KgCosechados, @HumedadPct, @Destino, @SiloId, @AlmacenamientoId,
                     @Observaciones, @CreadoPorUsuarioId);
                """;

            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                AgregarParametrosParte(command, request, almacenamientoId);
                command.Parameters.AddWithValue("@CreadoPorUsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
                parteId = (int)(await command.ExecuteScalarAsync()
                    ?? throw new InvalidOperationException("No se pudo registrar el parte de cosecha."));
            }

            await transaction.CommitAsync();
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }

        return (await ObtenerPartesAsync(cosechaId)).First(p => p.CosechaParteId == parteId);
    }

    public async Task<bool> ActualizarParteAsync(int cosechaId, int parteId, ActualizarCosechaParteRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            var parte = await LeerParteBloqueadoAsync(connection, transaction, cosechaId, parteId);
            if (parte is null)
            {
                await transaction.RollbackAsync();
                return false;
            }

            if (actual.Estado != "En curso")
            {
                throw new ConflictoCosechaException("La cosecha ya está finalizada: sus partes quedan solo para consulta.");
            }

            if (parte.Destino == "Silo")
            {
                // El ingreso al silo ya se registro: solo se corrigen las observaciones.
                var cambiaDatos = parte.Fecha.Date != request.Fecha.Date
                    || parte.Hectareas != request.Hectareas
                    || parte.KgCosechados != request.KgCosechados
                    || parte.HumedadPct != request.HumedadPct
                    || request.Destino != "Silo"
                    || parte.SiloId != request.SiloId;

                if (cambiaDatos)
                {
                    throw new ReglaCosechaException(
                        "Este parte ya generó su ingreso en Almacenamiento: solo podés editar las observaciones. "
                        + "Para corregir el stock registrá un ajuste en Almacenamiento.");
                }

                const string soloObservaciones = """
                    UPDATE dbo.CosechaPartes
                    SET Observaciones = @Observaciones, FechaModificacion = SYSDATETIME()
                    WHERE CosechaParteId = @ParteId AND CosechaId = @CosechaId;
                    """;

                await using (var command = new SqlCommand(soloObservaciones, connection, transaction))
                {
                    command.Parameters.AddWithValue("@ParteId", parteId);
                    command.Parameters.AddWithValue("@CosechaId", cosechaId);
                    command.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
                    await command.ExecuteNonQueryAsync();
                }

                await transaction.CommitAsync();
                return true;
            }

            ValidarParte(actual, request, hectareasExcluidas: parte.Hectareas);

            int? almacenamientoId = null;
            if (request.Destino == "Silo")
            {
                almacenamientoId = await RegistrarIngresoSiloAsync(connection, transaction, actual, request, usuarioIdIngreso: parte.CreadoPorUsuarioId ?? 0);
            }

            const string sql = """
                UPDATE dbo.CosechaPartes
                SET Fecha = @Fecha,
                    Hectareas = @Hectareas,
                    KgCosechados = @KgCosechados,
                    HumedadPct = @HumedadPct,
                    Destino = @Destino,
                    SiloId = @SiloId,
                    AlmacenamientoId = @AlmacenamientoId,
                    Observaciones = @Observaciones,
                    FechaModificacion = SYSDATETIME()
                WHERE CosechaParteId = @ParteId AND CosechaId = @CosechaId;
                """;

            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@ParteId", parteId);
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                AgregarParametrosParte(command, request, almacenamientoId);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<bool> EliminarParteAsync(int cosechaId, int parteId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var actual = await LeerEstadoCosechaAsync(connection, transaction, cosechaId)
                ?? throw new ReglaCosechaException("La cosecha no existe.");

            var parte = await LeerParteBloqueadoAsync(connection, transaction, cosechaId, parteId);
            if (parte is null)
            {
                await transaction.RollbackAsync();
                return false;
            }

            if (actual.Estado != "En curso")
            {
                throw new ConflictoCosechaException("La cosecha ya está finalizada: sus partes quedan solo para consulta.");
            }

            if (parte.Destino == "Silo")
            {
                throw new ReglaCosechaException(
                    "Este parte ya generó su ingreso en Almacenamiento y no se puede eliminar. "
                    + "Para corregir el stock registrá un ajuste en Almacenamiento.");
            }

            const string sql = "DELETE FROM dbo.CosechaPartes WHERE CosechaParteId = @ParteId AND CosechaId = @CosechaId;";
            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@ParteId", parteId);
                command.Parameters.AddWithValue("@CosechaId", cosechaId);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return true;
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync();
            throw;
        }
    }

    // =====================================================================
    // Documentacion (sin cambios funcionales)
    // =====================================================================

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
            documentos.Add(new CosechaDocumentoDto
            {
                CosechaDocumentoId = reader.GetInt32(0),
                NombreArchivo = reader.GetString(1),
                FechaCarga = reader.GetDateTime(2),
                CargadoPor = NombreCompleto(reader.IsDBNull(3) ? null : reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4))
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

    // =====================================================================
    // Lecturas internas y validaciones
    // =====================================================================

    private sealed record SiembraParaCosecha(
        int SiembraId, string Nombre, int LoteId, string Producto, string? CampaniaNombre, string EstadoSiembra, string EstadoSeguimiento, bool LoteActivo, string EstadoCultivo,
        DateTime? FechaFinReal, int? EmpresaId, string? EmpresaNombre, bool Deshabilitada, bool TieneResiembraPosterior, bool TieneCosecha);

    private static async Task<SiembraParaCosecha?> LeerSiembraParaCosechaAsync(
        SqlConnection connection, SqlTransaction transaction, int siembraId)
    {
        // UPDLOCK/HOLDLOCK: dos altas simultaneas sobre la misma siembra no pasan las dos.
        const string sql = """
            SELECT s.SiembraId, s.Nombre, s.LoteId, s.Producto, s.CampaniaNombre, s.EstadoSiembra, s.Estado AS EstadoSeguimiento, l.Activo AS LoteActivo, l.EstadoCultivo, s.FechaFinReal,
                   s.DeshabilitacionId,
                   l.EmpresaId, e.Nombre AS EmpresaNombre,
                   CASE WHEN EXISTS (SELECT 1 FROM dbo.Siembras AS r WHERE r.SiembraOriginalId = s.SiembraId)
                        THEN 1 ELSE 0 END AS TieneResiembraPosterior,
                   CASE WHEN EXISTS (SELECT 1 FROM dbo.Cosechas AS c WITH (UPDLOCK, HOLDLOCK) WHERE c.SiembraId = s.SiembraId)
                        THEN 1 ELSE 0 END AS TieneCosecha
            FROM dbo.Siembras AS s WITH (UPDLOCK, ROWLOCK)
            INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
            LEFT JOIN dbo.Empresas AS e ON e.EmpresaId = l.EmpresaId
            WHERE s.SiembraId = @SiembraId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@SiembraId", siembraId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;

        return new SiembraParaCosecha(
            Int(reader, "SiembraId"),
            Str(reader, "Nombre"),
            Int(reader, "LoteId"),
            Str(reader, "Producto"),
            StrN(reader, "CampaniaNombre"),
            Str(reader, "EstadoSiembra"),
            Str(reader, "EstadoSeguimiento"),
            reader.GetBoolean(reader.GetOrdinal("LoteActivo")),
            Str(reader, "EstadoCultivo"),
            FechaN(reader, "FechaFinReal"),
            IntN(reader, "EmpresaId"),
            StrN(reader, "EmpresaNombre"),
            !reader.IsDBNull(reader.GetOrdinal("DeshabilitacionId")),
            Int(reader, "TieneResiembraPosterior") == 1,
            Int(reader, "TieneCosecha") == 1);
    }

    private sealed record EstadoCosecha(
        int CosechaId, string Nombre, string Estado, string EstadoControl,
        DateTime FechaInicio, DateTime FechaFin, DateTime? FechaFinReal,
        string Producto, string? CampaniaNombre, int? EmpresaId,
        DateTime? SiembraFechaFinReal, decimal? SiembraPmg,
        decimal HectareasSembradas, decimal HectareasLote,
        DateTime? PrimeraFechaRegistro, DateTime? UltimaFechaParte, DateTime? UltimaFechaTirada,
        decimal KgIngresadosSilo, decimal KgDistribuidosDirecto, decimal HectareasPartes);

    /// <summary>
    /// Lee la cosecha con todo lo que necesitan las validaciones. Dentro de una
    /// transaccion bloquea la fila (UPDLOCK) para que dos operaciones concurrentes
    /// no validen contra el mismo estado.
    /// </summary>
    private static async Task<EstadoCosecha?> LeerEstadoCosechaAsync(
        SqlConnection connection, SqlTransaction? transaction, int cosechaId)
    {
        var bloqueo = transaction is null ? string.Empty : "WITH (UPDLOCK, ROWLOCK)";
        var sql = $"""
            SELECT c.CosechaId, c.Nombre, c.Estado, c.EstadoControl, c.FechaInicio, c.FechaFin, c.FechaFinReal,
                   c.Producto, c.CampaniaNombre, COALESCE(c.EmpresaId, l.EmpresaId) AS EmpresaId,
                   s.FechaFinReal AS SiembraFechaFinReal, s.PMG AS SiembraPmg,
                   COALESCE(s.CantidadHectareasTrabajadas, l.Hectareas) AS HectareasSembradas,
                   l.Hectareas AS HectareasLote,
                   (SELECT MIN(x.Fecha) FROM (
                        SELECT p.Fecha FROM dbo.CosechaPartes AS p WHERE p.CosechaId = c.CosechaId
                        UNION ALL
                        SELECT t.Fecha FROM dbo.CosechaTiradaAros AS t WHERE t.CosechaId = c.CosechaId) AS x
                   ) AS PrimeraFechaRegistro,
                   (SELECT MAX(p.Fecha) FROM dbo.CosechaPartes AS p WHERE p.CosechaId = c.CosechaId) AS UltimaFechaParte,
                   (SELECT MAX(t.Fecha) FROM dbo.CosechaTiradaAros AS t WHERE t.CosechaId = c.CosechaId) AS UltimaFechaTirada,
                   (SELECT ISNULL(SUM(a.Cantidad), 0) FROM dbo.Almacenamientos AS a
                    WHERE a.CosechaId = c.CosechaId AND a.TipoMovimiento = N'Ingreso' AND a.Origen <> N'Transferencia'
                   ) AS KgIngresadosSilo,
                   (SELECT ISNULL(SUM(dc.KgDespachados), 0) FROM dbo.DistribucionCamiones AS dc
                    INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = dc.DistribucionId
                    WHERE d.CosechaId = c.CosechaId AND d.OrigenGrano = N'Cosecha'
                   ) AS KgDistribuidosDirecto,
                   (SELECT ISNULL(SUM(p.Hectareas), 0) FROM dbo.CosechaPartes AS p WHERE p.CosechaId = c.CosechaId) AS HectareasPartes
            FROM dbo.Cosechas AS c {bloqueo}
            INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
            LEFT JOIN dbo.Siembras AS s ON s.SiembraId = c.SiembraId
            WHERE c.CosechaId = @CosechaId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;

        return new EstadoCosecha(
            Int(reader, "CosechaId"),
            Str(reader, "Nombre"),
            Str(reader, "Estado"),
            Str(reader, "EstadoControl"),
            Fecha(reader, "FechaInicio"),
            Fecha(reader, "FechaFin"),
            FechaN(reader, "FechaFinReal"),
            Str(reader, "Producto"),
            StrN(reader, "CampaniaNombre"),
            IntN(reader, "EmpresaId"),
            FechaN(reader, "SiembraFechaFinReal"),
            DecN(reader, "SiembraPmg"),
            Dec(reader, "HectareasSembradas"),
            Dec(reader, "HectareasLote"),
            FechaN(reader, "PrimeraFechaRegistro"),
            FechaN(reader, "UltimaFechaParte"),
            FechaN(reader, "UltimaFechaTirada"),
            Dec(reader, "KgIngresadosSilo"),
            Dec(reader, "KgDistribuidosDirecto"),
            Dec(reader, "HectareasPartes"));
    }

    private static void ValidarInicioEnPeriodo(DateTime inicio, string? campaniaNombre)
    {
        var periodo = System.Text.RegularExpressions.Regex.Match(campaniaNombre ?? "", @"(?<!\d)\d{4}-(\d{4})(?!\d)");
        if (!periodo.Success || !int.TryParse(periodo.Groups[1].Value, out var anioFin) || anioFin is < 1900 or > 9998)
            return;
        var ultimoDia = new DateTime(anioFin, 12, 31);
        if (inicio.Date > ultimoDia)
            throw new ReglaCosechaException($"La fecha de inicio no puede superar el 31/12/{anioFin}, fin del período de campaña.");
    }

    private static void ValidarResultado(
        EstadoCosecha cosecha, DateTime fechaFinReal, string? justificacion, decimal kg, decimal hectareas,
        decimal humedad, decimal? impurezas, decimal hectareasHora)
    {
        var real = fechaFinReal.Date;
        var inicio = cosecha.FechaInicio.Date;

        if (real < inicio)
            throw new ReglaCosechaException($"La fecha real de finalización no puede ser anterior al inicio ({inicio:dd/MM/yyyy}).");
        if (real > inicio.AddMonths(MesesMaximoCosecha))
            throw new ReglaCosechaException($"La fecha real de finalización no puede superar los {MesesMaximoCosecha} meses desde el inicio.");
        if (cosecha.UltimaFechaParte is not null && cosecha.UltimaFechaParte.Value.Date > real)
            throw new ReglaCosechaException($"Hay partes de avance del {cosecha.UltimaFechaParte.Value:dd/MM/yyyy}, posteriores a la fecha real.");
        if (cosecha.UltimaFechaTirada is not null && cosecha.UltimaFechaTirada.Value.Date > real)
            throw new ReglaCosechaException($"Hay tiradas de aros del {cosecha.UltimaFechaTirada.Value:dd/MM/yyyy}, posteriores a la fecha real.");

        var diasDesvio = Math.Abs((real - cosecha.FechaFin.Date).Days);
        if (diasDesvio > DiasDesvioRequiereJustificacion && string.IsNullOrWhiteSpace(justificacion))
            throw new ReglaCosechaException(
                $"La fecha real se aleja {diasDesvio} días de la fecha tentativa. Registrá una justificación del desvío.");

        if (kg <= 0) throw new ReglaCosechaException("La cantidad de grano cosechado debe ser mayor a cero.");
        if (hectareas <= 0) throw new ReglaCosechaException("Las hectáreas trabajadas deben ser mayores a cero.");
        if (hectareas > cosecha.HectareasLote)
            throw new ReglaCosechaException($"Las hectáreas trabajadas no pueden superar la superficie del lote ({cosecha.HectareasLote:N2} ha).");

        var comprometido = cosecha.KgIngresadosSilo + cosecha.KgDistribuidosDirecto;
        if (kg < comprometido)
            throw new ReglaCosechaException(
                $"El grano cosechado no puede ser menor a lo que ya ingresó a silos o se distribuyó desde esta cosecha ({comprometido:N0} kg).");

        if (humedad is < 0 or >= 100) throw new ReglaCosechaException("La humedad del grano debe estar entre 0 y 100 %.");
        if (impurezas is < 0 or >= 100) throw new ReglaCosechaException("Las impurezas deben estar entre 0 y 100 %.");
        if (hectareasHora <= 0) throw new ReglaCosechaException("Las hectáreas por hora deben ser mayores a cero.");
    }

    private static void ValidarTiradaPermitida(EstadoCosecha cosecha, DateTime fechaTirada)
    {
        if (cosecha.EstadoControl == "Finalizado")
        {
            throw new ConflictoCosechaException(
                $"El control de pérdidas de {cosecha.Nombre} está cerrado: no admite nuevas tiradas ni cambios.");
        }

        var fecha = fechaTirada.Date;
        if (fecha < cosecha.FechaInicio.Date)
            throw new ReglaCosechaException($"La fecha del control no puede ser anterior al inicio de la cosecha ({cosecha.FechaInicio:dd/MM/yyyy}).");
        if (fecha > cosecha.FechaInicio.Date.AddMonths(4))
            throw new ReglaCosechaException("La fecha del control no puede superar los 4 meses desde el inicio de la cosecha.");
        if (cosecha.FechaFinReal is not null && fecha > cosecha.FechaFinReal.Value.Date)
            throw new ReglaCosechaException($"La fecha del control no puede ser posterior al fin real de la cosecha ({cosecha.FechaFinReal.Value:dd/MM/yyyy}).");
    }

    private static void ValidarParte(EstadoCosecha cosecha, CrearCosechaParteRequest request, decimal hectareasExcluidas)
    {
        if (cosecha.Estado != "En curso")
            throw new ConflictoCosechaException("Solo se cargan partes mientras la cosecha está En curso.");

        var fecha = request.Fecha.Date;
        if (fecha < cosecha.FechaInicio.Date)
            throw new ReglaCosechaException($"La fecha del parte no puede ser anterior al inicio de la cosecha ({cosecha.FechaInicio:dd/MM/yyyy}).");
        if (fecha > DateTime.Today)
            throw new ReglaCosechaException("La fecha del parte no puede ser posterior a hoy.");

        var acumuladas = cosecha.HectareasPartes - hectareasExcluidas;
        if (acumuladas + request.Hectareas > cosecha.HectareasSembradas)
        {
            throw new ReglaCosechaException(
                $"Con este parte se superan las {cosecha.HectareasSembradas:N2} ha sembradas ({acumuladas:N2} ha ya cargadas).");
        }
    }

    private async Task<int> RegistrarIngresoSiloAsync(
        SqlConnection connection, SqlTransaction transaction, EstadoCosecha cosecha,
        CrearCosechaParteRequest request, int usuarioIdIngreso)
    {
        try
        {
            return await almacenamientoRepository.RegistrarIngresoCosechaAsync(
                connection, transaction, request.SiloId!.Value, cosecha.EmpresaId,
                DateOnly.FromDateTime(request.Fecha), request.KgCosechados, cosecha.CosechaId, cosecha.Producto,
                cosecha.CampaniaNombre, cosecha.Nombre, request.HumedadPct,
                $"Parte de cosecha del {request.Fecha:dd/MM/yyyy}", usuarioIdIngreso);
        }
        catch (InvalidOperationException ex)
        {
            // Las validaciones de Almacenamiento (capacidad, grano, fecha) se informan como regla de negocio.
            throw new ReglaCosechaException(ex.Message);
        }
    }

    private sealed record ParteExistente(
        DateTime Fecha, decimal Hectareas, decimal KgCosechados, decimal HumedadPct, string Destino, int? SiloId, int? CreadoPorUsuarioId);

    private static async Task<ParteExistente?> LeerParteBloqueadoAsync(
        SqlConnection connection, SqlTransaction transaction, int cosechaId, int parteId)
    {
        const string sql = """
            SELECT Fecha, Hectareas, KgCosechados, HumedadPct, Destino, SiloId, CreadoPorUsuarioId
            FROM dbo.CosechaPartes WITH (UPDLOCK, ROWLOCK)
            WHERE CosechaParteId = @ParteId AND CosechaId = @CosechaId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@ParteId", parteId);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;

        return new ParteExistente(
            Fecha(reader, "Fecha"),
            Dec(reader, "Hectareas"),
            Dec(reader, "KgCosechados"),
            Dec(reader, "HumedadPct"),
            Str(reader, "Destino"),
            IntN(reader, "SiloId"),
            IntN(reader, "CreadoPorUsuarioId"));
    }

    /// <summary>
    /// Parametros para clasificar tiradas: ajuste de la empresa, si no la referencia
    /// INTA PRECOP del grano y, si el grano no tiene referencia, los cortes generales.
    /// </summary>
    private static async Task<ParametrosPerdidaCosechaDto> ResolverParametrosAsync(
        SqlConnection connection, SqlTransaction? transaction, EstadoCosecha cosecha)
    {
        const string sql = """
            SELECT N'Empresa' AS Origen, p.Producto, p.ToleranciaKgHa, p.FactorAlta,
                   CAST(NULL AS NVARCHAR(300)) AS Fuente, CAST(NULL AS DECIMAL(10,2)) AS Pmg
            FROM dbo.GranoParametrosCosecha AS p
            WHERE p.EmpresaId = @EmpresaId
            UNION ALL
            SELECT N'Referencia', g.Producto, g.ToleranciaKgHa, CAST(@FactorDefecto AS DECIMAL(4,2)),
                   g.FuenteReferencia, g.PmgReferenciaG
            FROM dbo.GranoToleranciasCosecha AS g;
            """;

        var grano = CalculadoraPerdidasCosecha.NormalizarGrano(cosecha.Producto);
        (decimal Tolerancia, decimal Factor)? empresa = null;
        (decimal Tolerancia, decimal Factor, string? Fuente, decimal? Pmg)? referencia = null;

        await using (var command = new SqlCommand(sql, connection, transaction))
        {
            command.Parameters.AddWithValue("@EmpresaId", (object?)cosecha.EmpresaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@FactorDefecto", CalculadoraPerdidasCosecha.FactorAltaPorDefecto);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                if (CalculadoraPerdidasCosecha.NormalizarGrano(Str(reader, "Producto")) != grano) continue;

                if (Str(reader, "Origen") == "Empresa")
                {
                    empresa = (Dec(reader, "ToleranciaKgHa"), Dec(reader, "FactorAlta"));
                }
                else
                {
                    referencia = (Dec(reader, "ToleranciaKgHa"), Dec(reader, "FactorAlta"), StrN(reader, "Fuente"), DecN(reader, "Pmg"));
                }
            }
        }

        var (tolerancia, factor, origen) = empresa is not null
            ? (empresa.Value.Tolerancia, empresa.Value.Factor, "Empresa")
            : referencia is not null
                ? (referencia.Value.Tolerancia, referencia.Value.Factor, "Referencia")
                : (CalculadoraPerdidasCosecha.ToleranciaGeneralKgHa, CalculadoraPerdidasCosecha.FactorAltaGeneral, "General");

        return new ParametrosPerdidaCosechaDto
        {
            Producto = cosecha.Producto,
            ToleranciaKgHa = tolerancia,
            FactorAlta = factor,
            LimiteMediaKgHa = decimal.Round(tolerancia * factor, 2),
            Origen = origen,
            FuenteReferencia = referencia?.Fuente,
            PmgSiembra = cosecha.SiembraPmg,
            PmgReferencia = referencia?.Pmg,
            AreaAroM2 = CalculadoraPerdidasCosecha.AreaAroM2
        };
    }

    private static (decimal Pmg, string Origen) ResolverPmg(decimal? pmgIndicado, ParametrosPerdidaCosechaDto parametros)
    {
        if (pmgIndicado is > 0)
        {
            var origen = pmgIndicado == parametros.PmgSiembra ? "Siembra"
                : pmgIndicado == parametros.PmgReferencia ? "Referencia"
                : "Manual";
            return (pmgIndicado.Value, origen);
        }

        if (parametros.PmgSiembra is > 0) return (parametros.PmgSiembra.Value, "Siembra");
        if (parametros.PmgReferencia is > 0) return (parametros.PmgReferencia.Value, "Referencia");

        throw new ReglaCosechaException("No hay PMG para calcular la pérdida: cargalo en la siembra o indicalo en la tirada.");
    }

    private static async Task<decimal?> ObtenerHumedadBaseAsync(SqlConnection connection, SqlTransaction transaction, string producto)
    {
        const string sql = "SELECT Producto, HumedadBase FROM dbo.GranoBasesComercializacion;";
        var grano = CalculadoraPerdidasCosecha.NormalizarGrano(producto);

        await using var command = new SqlCommand(sql, connection, transaction);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            if (CalculadoraPerdidasCosecha.NormalizarGrano(reader.GetString(0)) == grano)
            {
                return reader.GetDecimal(1);
            }
        }

        return null;
    }

    private static async Task<string> GenerarSiguienteNombreAsync(SqlConnection connection, SqlTransaction transaction)
    {
        // Dentro de la transaccion del alta y con bloqueo: dos altas simultaneas no repiten nombre.
        const string sql = """
            SELECT ISNULL(MAX(TRY_CAST(RIGHT(Nombre, 4) AS INT)), 0) + 1
            FROM dbo.Cosechas WITH (UPDLOCK, HOLDLOCK);
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        var siguiente = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 1);
        return $"COS - {siguiente:D4}";
    }

    // =====================================================================
    // Parametros y mapeos
    // =====================================================================

    private static void AgregarParametrosGenerales(
        SqlCommand command, string? responsable, string? tipoServicio, string? contratista, string? cosechadora, decimal? anchoCabezal)
    {
        command.Parameters.AddWithValue("@ResponsableACargo", TextoONull(responsable));
        command.Parameters.AddWithValue("@TipoServicio", TextoONull(tipoServicio));
        command.Parameters.AddWithValue("@Contratista", tipoServicio == "Contratada" ? TextoONull(contratista) : DBNull.Value);
        command.Parameters.AddWithValue("@Cosechadora", tipoServicio is "Propia" or "Contratada" ? TextoONull(cosechadora?.ToUpperInvariant()) : DBNull.Value);
        command.Parameters.AddWithValue("@AnchoCabezalM", tipoServicio is "Propia" or "Contratada" ? (object?)anchoCabezal ?? DBNull.Value : DBNull.Value);
    }

    private static void AgregarParametrosTirada(
        SqlCommand command, CrearCosechaTiradaAroRequest request, decimal pmg, string pmgOrigen,
        CalculadoraPerdidasCosecha.ResultadoPerdida calculo, ParametrosPerdidaCosechaDto parametros)
    {
        command.Parameters.AddWithValue("@Fecha", request.Fecha.Date);
        command.Parameters.AddWithValue("@Latitud", (object?)request.Latitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@Longitud", (object?)request.Longitud ?? DBNull.Value);
        command.Parameters.AddWithValue("@AroCabezal", request.AroCabezal);
        command.Parameters.AddWithValue("@AroCola1", request.AroCola1);
        command.Parameters.AddWithValue("@AroCola2", request.AroCola2);
        command.Parameters.AddWithValue("@AroCola3", request.AroCola3);
        command.Parameters.AddWithValue("@GranosPrecosecha", (object?)request.GranosPrecosecha ?? DBNull.Value);
        command.Parameters.AddWithValue("@PMG", pmg);
        command.Parameters.AddWithValue("@PmgOrigen", pmgOrigen);
        command.Parameters.AddWithValue("@PerdidaPrecosechaKgHa", request.GranosPrecosecha is null ? DBNull.Value : calculo.PerdidaPrecosecha);
        command.Parameters.AddWithValue("@PerdidaCabezalKgHa", calculo.PerdidaCabezal);
        command.Parameters.AddWithValue("@PerdidaColaKgHa", calculo.PerdidaCola);
        command.Parameters.AddWithValue("@PerdidaTotalKgHa", calculo.PerdidaTotal);
        command.Parameters.AddWithValue("@Severidad", calculo.Severidad);
        command.Parameters.AddWithValue("@ToleranciaAplicadaKgHa", parametros.ToleranciaKgHa);
        command.Parameters.AddWithValue("@FactorAltaAplicado", parametros.FactorAlta);
        command.Parameters.AddWithValue("@AjustoMaquinaria", request.AjustoMaquinaria);
        command.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
    }

    private static void AgregarParametrosParte(SqlCommand command, CrearCosechaParteRequest request, int? almacenamientoId)
    {
        command.Parameters.AddWithValue("@Fecha", request.Fecha.Date);
        command.Parameters.AddWithValue("@Hectareas", request.Hectareas);
        command.Parameters.AddWithValue("@KgCosechados", request.KgCosechados);
        command.Parameters.AddWithValue("@HumedadPct", request.HumedadPct);
        command.Parameters.AddWithValue("@Destino", request.Destino);
        command.Parameters.AddWithValue("@SiloId", request.Destino == "Silo" ? (object?)request.SiloId ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("@AlmacenamientoId", (object?)almacenamientoId ?? DBNull.Value);
        command.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
    }

    private static CosechaDto MapearCosecha(SqlDataReader reader) => new()
    {
        CosechaId = Int(reader, "CosechaId"),
        Nombre = Str(reader, "Nombre"),
        SiembraId = IntN(reader, "SiembraId"),
        SiembraNombre = StrN(reader, "SiembraNombre"),
        CicloEstacional = StrN(reader, "CicloEstacional"),
        LoteId = Int(reader, "LoteId"),
        LoteNombre = Str(reader, "LoteNombre"),
        EmpresaId = IntN(reader, "EmpresaId"),
        Empresa = StrN(reader, "Empresa"),
        CampaniaNombre = StrN(reader, "CampaniaNombre"),
        Producto = Str(reader, "Producto"),
        FechaInicio = Fecha(reader, "FechaInicio"),
        FechaFin = Fecha(reader, "FechaFin"),
        FechaFinReal = FechaN(reader, "FechaFinReal"),
        JustificacionDesvioFin = StrN(reader, "JustificacionDesvioFin"),
        CantidadGranoCosechado = DecN(reader, "CantidadGranoCosechado"),
        CantidadHectareasTrabajadas = DecN(reader, "CantidadHectareasTrabajadas"),
        HumedadGrano = DecN(reader, "HumedadGrano"),
        Impurezas = DecN(reader, "Impurezas"),
        ResponsableACargo = StrN(reader, "ResponsableACargo"),
        RindeKgHa = DecN(reader, "RindeKgHa"),
        RindeSecoKgHa = DecN(reader, "RindeSecoKgHa"),
        HumedadBaseAplicada = DecN(reader, "HumedadBaseAplicada"),
        HectareasHora = DecN(reader, "HectareasHora"),
        TipoServicio = StrN(reader, "TipoServicio"),
        Contratista = StrN(reader, "Contratista"),
        Cosechadora = StrN(reader, "Cosechadora"),
        AnchoCabezalM = DecN(reader, "AnchoCabezalM"),
        Estado = Str(reader, "Estado"),
        EstadoControl = Str(reader, "EstadoControl"),
        HectareasSembradas = DecN(reader, "HectareasSembradas"),
        CantidadPartes = IntN(reader, "CantidadPartes") ?? 0,
        HectareasCosechadas = DecN(reader, "HectareasCosechadas") ?? 0m,
        KgAcumulados = DecN(reader, "KgAcumulados") ?? 0m,
        HumedadPromedioPct = DecN(reader, "HumedadPromedioPct"),
        KgASilo = DecN(reader, "KgASilo") ?? 0m,
        KgDistribucionDirecta = DecN(reader, "KgDistribucionDirecta") ?? 0m,
        KgPendientes = DecN(reader, "KgPendientes") ?? 0m,
        FechaUltimoParte = FechaN(reader, "FechaUltimoParte"),
        CantidadTiradas = IntN(reader, "CantidadTiradas") ?? 0,
        PerdidaPromedioKgHa = DecN(reader, "PerdidaPromedioKgHa"),
        UltimaSeveridad = StrN(reader, "UltimaSeveridad")
    };

    private static CosechaTiradaAroDto MapearTirada(SqlDataReader reader) => new()
    {
        CosechaTiradaAroId = Int(reader, "CosechaTiradaAroId"),
        CosechaId = Int(reader, "CosechaId"),
        Fecha = Fecha(reader, "Fecha"),
        Latitud = DecN(reader, "Latitud"),
        Longitud = DecN(reader, "Longitud"),
        AroCabezal = Int(reader, "AroCabezal"),
        AroCola1 = Int(reader, "AroCola1"),
        AroCola2 = Int(reader, "AroCola2"),
        AroCola3 = Int(reader, "AroCola3"),
        GranosPrecosecha = DecN(reader, "GranosPrecosecha"),
        PMG = Dec(reader, "PMG"),
        PmgOrigen = StrN(reader, "PmgOrigen"),
        PerdidaPrecosechaKgHa = DecN(reader, "PerdidaPrecosechaKgHa"),
        PerdidaCabezalKgHa = Dec(reader, "PerdidaCabezalKgHa"),
        PerdidaColaKgHa = Dec(reader, "PerdidaColaKgHa"),
        PerdidaTotalKgHa = Dec(reader, "PerdidaTotalKgHa"),
        Severidad = Str(reader, "Severidad"),
        ToleranciaAplicadaKgHa = DecN(reader, "ToleranciaAplicadaKgHa"),
        FactorAltaAplicado = DecN(reader, "FactorAltaAplicado"),
        AjustoMaquinaria = reader.GetBoolean(reader.GetOrdinal("AjustoMaquinaria")),
        Observaciones = StrN(reader, "Observaciones"),
        CreadoPorUsuarioId = IntN(reader, "CreadoPorUsuarioId")
    };

    private static CosechaParteDto MapearParte(SqlDataReader reader)
    {
        var hectareas = Dec(reader, "Hectareas");
        var kg = Dec(reader, "KgCosechados");

        return new CosechaParteDto
        {
            CosechaParteId = Int(reader, "CosechaParteId"),
            CosechaId = Int(reader, "CosechaId"),
            Fecha = Fecha(reader, "Fecha"),
            Hectareas = hectareas,
            KgCosechados = kg,
            RindeKgHa = hectareas > 0 ? CalculadoraPerdidasCosecha.Rinde(kg, hectareas) : 0m,
            HumedadPct = Dec(reader, "HumedadPct"),
            Destino = Str(reader, "Destino"),
            SiloId = IntN(reader, "SiloId"),
            SiloNombre = StrN(reader, "SiloNombre"),
            AlmacenamientoId = IntN(reader, "AlmacenamientoId"),
            Observaciones = StrN(reader, "Observaciones"),
            CreadoPorUsuarioId = IntN(reader, "CreadoPorUsuarioId"),
            CargadoPor = NombreCompleto(StrN(reader, "UsuarioNombre"), StrN(reader, "UsuarioApellido"))
        };
    }

    // ---------------------------------------------------------------------
    // Lectura por nombre de columna: no se rompe si cambia el orden del SELECT.
    // ---------------------------------------------------------------------

    private static int Int(SqlDataReader r, string columna) => r.GetInt32(r.GetOrdinal(columna));

    private static int? IntN(SqlDataReader r, string columna)
    {
        var i = r.GetOrdinal(columna);
        return r.IsDBNull(i) ? null : r.GetInt32(i);
    }

    private static decimal Dec(SqlDataReader r, string columna) => r.GetDecimal(r.GetOrdinal(columna));

    private static decimal? DecN(SqlDataReader r, string columna)
    {
        var i = r.GetOrdinal(columna);
        return r.IsDBNull(i) ? null : r.GetDecimal(i);
    }

    private static string Str(SqlDataReader r, string columna) => r.GetString(r.GetOrdinal(columna));

    private static string? StrN(SqlDataReader r, string columna)
    {
        var i = r.GetOrdinal(columna);
        return r.IsDBNull(i) ? null : r.GetString(i);
    }

    private static DateTime Fecha(SqlDataReader r, string columna) => r.GetDateTime(r.GetOrdinal(columna));

    private static DateTime? FechaN(SqlDataReader r, string columna)
    {
        var i = r.GetOrdinal(columna);
        return r.IsDBNull(i) ? null : r.GetDateTime(i);
    }

    private static object TextoONull(string? valor) =>
        string.IsNullOrWhiteSpace(valor) ? DBNull.Value : valor.Trim();

    private static string? NombreCompleto(string? nombre, string? apellido)
    {
        var partes = new[] { nombre, apellido }.Where(v => !string.IsNullOrWhiteSpace(v)).ToArray();
        return partes.Length == 0 ? null : string.Join(' ', partes);
    }
}
