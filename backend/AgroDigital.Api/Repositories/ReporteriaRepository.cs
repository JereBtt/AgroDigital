using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

public sealed record InformeCampaniaDatos(string? Periodo, IReadOnlyDictionary<string, IReadOnlyList<object>> Secciones);
public sealed record DesviosSiembraDatos(string? Periodo, object? Resumen, IReadOnlyList<object> Operaciones);
public sealed record ProductividadFertilizacionDatos(string? Periodo, IReadOnlyList<object> ProductividadOperaciones,
    IReadOnlyList<object> ProductividadPorLote, IReadOnlyList<object> RefertilizacionPorLote,
    IReadOnlyList<object> FertilizantePorLote, object? TotalesFertilizante);
public sealed record KpisPantallaDatos(string Modulo, string? Periodo, string? Ciclo,
    IReadOnlyList<object> Indicadores);

public sealed class ReporteriaRepository(IConfiguration configuration)
{
    private readonly string _connectionString = configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontró la cadena de conexión AgroDigital.");

    public async Task<bool> ExisteEmpresaAsync(int empresaId, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand("SELECT 1 FROM dbo.Empresas WHERE EmpresaId=@EmpresaId AND Activo=1", db);
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        return await cmd.ExecuteScalarAsync(ct) is not null;
    }

    public async Task<(DateOnly Desde, DateOnly Hasta)?> RangoCampaniaAsync(int empresaId, string periodo, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand("""
            SELECT TOP (1) FechaInicio, FechaFin FROM dbo.Campanias
            WHERE EmpresaId=@EmpresaId AND Periodo=@Periodo
            ORDER BY CampaniaId DESC;
            """, db);
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.Add("@Periodo", SqlDbType.NVarChar, 9).Value = periodo;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return (DateOnly.FromDateTime(reader.GetDateTime(0)), DateOnly.FromDateTime(reader.GetDateTime(1)));
    }

    public async Task<int?> CampaniaIdAsync(int empresaId, string periodo, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand("SELECT TOP (1) CampaniaId FROM dbo.Campanias WHERE EmpresaId=@EmpresaId AND Periodo=@Periodo ORDER BY CampaniaId DESC", db);
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.Add("@Periodo", SqlDbType.NVarChar, 9).Value = periodo;
        return await cmd.ExecuteScalarAsync(ct) is int id ? id : null;
    }

    public async Task<IReadOnlyList<string>> UltimasCampaniasAsync(int empresaId, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand("""
            SELECT TOP (2) Periodo FROM dbo.Campanias
            WHERE EmpresaId=@EmpresaId
            GROUP BY Periodo
            ORDER BY Periodo DESC;
            """, db);
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var periodos = new List<string>();
        while (await reader.ReadAsync(ct)) periodos.Add(reader.GetString(0));
        return periodos;
    }

    public async Task<IReadOnlyList<object>> ListarConversacionesAsync(int empresaId, int usuarioId, CancellationToken ct)
    {
        const string sql = """
            SELECT TOP (20) ConversacionId AS id, Titulo AS titulo, FechaActualizacion AS fecha
            FROM dbo.ReporteriaConversaciones
            WHERE EmpresaId=@EmpresaId AND UsuarioId=@UsuarioId
            ORDER BY FechaActualizacion DESC, ConversacionId DESC;
            """;
        return await LeerAsync(sql, empresaId, usuarioId, null, null, null, ct);
    }

    public async Task<IReadOnlyList<object>?> LeerMensajesAsync(int empresaId, int usuarioId, int conversacionId, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        const string sql = """
            SELECT x.id,x.rol,x.contenido,x.modo,x.fuentes,x.fecha FROM (
                SELECT TOP (100) m.MensajeId AS id, m.Rol AS rol, m.Contenido AS contenido,
                       m.Modo AS modo, m.Fuentes AS fuentes, m.FechaCreacion AS fecha
                FROM dbo.ReporteriaMensajes m
                INNER JOIN dbo.ReporteriaConversaciones c ON c.ConversacionId=m.ConversacionId
                WHERE c.ConversacionId=@ConversacionId AND c.EmpresaId=@EmpresaId AND c.UsuarioId=@UsuarioId
                ORDER BY m.MensajeId DESC
            ) x ORDER BY x.id;
            """;
        await using var cmd = new SqlCommand(sql, db);
        cmd.Parameters.AddWithValue("@ConversacionId", conversacionId);
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.AddWithValue("@UsuarioId", usuarioId);
        var rows = await LeerFilasAsync(cmd, ct);
        if (rows.Count == 0)
        {
            await using var exists = new SqlCommand("SELECT 1 FROM dbo.ReporteriaConversaciones WHERE ConversacionId=@Id AND EmpresaId=@EmpresaId AND UsuarioId=@UsuarioId", db);
            exists.Parameters.AddWithValue("@Id", conversacionId);
            exists.Parameters.AddWithValue("@EmpresaId", empresaId);
            exists.Parameters.AddWithValue("@UsuarioId", usuarioId);
            if (await exists.ExecuteScalarAsync(ct) is null) return null;
        }
        return rows;
    }

    public async Task<int> GuardarIntercambioAsync(int empresaId, int usuarioId, int? conversacionId,
        string pregunta, string respuesta, string modo, string fuentes, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var tx = (SqlTransaction)await db.BeginTransactionAsync(ct);
        int id;
        if (conversacionId is null)
        {
            await using var create = new SqlCommand("""
                INSERT dbo.ReporteriaConversaciones(EmpresaId,UsuarioId,Titulo)
                OUTPUT INSERTED.ConversacionId VALUES(@EmpresaId,@UsuarioId,@Titulo);
                """, db, tx);
            create.Parameters.AddWithValue("@EmpresaId", empresaId);
            create.Parameters.AddWithValue("@UsuarioId", usuarioId);
            create.Parameters.AddWithValue("@Titulo", pregunta.Length > 115 ? pregunta[..115] + "…" : pregunta);
            id = (int)(await create.ExecuteScalarAsync(ct) ?? throw new InvalidOperationException("No se pudo crear la conversación."));
        }
        else
        {
            id = conversacionId.Value;
            await using var update = new SqlCommand("""
                UPDATE dbo.ReporteriaConversaciones SET FechaActualizacion=SYSUTCDATETIME()
                WHERE ConversacionId=@Id AND EmpresaId=@EmpresaId AND UsuarioId=@UsuarioId;
                """, db, tx);
            update.Parameters.AddWithValue("@Id", id);
            update.Parameters.AddWithValue("@EmpresaId", empresaId);
            update.Parameters.AddWithValue("@UsuarioId", usuarioId);
            if (await update.ExecuteNonQueryAsync(ct) != 1) throw new KeyNotFoundException("No se encontró la conversación.");
        }
        await using var insert = new SqlCommand("""
            INSERT dbo.ReporteriaMensajes(ConversacionId,Rol,Contenido,Modo,Fuentes)
            VALUES(@Id,N'usuario',@Pregunta,NULL,NULL),(@Id,N'asistente',@Respuesta,@Modo,@Fuentes);
            """, db, tx);
        insert.Parameters.AddWithValue("@Id", id);
        insert.Parameters.AddWithValue("@Pregunta", pregunta);
        insert.Parameters.AddWithValue("@Respuesta", respuesta);
        insert.Parameters.AddWithValue("@Modo", modo);
        insert.Parameters.AddWithValue("@Fuentes", fuentes);
        await insert.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
        return id;
    }

    // El nombre de consulta solo selecciona SQL fijo. Ningún argumento del modelo se concatena en SQL.
    public async Task<IReadOnlyList<object>> ConsultarAsync(int empresaId, string consulta,
        string? campania, string? lote, string? cultivo, CancellationToken ct)
    {
        return await LeerAsync(SqlConsulta(consulta), empresaId, null, campania, lote, cultivo, ct);
    }

    // Un solo viaje a SQL Server y un único resultado compacto para el informe general.
    // Reutiliza las mismas consultas fijas que las preguntas individuales.
    public async Task<InformeCampaniaDatos> ConsultarInformeCampaniaAsync(int empresaId, string? campania, CancellationToken ct)
    {
        (string Seccion, string Consulta)[] consultas =
        [
            ("siembra", "siembras_resumen"), ("cosecha", "resumen_campania"),
            ("insumos", "insumos_resumen"), ("fertilizacion", "fertilizacion"),
            ("siniestros", "siniestros_resumen"), ("resiembras", "resiembras_resumen"),
            ("perdidas_cosecha", "perdidas_cosecha"), ("almacenamiento", "almacenamiento"),
            ("distribucion", "distribucion")
        ];
        var sql = """
            DECLARE @Periodo nvarchar(9) = COALESCE(@Campania,
                (SELECT TOP (1) c.Periodo FROM dbo.Campanias c
                 WHERE c.EmpresaId=@EmpresaId ORDER BY c.FechaInicio DESC,c.CampaniaId DESC));
            SELECT @Periodo AS periodo;
            """ + string.Join("\n", consultas.Select(x => SqlConsulta(x.Consulta).Replace("@Campania", "@Periodo", StringComparison.Ordinal)));
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, db) { CommandTimeout = 30 };
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.Add("@Campania", SqlDbType.NVarChar, 9).Value = (object?)campania ?? DBNull.Value;
        cmd.Parameters.Add("@Lote", SqlDbType.NVarChar, 120).Value = DBNull.Value;
        cmd.Parameters.Add("@Cultivo", SqlDbType.NVarChar, 60).Value = DBNull.Value;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var periodo = await reader.ReadAsync(ct) && !reader.IsDBNull(0) ? reader.GetString(0) : null;
        var secciones = new Dictionary<string, IReadOnlyList<object>>();
        foreach (var (seccion, _) in consultas)
        {
            if (!await reader.NextResultAsync(ct))
                throw new InvalidOperationException("El resumen de campaña devolvió menos secciones de las esperadas.");
            secciones[seccion] = await LeerFilasAsync(reader, ct);
        }
        return new InformeCampaniaDatos(periodo, secciones);
    }

    // Fechas de cierre de cada siembra y resiembra, con la justificación registrada.
    // El resumen considera todas las operaciones; el detalle prioriza los atrasos más largos.
    public async Task<DesviosSiembraDatos> ConsultarDesviosSiembraAsync(int empresaId, string? campania, CancellationToken ct)
    {
        const string sql = """
            DECLARE @Periodo nvarchar(9) = COALESCE(@Campania,
                (SELECT TOP (1) c.Periodo FROM dbo.Campanias c
                 WHERE c.EmpresaId=@EmpresaId ORDER BY c.FechaInicio DESC,c.CampaniaId DESC));
            SELECT @Periodo AS periodo;
            SELECT COUNT(*) AS operaciones, COUNT(s.FechaFinReal) AS finalizadas,
                COUNT(*)-COUNT(s.FechaFinReal) AS sinCierreReal,
                SUM(CASE WHEN s.FechaFinReal>s.FechaFin THEN 1 ELSE 0 END) AS atrasadas,
                SUM(CASE WHEN s.FechaFinReal<s.FechaFin THEN 1 ELSE 0 END) AS anticipadas,
                SUM(CASE WHEN s.FechaFinReal=s.FechaFin THEN 1 ELSE 0 END) AS enFecha,
                AVG(CASE WHEN s.FechaFinReal IS NOT NULL
                    THEN CONVERT(decimal(12,2),DATEDIFF(day,s.FechaFin,s.FechaFinReal)) END) AS promedioDesvioDias
            FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
            WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Periodo;
            SELECT TOP (45) COUNT(*) OVER() AS totalFinalizadas,
                l.Nombre AS lote,s.Nombre AS registro,s.TipoRegistro AS tipoRegistro,
                s.CicloEstacional AS ciclo,s.Producto AS cultivo,
                s.FechaFin AS finTentativo,s.FechaFinReal AS finReal,
                DATEDIFF(day,s.FechaFin,s.FechaFinReal) AS desvioDias,
                NULLIF(LEFT(LTRIM(RTRIM(s.JustificacionDesvioFin)),400),N'') AS motivoRegistrado
            FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
            WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Periodo
              AND s.FechaFinReal IS NOT NULL
            ORDER BY DATEDIFF(day,s.FechaFin,s.FechaFinReal) DESC,s.SiembraId DESC;
            """;
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, db) { CommandTimeout = 15 };
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.Add("@Campania", SqlDbType.NVarChar, 9).Value = (object?)campania ?? DBNull.Value;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var periodo = await reader.ReadAsync(ct) && !reader.IsDBNull(0) ? reader.GetString(0) : null;
        await reader.NextResultAsync(ct);
        var resumen = (await LeerFilasAsync(reader, ct)).FirstOrDefault();
        await reader.NextResultAsync(ct);
        var operaciones = await LeerFilasAsync(reader, ct);
        return new DesviosSiembraDatos(periodo, resumen, operaciones);
    }

    public async Task<ProductividadFertilizacionDatos> ConsultarProductividadFertilizacionAsync(
        int empresaId, string? campania, CancellationToken ct)
    {
        const string sql = """
            DECLARE @Periodo nvarchar(9) = COALESCE(@Campania,
                (SELECT TOP (1) c.Periodo FROM dbo.Campanias c
                 WHERE c.EmpresaId=@EmpresaId ORDER BY c.FechaInicio DESC,c.CampaniaId DESC));
            SELECT @Periodo AS periodo;

            SELECT x.lote,x.operacion,x.hectareas,x.haHora INTO #Operaciones FROM (
                SELECT l.Nombre AS lote,N'Siembra y resiembra' AS operacion,s.CantidadHectareasTrabajadas AS hectareas,
                    s.HectareasHora AS haHora
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Periodo
                  AND s.EstadoSiembra=N'Finalizado' AND s.CantidadHectareasTrabajadas>0 AND s.HectareasHora>0
                UNION ALL
                SELECT l.Nombre,N'Cosecha',c.CantidadHectareasTrabajadas,c.HectareasHora
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND LEFT(LTRIM(c.CampaniaNombre),9)=@Periodo AND c.Estado=N'Finalizado'
                  AND c.CantidadHectareasTrabajadas>0 AND c.HectareasHora>0
            ) x;
            SELECT operacion,COUNT(*) AS operacionesFinalizadasConProductividad,
                SUM(hectareas) AS hectareas,CAST(SUM(hectareas/haHora) AS decimal(18,2)) AS horasEstimadas,
                CAST(SUM(hectareas)/NULLIF(SUM(hectareas/haHora),0) AS decimal(18,2)) AS productividadHaHora
            FROM #Operaciones GROUP BY operacion;
            SELECT TOP (100) lote,operacion,COUNT(*) AS operaciones,
                SUM(hectareas) AS hectareas,
                CAST(SUM(hectareas/haHora) AS decimal(18,2)) AS horasEstimadas,
                CAST(SUM(hectareas)/NULLIF(SUM(hectareas/haHora),0) AS decimal(18,2)) AS productividadHaHora
            FROM #Operaciones GROUP BY lote,operacion ORDER BY lote,operacion;

            SELECT TOP (100) l.Nombre AS lote,COUNT(*) AS aplicaciones,
                SUM(ss.HectareasSembradas) AS hectareasIntervenidas,
                CAST(SUM(ss.HectareasSembradas/NULLIF(ss.HectareasHora,0)) AS decimal(18,2)) AS horasEstimadas,
                CAST(SUM(ss.HectareasSembradas)/NULLIF(SUM(ss.HectareasSembradas/NULLIF(ss.HectareasHora,0)),0)
                     AS decimal(18,2)) AS productividadHaHora,
                CAST(SUM(ss.UreaTotalKg)/NULLIF(SUM(ss.HectareasSembradas),0)
                     AS decimal(18,2)) AS dosisPromedioUreaKgHa,
                SUM(ss.UreaTotalKg) AS ureaRefertilizacionKg
            FROM dbo.SiembraSeguimientos ss
            JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
            JOIN dbo.Lotes l ON l.LoteId=s.LoteId
            WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Periodo
              AND ss.TipoRegistro=N'Refertilizacion'
            GROUP BY l.Nombre ORDER BY l.Nombre;

            SELECT l.Nombre AS lote,
                CAST(SUM(CASE WHEN f.origen=N'Siembra' THEN f.kg ELSE 0 END) AS decimal(18,2)) AS ureaSiembraKg,
                CAST(SUM(CASE WHEN f.origen=N'Refertilización' THEN f.kg ELSE 0 END) AS decimal(18,2)) AS ureaRefertilizacionKg,
                CAST(SUM(f.kg) AS decimal(18,2)) AS ureaTotalKg,
                CAST(SUM(CASE WHEN f.origen=N'Siembra' THEN f.kg ELSE 0 END)
                     /NULLIF(SUM(CASE WHEN f.origen=N'Siembra' THEN f.hectareas ELSE 0 END),0)
                     AS decimal(18,2)) AS dosisSiembraKgHa,
                CAST(SUM(CASE WHEN f.origen=N'Refertilización' THEN f.kg ELSE 0 END)
                     /NULLIF(SUM(CASE WHEN f.origen=N'Refertilización' THEN f.hectareas ELSE 0 END),0)
                     AS decimal(18,2)) AS dosisRefertilizacionKgHa
            INTO #FertilizantePorLote
            FROM (
                SELECT s.LoteId,N'Siembra' AS origen,s.UreaKgHa*s.CantidadHectareasTrabajadas AS kg,
                    s.CantidadHectareasTrabajadas AS hectareas
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Periodo
                  AND s.UreaKgHa IS NOT NULL
                UNION ALL
                SELECT s.LoteId,N'Refertilización',ss.UreaTotalKg,ss.HectareasSembradas
                FROM dbo.SiembraSeguimientos ss JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
                JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Periodo
                  AND ss.TipoRegistro=N'Refertilizacion' AND ss.UreaTotalKg IS NOT NULL
            ) f JOIN dbo.Lotes l ON l.LoteId=f.LoteId
            GROUP BY l.Nombre;
            SELECT TOP (100) base.lote,
                COALESCE(f.ureaSiembraKg,0) AS ureaSiembraKg,
                COALESCE(f.ureaRefertilizacionKg,0) AS ureaRefertilizacionKg,
                COALESCE(f.ureaTotalKg,0) AS ureaTotalKg,
                f.dosisSiembraKgHa,f.dosisRefertilizacionKgHa,
                CASE WHEN f.lote IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS tieneRegistroFertilizante
            FROM (
                SELECT DISTINCT l.Nombre AS lote
                FROM dbo.CampaniaCombinaciones cc
                JOIN dbo.Campanias c ON c.CampaniaId=cc.CampaniaId
                JOIN dbo.Lotes l ON l.LoteId=cc.LoteId
                WHERE c.EmpresaId=@EmpresaId AND l.EmpresaId=@EmpresaId AND c.Periodo=@Periodo
                UNION
                SELECT lote FROM #FertilizantePorLote
            ) base LEFT JOIN #FertilizantePorLote f ON f.lote=base.lote
            ORDER BY base.lote;
            SELECT COUNT(*) AS lotesConFertilizante,
                SUM(ureaSiembraKg) AS ureaSiembraKg,
                SUM(ureaRefertilizacionKg) AS ureaRefertilizacionKg,
                SUM(ureaTotalKg) AS ureaTotalKg
            FROM #FertilizantePorLote;
            """;
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, db) { CommandTimeout = 20 };
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.Add("@Campania", SqlDbType.NVarChar, 9).Value = (object?)campania ?? DBNull.Value;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var periodo = await reader.ReadAsync(ct) && !reader.IsDBNull(0) ? reader.GetString(0) : null;
        await reader.NextResultAsync(ct);
        var operaciones = await LeerFilasAsync(reader, ct);
        await reader.NextResultAsync(ct);
        var productividadPorLote = await LeerFilasAsync(reader, ct);
        await reader.NextResultAsync(ct);
        var refertilizacion = await LeerFilasAsync(reader, ct);
        await reader.NextResultAsync(ct);
        var porLote = await LeerFilasAsync(reader, ct);
        await reader.NextResultAsync(ct);
        var totales = (await LeerFilasAsync(reader, ct)).FirstOrDefault();
        return new ProductividadFertilizacionDatos(periodo, operaciones, productividadPorLote, refertilizacion, porLote, totales);
    }

    // Indicadores operativos con las mismas bases que las tarjetas de cada listado.
    // La campaña y el ciclo son filtros explícitos; no se mezclan con los promedios ponderados de Estadísticas.
    public async Task<KpisPantallaDatos> ConsultarKpisPantallaAsync(int empresaId, string modulo,
        string? campania, string? ciclo, CancellationToken ct)
    {
        if (modulo is not ("lotes" or "campanias" or "siembras" or "cosechas"))
            throw new ArgumentException("Módulo de KPI no permitido.", nameof(modulo));
        if (ciclo is not null && ciclo is not ("Verano" or "Invierno"))
            throw new ArgumentException("Ciclo no permitido.", nameof(ciclo));
        if (modulo is "siembras" or "cosechas") ciclo ??= "Verano";

        var sql = modulo switch
        {
            "lotes" => """
                SELECT N'habilitados' AS filtroEstado,COUNT(*) AS totalLotes,
                    COALESCE(SUM(Hectareas),0) AS hectareasTotales,
                    COALESCE(SUM(CASE WHEN Condicion=N'Propio' THEN Hectareas ELSE 0 END),0) AS hectareasPropias,
                    COALESCE(SUM(CASE WHEN Condicion=N'Alquilado' THEN Hectareas ELSE 0 END),0) AS hectareasAlquiladas
                FROM dbo.Lotes WHERE EmpresaId=@EmpresaId AND Activo=1;
                SELECT N'deshabilitados' AS filtroEstado,COUNT(*) AS totalLotes,
                    COALESCE(SUM(Hectareas),0) AS hectareasTotales,
                    COALESCE(SUM(CASE WHEN Condicion=N'Propio' THEN Hectareas ELSE 0 END),0) AS hectareasPropias,
                    COALESCE(SUM(CASE WHEN Condicion=N'Alquilado' THEN Hectareas ELSE 0 END),0) AS hectareasAlquiladas
                FROM dbo.Lotes WHERE EmpresaId=@EmpresaId AND Activo=0;
                """,
            "campanias" => """
                SELECT COUNT(DISTINCT c.CampaniaId) AS campanias,
                    COUNT(cc.CampaniaCombinacionId) AS combinaciones,
                    COALESCE(SUM(CASE WHEN cc.Estado=N'Pendiente' THEN 1 ELSE 0 END),0) AS pendientes,
                    COALESCE(SUM(l.Hectareas),0) AS hectareasPlanificadas
                FROM dbo.Campanias c
                LEFT JOIN dbo.CampaniaCombinaciones cc ON cc.CampaniaId=c.CampaniaId
                LEFT JOIN dbo.Lotes l ON l.LoteId=cc.LoteId AND l.EmpresaId=@EmpresaId
                WHERE c.EmpresaId=@EmpresaId AND (@Campania IS NULL OR c.Periodo=@Campania);
                """,
            "siembras" => """
                ;WITH planes AS (
                    SELECT cc.LoteId,l.Hectareas AS hectareas
                    FROM dbo.CampaniaCombinaciones cc
                    JOIN dbo.Campanias c ON c.CampaniaId=cc.CampaniaId
                    JOIN dbo.Lotes l ON l.LoteId=cc.LoteId
                    WHERE c.EmpresaId=@EmpresaId AND l.EmpresaId=@EmpresaId
                      AND c.Periodo=@Campania AND cc.CicloEstacional=@Ciclo
                ), porLote AS (
                    SELECT p.LoteId,p.hectareas,COALESCE(MAX(s.CantidadHectareasTrabajadas),0) AS sembradas
                    FROM planes p LEFT JOIN dbo.Siembras s ON s.LoteId=p.LoteId
                      AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania AND s.CicloEstacional=@Ciclo
                    GROUP BY p.LoteId,p.hectareas
                )
                SELECT COALESCE(SUM(hectareas),0) AS hectareasPlanificadas,
                    COALESCE(SUM(CASE WHEN sembradas>hectareas THEN hectareas ELSE sembradas END),0) AS hectareasSembradas
                FROM porLote;
                SELECT COUNT(*) AS operacionesFinalizadasConProductividad,
                    AVG(CAST(s.HectareasHora AS decimal(18,4))) AS productividadPromedioHaHora
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.CicloEstacional=@Ciclo AND s.EstadoSiembra=N'Finalizado' AND s.HectareasHora>0;
                SELECT s.Producto AS cultivo,
                    SUM(COALESCE(s.DensidadSiembra,0)*COALESCE(s.Pmg,0)*COALESCE(s.CantidadHectareasTrabajadas,0)/1000000.0) AS semillaKg,
                    SUM(COALESCE(s.CantidadHectareasTrabajadas,0)) AS hectareasRegistradas,
                    SUM(COALESCE(s.UreaKgHa,0)*COALESCE(s.CantidadHectareasTrabajadas,0)) AS ureaSiembraKg,
                    SUM(COALESCE(r.ureaKg,0)) AS ureaRefertilizacionKg
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                OUTER APPLY (SELECT SUM(ss.UreaTotalKg) AS ureaKg FROM dbo.SiembraSeguimientos ss
                             WHERE ss.SiembraId=s.SiembraId AND ss.TipoRegistro=N'Refertilizacion') r
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.CicloEstacional=@Ciclo
                GROUP BY s.Producto ORDER BY s.Producto;
                SELECT SUM(COALESCE(s.UreaKgHa,0)*COALESCE(s.CantidadHectareasTrabajadas,0)) AS ureaSiembraKg,
                    SUM(COALESCE(r.ureaKg,0)) AS ureaRefertilizacionKg
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                OUTER APPLY (SELECT SUM(ss.UreaTotalKg) AS ureaKg FROM dbo.SiembraSeguimientos ss
                             WHERE ss.SiembraId=s.SiembraId AND ss.TipoRegistro=N'Refertilizacion') r
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.CicloEstacional=@Ciclo;
                """,
            _ => """
                ;WITH aptas AS (
                    SELECT s.SiembraId,COALESCE(s.CantidadHectareasTrabajadas,l.Hectareas) AS hectareasSembradas
                    FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND l.Activo=1
                      AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania AND s.CicloEstacional=@Ciclo
                      AND s.EstadoSiembra=N'Finalizado' AND s.Estado=N'Finalizado'
                      AND s.DeshabilitacionId IS NULL AND s.FechaFinReal IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM dbo.Siembras posterior
                          WHERE posterior.LoteId=s.LoteId AND posterior.CampaniaNombre=s.CampaniaNombre
                            AND posterior.CicloEstacional=s.CicloEstacional AND posterior.DeshabilitacionId IS NULL
                            AND posterior.SiembraId>s.SiembraId)
                      AND l.EstadoCultivo=N'Cultivado'
                      AND NOT EXISTS (SELECT 1 FROM dbo.Cosechas c WHERE c.SiembraId=s.SiembraId)
                ), superficies AS (
                    SELECT hectareasSembradas,CAST(0 AS decimal(18,4)) AS hectareasCosechadas FROM aptas
                    UNION ALL
                    SELECT COALESCE(s.CantidadHectareasTrabajadas,l.Hectareas),
                        CASE WHEN c.Estado=N'Finalizado' THEN COALESCE(c.CantidadHectareasTrabajadas,av.HectareasCosechadas,0)
                             ELSE COALESCE(av.HectareasCosechadas,0) END
                    FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                    LEFT JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                    LEFT JOIN dbo.vw_CosechasAvance av ON av.CosechaId=c.CosechaId
                    WHERE l.EmpresaId=@EmpresaId AND l.Activo=1
                      AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                      AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                      AND COALESCE(s.CicloEstacional,N'Verano')=@Ciclo
                )
                SELECT COALESCE(SUM(hectareasSembradas),0) AS hectareasAptas,
                    COALESCE(SUM(hectareasCosechadas),0) AS hectareasCosechadas
                FROM superficies;
                SELECT COUNT(*) AS cosechasFinalizadasConProductividad,
                    AVG(CAST(c.HectareasHora AS decimal(18,4))) AS productividadPromedioHaHora
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                LEFT JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND COALESCE(s.CicloEstacional,N'Verano')=@Ciclo
                  AND c.Estado=N'Finalizado' AND c.HectareasHora>0;
                SELECT c.Producto AS cultivo,
                    SUM(c.CantidadGranoCosechado) AS kgCosechados,
                    SUM(c.CantidadHectareasTrabajadas) AS hectareasCosechadas,
                    SUM(c.CantidadGranoCosechado)/NULLIF(SUM(c.CantidadHectareasTrabajadas),0) AS rindePromedioKgHa
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                LEFT JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND COALESCE(s.CicloEstacional,N'Verano')=@Ciclo AND c.Estado=N'Finalizado'
                  AND c.CantidadGranoCosechado>0 AND c.CantidadHectareasTrabajadas>0
                GROUP BY c.Producto ORDER BY c.Producto;
                SELECT COUNT(*) AS tiradas,
                    AVG(t.PerdidaTotalKgHa) AS perdidaPromedioKgHa
                FROM dbo.CosechaTiradaAros t JOIN dbo.Cosechas c ON c.CosechaId=t.CosechaId
                JOIN dbo.Lotes l ON l.LoteId=c.LoteId LEFT JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND COALESCE(s.CicloEstacional,N'Verano')=@Ciclo;
                """
        };
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        if (modulo != "lotes" && campania is null && modulo != "campanias")
        {
            await using var latest = new SqlCommand("SELECT TOP (1) Periodo FROM dbo.Campanias WHERE EmpresaId=@EmpresaId ORDER BY Periodo DESC", db);
            latest.Parameters.AddWithValue("@EmpresaId", empresaId);
            campania = await latest.ExecuteScalarAsync(ct) as string;
        }
        if (modulo is "siembras" or "cosechas" && campania is null)
            return new KpisPantallaDatos(modulo, null, ciclo, []);
        await using var cmd = new SqlCommand(sql, db) { CommandTimeout = 20 };
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        cmd.Parameters.Add("@Campania", SqlDbType.NVarChar, 9).Value = (object?)campania ?? DBNull.Value;
        cmd.Parameters.Add("@Ciclo", SqlDbType.NVarChar, 10).Value = (object?)ciclo ?? DBNull.Value;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var indicadores = new List<object>();
        do { indicadores.AddRange(await LeerFilasAsync(reader, ct)); }
        while (await reader.NextResultAsync(ct));
        return new KpisPantallaDatos(modulo, campania, ciclo, indicadores);
    }

    private static string SqlConsulta(string consulta)
    {
        return consulta switch
        {
            "lote_ficha" => """
                SELECT TOP (1) l.Nombre AS lote,l.Hectareas AS hectareasCultivables,
                    CAST(l.SuperficieTotal / 10000.0 AS decimal(18,2)) AS hectareasReales,
                    l.SuperficieTotal AS superficieTotalM2,l.Ciudad AS zona,l.Provincia AS provincia,
                    l.Condicion AS condicion,l.Activo AS habilitado,l.CultivoActual AS cultivoActual,
                    l.EstadoCultivo AS estadoCultivo,l.CultivoAnterior AS cultivoAnteriorLote,
                    l.CultivoAnteriorCampania AS campaniaCultivoAnteriorLote,
                    antecedente.ProductoAntecesor AS antecesorRegistradoEnSiembra,
                    antecedente.campania AS campaniaAntecesorRegistrado
                FROM dbo.Lotes l
                OUTER APPLY (
                    SELECT TOP (1) s.ProductoAntecesor,LEFT(LTRIM(s.CampaniaNombre),9) AS campania
                    FROM dbo.Siembras s WHERE s.LoteId=l.LoteId AND s.TipoRegistro=N'Siembra'
                      AND (@Campania IS NULL OR LEFT(LTRIM(s.CampaniaNombre),9)=@Campania)
                    ORDER BY s.FechaInicio DESC,s.SiembraId DESC
                ) antecedente
                WHERE l.EmpresaId=@EmpresaId
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI;
                """,
            "antecesor_lote" => """
                WITH antecedentes AS (
                SELECT l.Nombre AS lote,c.Periodo AS campania,
                    cc.CicloEstacional AS ciclo,cc.Producto AS cultivoPlanificado,
                    s.Producto AS cultivoSembrado,
                    COALESCE(NULLIF(NULLIF(s.ProductoAntecesor,N''),N'Sin dato'),previo.Producto) AS cultivoAntecesor,
                    CASE WHEN NULLIF(NULLIF(s.ProductoAntecesor,N''),N'Sin dato') IS NOT NULL THEN N'Registrado en siembra'
                         WHEN previo.Producto IS NOT NULL THEN N'Última cosecha finalizada anterior'
                         ELSE NULL END AS fuenteAntecesor,
                    previo.FechaFinReal AS fechaCosechaAntecesora
                FROM dbo.CampaniaCombinaciones cc
                JOIN dbo.Campanias c ON c.CampaniaId=cc.CampaniaId
                JOIN dbo.Lotes l ON l.LoteId=cc.LoteId
                OUTER APPLY (
                    SELECT TOP (1) si.Producto,si.ProductoAntecesor,si.FechaInicio
                    FROM dbo.Siembras si WHERE si.LoteId=l.LoteId AND si.TipoRegistro=N'Siembra'
                      AND si.CicloEstacional=cc.CicloEstacional
                      AND LEFT(LTRIM(si.CampaniaNombre),9)=c.Periodo
                    ORDER BY si.FechaInicio DESC,si.SiembraId DESC
                ) s
                OUTER APPLY (
                    SELECT TOP (1) co.Producto,co.FechaFinReal
                    FROM dbo.Cosechas co
                    WHERE co.LoteId=l.LoteId AND co.Estado=N'Finalizado'
                      AND co.FechaFinReal<=COALESCE(s.FechaInicio,cc.FechaInicio)
                    ORDER BY co.FechaFinReal DESC,co.CosechaId DESC
                ) previo
                WHERE l.EmpresaId=@EmpresaId AND c.EmpresaId=@EmpresaId
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR c.Periodo=@Campania)
                UNION ALL
                SELECT l.Nombre,l.CultivoAnteriorCampania,NULL,NULL,NULL,l.CultivoAnterior,
                    N'Historial de cultivos de la ficha del lote',NULL
                FROM dbo.Lotes l
                WHERE l.EmpresaId=@EmpresaId
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND NULLIF(LTRIM(RTRIM(l.CultivoAnterior)),N'') IS NOT NULL
                  AND NULLIF(LTRIM(RTRIM(l.CultivoAnteriorCampania)),N'') IS NOT NULL
                  AND l.CultivoAnterior<>N'Sin dato' AND l.CultivoAnteriorCampania<>N'Sin dato'
                  AND (@Campania IS NULL OR l.CultivoAnteriorCampania=@Campania)
                )
                SELECT TOP (20) lote,campania,ciclo,cultivoPlanificado,cultivoSembrado,
                    cultivoAntecesor,fuenteAntecesor,fechaCosechaAntecesora
                FROM antecedentes ORDER BY campania DESC,ciclo DESC;
                """,
            "lote_bajas" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,b.Motivo AS motivo,b.Detalle AS detalle,
                    b.Siniestro AS siniestro,b.FechaSiniestro AS fechaSiniestro,
                    b.FechaCreacion AS fechaRegistro,b.AfectoLote AS afectoLote,
                    s.Nombre AS siembraVinculada,LEFT(LTRIM(s.CampaniaNombre),9) AS campania
                FROM dbo.LoteDeshabilitaciones b JOIN dbo.Lotes l ON l.LoteId=b.LoteId
                LEFT JOIN dbo.Siembras s ON s.SiembraId=b.SiembraId
                WHERE l.EmpresaId=@EmpresaId
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                       OR EXISTS (SELECT 1 FROM dbo.Campanias c
                                  WHERE c.CampaniaId=b.CampaniaId AND c.EmpresaId=@EmpresaId AND c.Periodo=@Campania))
                ORDER BY b.FechaCreacion DESC,b.LoteDeshabilitacionId DESC;
                """,
            "siembras_detalle" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,LEFT(LTRIM(s.CampaniaNombre),9) AS campania,
                    s.Nombre AS siembra,s.TipoRegistro AS tipoRegistro,s.CicloEstacional AS ciclo,
                    s.Producto AS cultivo,s.ProductoAntecesor AS cultivoAntecesor,
                    s.VariedadSemilla AS variedad,s.TipoImplantacion AS epoca,
                    s.CicloCultivo AS cicloCultivo,s.DensidadSiembra AS semillasPorHa,
                    s.PMG AS pmgGramos,s.Profundidad AS profundidadCm,
                    s.CantidadHectareasTrabajadas AS hectareasSembradas,
                    s.CantidadSemillas AS semillasTotalesUnidades,
                    CAST(s.DensidadSiembra*s.PMG*s.CantidadHectareasTrabajadas/1000000.0 AS decimal(18,4)) AS semillaTotalKg,
                    s.UreaKgHa AS ureaKgHa,
                    CAST(s.UreaKgHa*s.CantidadHectareasTrabajadas AS decimal(18,4)) AS ureaTotalKg,
                    s.ResponsableACargo AS responsable,s.FechaInicio AS inicio,
                    s.FechaFin AS finTentativo,s.FechaFinReal AS finReal,
                    s.EstadoSiembra AS estadoSiembra,s.DeshabilitacionId AS bajaId
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(s.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY s.FechaInicio DESC,s.SiembraId DESC;
                """,
            "refertilizaciones_detalle" => """
                SELECT TOP (40) COUNT(*) OVER() AS totalAplicaciones,
                    SUM(ss.UreaTotalKg) OVER() AS ureaTotalKgFiltrada,
                    CAST(SUM(ss.UreaTotalKg) OVER()/NULLIF(SUM(ss.HectareasSembradas) OVER(),0)
                         AS decimal(18,4)) AS dosisPromedioPonderadaKgHa,
                    l.Nombre AS lote,LEFT(LTRIM(s.CampaniaNombre),9) AS campania,
                    s.Nombre AS siembra,s.Producto AS cultivo,CONVERT(date,ss.Fecha) AS fecha,
                    ss.HectareasSembradas AS hectareasBase,ss.HectareasHora AS hectareasHora,
                    ss.HorasTrabajadas AS horasTrabajadas,ss.UreaKgHa AS ureaKgHa,
                    ss.UreaTotalKg AS ureaTotalKg
                FROM dbo.SiembraSeguimientos ss
                JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
                JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND ss.TipoRegistro=N'Refertilizacion'
                  AND (@Lote IS NULL OR l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                  AND (@Campania IS NULL OR LEFT(LTRIM(s.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY ss.Fecha DESC,ss.SiembraSeguimientoId DESC;
                """,
            "cosechas_detalle" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,LEFT(LTRIM(c.CampaniaNombre),9) AS campania,
                    c.Nombre AS cosecha,c.Producto AS cultivo,c.Estado AS estado,
                    c.FechaInicio AS inicio,c.FechaFin AS finTentativo,c.FechaFinReal AS finReal,
                    c.CantidadHectareasTrabajadas AS hectareasCosechadas,
                    c.CantidadGranoCosechado AS kgCosechados,c.RindeKgHa AS rindeKgHa,
                    c.RindeSecoKgHa AS rindeSecoKgHa,c.ResponsableACargo AS responsable,
                    c.TipoServicio AS tipoServicio,c.Contratista AS contratista,
                    c.Cosechadora AS cosechadora,c.AnchoCabezalM AS anchoCabezalM
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(c.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY c.FechaInicio DESC,c.CosechaId DESC;
                """,
            "agroquimicos_detalle" => """
                SELECT TOP (40) COUNT(*) OVER() AS totalCoincidencias,
                    x.lote,x.campania,x.siembra,x.cultivo,x.etapa,x.fecha,
                    x.marca,x.tipo,x.variedad,x.dosisPorHa,x.unidadBase
                FROM (
                    SELECT l.Nombre AS lote,LEFT(LTRIM(s.CampaniaNombre),9) AS campania,
                        s.Nombre AS siembra,s.Producto AS cultivo,N'Presiembra' AS etapa,
                        i.FechaAplicacion AS fecha,i.Marca AS marca,i.Tipo AS tipo,
                        i.Variedad AS variedad,i.CantidadAplicada AS dosisPorHa,i.UnidadMedida AS unidadBase
                    FROM dbo.SiembraInsumos i JOIN dbo.Siembras s ON s.SiembraId=i.SiembraId
                    JOIN dbo.Lotes l ON l.LoteId=s.LoteId WHERE l.EmpresaId=@EmpresaId
                    UNION ALL
                    SELECT l.Nombre,LEFT(LTRIM(s.CampaniaNombre),9),s.Nombre,s.Producto,
                        N'Seguimiento',i.FechaAplicacion,i.Marca,i.Tipo,i.Variedad,
                        i.CantidadAplicada,i.UnidadMedida
                    FROM dbo.SeguimientoInsumos i
                    JOIN dbo.SiembraSeguimientos ss ON ss.SiembraSeguimientoId=i.SiembraSeguimientoId
                    JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
                    JOIN dbo.Lotes l ON l.LoteId=s.LoteId WHERE l.EmpresaId=@EmpresaId
                ) x
                WHERE (@Lote IS NULL OR x.lote COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                  AND (@Campania IS NULL OR x.campania=@Campania)
                  AND (@Cultivo IS NULL OR x.cultivo COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY x.fecha DESC,x.lote,x.siembra;
                """,
            "tiradas_detalle" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,LEFT(LTRIM(c.CampaniaNombre),9) AS campania,
                    c.Nombre AS cosecha,c.Producto AS cultivo,t.Fecha AS fecha,
                    t.PerdidaCabezalKgHa AS perdidaCabezalKgHa,
                    t.PerdidaColaKgHa AS perdidaColaKgHa,
                    t.PerdidaTotalKgHa AS perdidaTotalKgHa,t.Severidad AS severidad,
                    t.AjustoMaquinaria AS ajustoMaquinaria
                FROM dbo.CosechaTiradaAros t JOIN dbo.Cosechas c ON c.CosechaId=t.CosechaId
                JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(c.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY t.Fecha DESC,t.CosechaTiradaAroId DESC;
                """,
            "almacenamientos_lote" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,LEFT(LTRIM(c.CampaniaNombre),9) AS campania,
                    c.Nombre AS cosecha,si.Nombre AS silo,a.Fecha AS fechaIngreso,
                    a.Producto AS cultivo,a.Cantidad AS kgIngresados
                FROM dbo.Almacenamientos a JOIN dbo.Cosechas c ON c.CosechaId=a.CosechaId
                JOIN dbo.Lotes l ON l.LoteId=c.LoteId JOIN dbo.Silos si ON si.SiloId=a.SiloId
                WHERE l.EmpresaId=@EmpresaId AND si.EmpresaId=@EmpresaId
                  AND (a.EmpresaId=@EmpresaId OR a.EmpresaId IS NULL)
                  AND a.TipoMovimiento=N'Ingreso'
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(c.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY a.Fecha DESC,a.AlmacenamientoId DESC;
                """,
            "partidas_lote" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,LEFT(LTRIM(c.CampaniaNombre),9) AS campania,
                    c.Producto AS cultivo,si.Nombre AS silo,
                    SUM(p.KgRestantes) AS kgActualesEnSilo,
                    MIN(p.FechaIngreso) AS ingresoMasAntiguo
                FROM dbo.AlmacenamientoPartidas p JOIN dbo.Cosechas c ON c.CosechaId=p.CosechaId
                JOIN dbo.Lotes l ON l.LoteId=c.LoteId JOIN dbo.Silos si ON si.SiloId=p.SiloId
                WHERE l.EmpresaId=@EmpresaId AND si.EmpresaId=@EmpresaId
                  AND (p.EmpresaId=@EmpresaId OR p.EmpresaId IS NULL) AND p.KgRestantes>0
                  AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(c.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY l.Nombre,LEFT(LTRIM(c.CampaniaNombre),9),c.Producto,si.Nombre
                ORDER BY kgActualesEnSilo DESC;
                """,
            "distribuciones_detalle" => """
                SELECT TOP (40) COUNT(*) OVER() AS totalCoincidencias,
                    x.lote,x.campaniaCultivo,x.campaniaDistribucion,x.cultivo,x.origen,x.fechaSalida,
                    x.destino,x.estado,x.kgDespachadosAtribuibles,
                    x.kgRecibidosAtribuibles,x.diferenciaBalanzaKgAtribuible,
                    x.mermaTotalKgAtribuible
                FROM (
                    SELECT l.Nombre AS lote,LEFT(LTRIM(c.CampaniaNombre),9) AS campaniaCultivo,
                        ca.Periodo AS campaniaDistribucion,
                        d.Producto AS cultivo,N'Cosecha directa' AS origen,d.FechaSalida AS fechaSalida,
                        de.Nombre AS destino,dc.Estado AS estado,dc.KgDespachados AS kgDespachadosAtribuibles,
                        dc.KgRecibidos AS kgRecibidosAtribuibles,
                        dc.DiferenciaBalanzaKg AS diferenciaBalanzaKgAtribuible,
                        dc.MermaTotalKg AS mermaTotalKgAtribuible
                    FROM dbo.DistribucionCamiones dc JOIN dbo.Distribuciones d ON d.DistribucionId=dc.DistribucionId
                    JOIN dbo.Cosechas c ON c.CosechaId=d.CosechaId JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                    LEFT JOIN dbo.Campanias ca ON ca.CampaniaId=d.CampaniaId AND ca.EmpresaId=@EmpresaId
                    JOIN dbo.DestinosDistribucion de ON de.DestinoId=dc.DestinoId AND de.EmpresaId=@EmpresaId
                    WHERE d.EmpresaId=@EmpresaId AND dc.EmpresaId=@EmpresaId
                      AND d.OrigenGrano=N'Cosecha' AND l.EmpresaId=@EmpresaId
                    UNION ALL
                    SELECT l.Nombre,LEFT(LTRIM(c.CampaniaNombre),9),ca.Periodo,
                        d.Producto,N'Partida de silo',
                        d.FechaSalida,de.Nombre,dc.Estado,pc.Kg,NULL,NULL,NULL
                    FROM dbo.DistribucionCamiones dc JOIN dbo.Distribuciones d ON d.DistribucionId=dc.DistribucionId
                    JOIN dbo.AlmacenamientoPartidaConsumos pc ON pc.AlmacenamientoId=dc.AlmacenamientoEgresoId
                    JOIN dbo.AlmacenamientoPartidas p ON p.PartidaId=pc.PartidaId
                    JOIN dbo.Cosechas c ON c.CosechaId=p.CosechaId JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                    LEFT JOIN dbo.Campanias ca ON ca.CampaniaId=d.CampaniaId AND ca.EmpresaId=@EmpresaId
                    JOIN dbo.DestinosDistribucion de ON de.DestinoId=dc.DestinoId AND de.EmpresaId=@EmpresaId
                    WHERE d.EmpresaId=@EmpresaId AND dc.EmpresaId=@EmpresaId
                      AND d.OrigenGrano=N'Silo' AND l.EmpresaId=@EmpresaId
                    UNION ALL
                    SELECT NULL,NULL,ca.Periodo,d.Producto,N'Silo sin lote trazado',
                        d.FechaSalida,de.Nombre,dc.Estado,dc.KgDespachados,NULL,NULL,NULL
                    FROM dbo.DistribucionCamiones dc JOIN dbo.Distribuciones d ON d.DistribucionId=dc.DistribucionId
                    LEFT JOIN dbo.Campanias ca ON ca.CampaniaId=d.CampaniaId AND ca.EmpresaId=@EmpresaId
                    JOIN dbo.DestinosDistribucion de ON de.DestinoId=dc.DestinoId AND de.EmpresaId=@EmpresaId
                    WHERE d.EmpresaId=@EmpresaId AND dc.EmpresaId=@EmpresaId AND d.OrigenGrano=N'Silo'
                      AND NOT EXISTS (SELECT 1 FROM dbo.AlmacenamientoPartidaConsumos pc
                                      JOIN dbo.AlmacenamientoPartidas p ON p.PartidaId=pc.PartidaId
                                      WHERE pc.AlmacenamientoId=dc.AlmacenamientoEgresoId AND p.CosechaId IS NOT NULL)
                ) x
                WHERE (@Lote IS NULL OR x.lote COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                  AND (@Campania IS NULL OR x.campaniaDistribucion=@Campania)
                  AND (@Cultivo IS NULL OR x.cultivo COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY x.fechaSalida DESC,x.destino;
                """,
            "contexto" => """
                SELECT x.tipo,x.nombre FROM (
                    SELECT N'campaña' AS tipo,c.Periodo AS nombre,0 AS grupo,
                        ROW_NUMBER() OVER (ORDER BY c.FechaInicio DESC,c.CampaniaId DESC) AS fila
                    FROM dbo.Campanias c WHERE c.EmpresaId=@EmpresaId
                    UNION ALL
                    SELECT N'lote',l.Nombre,1,
                        ROW_NUMBER() OVER (ORDER BY l.Nombre,l.LoteId)
                    FROM dbo.Lotes l WHERE l.EmpresaId=@EmpresaId
                ) x WHERE x.fila<=CASE WHEN x.grupo=0 THEN 12 ELSE 25 END
                ORDER BY x.grupo,x.fila;
                """,
            "siembras_resumen" => """
                SELECT TOP (20) s.Producto AS cultivo,s.CicloEstacional AS ciclo,
                    COUNT(*) AS siembrasOriginales,SUM(s.CantidadHectareasTrabajadas) AS hectareasSembradas
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.TipoRegistro=N'Siembra'
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY s.Producto,s.CicloEstacional ORDER BY hectareasSembradas DESC;
                """,
            "resumen_campania" => """
                SELECT TOP (20) c.Producto AS cultivo, COUNT(*) AS cosechas,
                    SUM(c.CantidadHectareasTrabajadas) AS hectareas,
                    SUM(c.CantidadGranoCosechado) AS kg,
                    CASE WHEN SUM(c.CantidadHectareasTrabajadas)>0
                         THEN SUM(c.CantidadGranoCosechado)/SUM(c.CantidadHectareasTrabajadas) END AS rindeKgHa
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND c.Estado=N'Finalizado' AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY c.Producto ORDER BY kg DESC;
                """,
            "rindes_lote" => """
                SELECT TOP (16) l.Nombre AS lote, LEFT(LTRIM(c.CampaniaNombre),9) AS campania,
                    s.CicloEstacional AS ciclo, c.Producto AS cultivo, s.TipoImplantacion AS epoca,
                    c.CantidadHectareasTrabajadas AS hectareas, c.CantidadGranoCosechado AS kg,
                    c.RindeKgHa AS rindeKgHa, c.RindeSecoKgHa AS rindeSecoKgHa,
                    c.FechaFinReal AS fechaCierre
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                LEFT JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND c.Estado=N'Finalizado' AND l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI
                  AND (@Campania IS NULL OR LEFT(LTRIM(c.CampaniaNombre),9)=@Campania)
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY c.FechaFinReal DESC, c.CosechaId DESC;
                """,
            "mejores_rindes" or "peores_rindes" => """
                SELECT TOP (10) l.Nombre AS lote, c.Producto AS cultivo,
                    SUM(c.CantidadHectareasTrabajadas) AS hectareas,
                    SUM(c.CantidadGranoCosechado) AS kg,
                    SUM(c.CantidadGranoCosechado)/NULLIF(SUM(c.CantidadHectareasTrabajadas),0) AS rindeKgHa
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND c.Estado=N'Finalizado' AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND c.CantidadHectareasTrabajadas>0
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY l.Nombre,c.Producto
                ORDER BY rindeKgHa __DIRECCION__;
                """.Replace("__DIRECCION__", consulta == "mejores_rindes" ? "DESC" : "ASC"),
            "variedades" => """
                SELECT TOP (20) s.Producto AS cultivo, s.VariedadSemilla AS variedad,
                    COUNT(*) AS siembras, SUM(s.CantidadHectareasTrabajadas) AS hectareas
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.TipoRegistro=N'Siembra' AND s.VariedadSemilla IS NOT NULL
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY s.Producto,s.VariedadSemilla ORDER BY hectareas DESC;
                """,
            "insumos" => """
                SELECT TOP (25) x.lote,x.cultivo,x.origen,x.marca,x.tipo,x.variedad,
                    x.unidad AS unidadBase,COUNT(*) AS aplicaciones,
                    MIN(x.cantidad) AS dosisMinimaPorHa,MAX(x.cantidad) AS dosisMaximaPorHa
                FROM (
                    SELECT l.Nombre AS lote,s.Producto AS cultivo,N'Presiembra' AS origen,
                        i.Marca AS marca,i.Tipo AS tipo,i.Variedad AS variedad,
                        i.UnidadMedida AS unidad,i.CantidadAplicada AS cantidad
                    FROM dbo.SiembraInsumos i JOIN dbo.Siembras s ON s.SiembraId=i.SiembraId
                    JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                    UNION ALL
                    SELECT l.Nombre,s.Producto,N'Seguimiento',i.Marca,i.Tipo,i.Variedad,
                        i.UnidadMedida,i.CantidadAplicada
                    FROM dbo.SeguimientoInsumos i JOIN dbo.SiembraSeguimientos ss ON ss.SiembraSeguimientoId=i.SiembraSeguimientoId
                    JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                ) x
                WHERE (@Lote IS NULL OR x.lote COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                  AND (@Cultivo IS NULL OR x.cultivo COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY x.lote,x.cultivo,x.origen,x.marca,x.tipo,x.variedad,x.unidad
                ORDER BY x.lote,aplicaciones DESC;
                """,
            "insumos_resumen" => """
                SELECT TOP (16) x.cultivo,x.origen,x.tipo,x.unidad AS unidadBase,
                    COUNT(*) AS aplicaciones,MIN(x.cantidad) AS dosisMinimaPorHa,
                    MAX(x.cantidad) AS dosisMaximaPorHa
                FROM (
                    SELECT s.Producto AS cultivo,N'Presiembra' AS origen,
                        i.Tipo AS tipo,i.UnidadMedida AS unidad,i.CantidadAplicada AS cantidad
                    FROM dbo.SiembraInsumos i JOIN dbo.Siembras s ON s.SiembraId=i.SiembraId
                    JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                    UNION ALL
                    SELECT s.Producto,N'Seguimiento',i.Tipo,i.UnidadMedida,i.CantidadAplicada
                    FROM dbo.SeguimientoInsumos i JOIN dbo.SiembraSeguimientos ss ON ss.SiembraSeguimientoId=i.SiembraSeguimientoId
                    JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                ) x
                GROUP BY x.cultivo,x.origen,x.tipo,x.unidad
                ORDER BY aplicaciones DESC,dosisMaximaPorHa DESC;
                """,
            "fertilizacion" => """
                SELECT TOP (20) x.cultivo,x.origen,COUNT(*) AS aplicaciones,
                    SUM(x.kg) AS kgUrea
                FROM (
                    SELECT s.Producto AS cultivo,N'Siembra' AS origen,
                        s.UreaKgHa*s.CantidadHectareasTrabajadas AS kg
                    FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                      AND s.UreaKgHa IS NOT NULL
                      AND (@Lote IS NULL OR l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                    UNION ALL
                    SELECT s.Producto,N'Refertilización',ss.UreaTotalKg
                    FROM dbo.SiembraSeguimientos ss JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
                    JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                    WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                      AND ss.TipoRegistro=N'Refertilizacion' AND ss.UreaTotalKg IS NOT NULL
                      AND (@Lote IS NULL OR l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                ) x WHERE (@Cultivo IS NULL OR x.cultivo COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY x.cultivo,x.origen ORDER BY kgUrea DESC;
                """,
            "siniestros" => """
                SELECT TOP (30) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,s.Producto AS cultivo,s.CicloEstacional AS ciclo,
                    CONVERT(date,ss.Fecha) AS fecha,ss.Siniestro AS siniestro,ss.Alcance AS alcance,
                    ss.EsResiembra AS resiembraAutomatica
                FROM dbo.SiembraSeguimientos ss JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
                JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND ss.TipoRegistro=N'Siniestro'
                  AND (@Lote IS NULL OR l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY ss.Fecha DESC,ss.SiembraSeguimientoId DESC;
                """,
            "siniestros_resumen" => """
                SELECT TOP (16) s.Producto AS cultivo,ss.Siniestro AS siniestro,
                    COUNT(*) AS eventos,COUNT(DISTINCT s.LoteId) AS lotesAfectados
                FROM dbo.SiembraSeguimientos ss JOIN dbo.Siembras s ON s.SiembraId=ss.SiembraId
                JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND ss.TipoRegistro=N'Siniestro'
                GROUP BY s.Producto,ss.Siniestro ORDER BY eventos DESC;
                """,
            "resiembras" => """
                SELECT TOP (25) COUNT(*) OVER() AS totalCoincidencias,
                    l.Nombre AS lote,s.Producto AS cultivo,s.CicloEstacional AS ciclo,
                    s.CantidadHectareasTrabajadas AS hectareas,s.Siniestro AS motivo,
                    s.TipoResiembra AS tipo,s.FechaInicio AS fecha
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.TipoRegistro=N'Resiembra'
                  AND (@Lote IS NULL OR l.Nombre COLLATE Latin1_General_CI_AI=@Lote COLLATE Latin1_General_CI_AI)
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY s.FechaInicio DESC,s.SiembraId DESC;
                """,
            "resiembras_resumen" => """
                SELECT TOP (20) s.Producto AS cultivo,s.CicloEstacional AS ciclo,
                    COUNT(*) AS resiembras,COUNT(DISTINCT s.LoteId) AS lotes,
                    SUM(s.CantidadHectareasTrabajadas) AS hectareasRetrabajadas
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND LEFT(LTRIM(s.CampaniaNombre),9)=@Campania
                  AND s.TipoRegistro=N'Resiembra'
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY s.Producto,s.CicloEstacional ORDER BY hectareasRetrabajadas DESC;
                """,
            "epocas" => """
                SELECT TOP (12) s.Producto AS cultivo,s.TipoImplantacion AS epoca,
                    COUNT(*) AS cosechas,SUM(c.CantidadHectareasTrabajadas) AS hectareas,
                    SUM(c.CantidadGranoCosechado)/NULLIF(SUM(c.CantidadHectareasTrabajadas),0) AS rindeKgHa
                FROM dbo.Cosechas c JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND c.Estado=N'Finalizado' AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND s.TipoImplantacion IS NOT NULL
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY s.Producto,s.TipoImplantacion ORDER BY s.Producto,s.TipoImplantacion;
                """,
            "perdidas_cosecha" => """
                SELECT TOP (20) c.Producto AS cultivo,COUNT(*) AS tiradas,
                    AVG(t.PerdidaTotalKgHa) AS perdidaPromedioKgHa
                FROM dbo.CosechaTiradaAros t JOIN dbo.Cosechas c ON c.CosechaId=t.CosechaId
                JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                  AND LEFT(LTRIM(c.CampaniaNombre),9)=@Campania
                  AND (@Cultivo IS NULL OR c.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY c.Producto ORDER BY tiradas DESC;
                """,
            "silos" => """
                SELECT TOP (20) s.Nombre AS silo,s.Producto AS cultivo,s.EstadoOperativo AS estado,
                    s.CapacidadMax AS capacidadKg,s.CantidadGranoAlmacenado AS stockKg
                FROM dbo.Silos s WHERE s.EmpresaId=@EmpresaId AND s.Activo=1
                  AND (@Cultivo IS NULL OR s.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                ORDER BY s.CantidadGranoAlmacenado DESC;
                """,
            "almacenamiento" => """
                SELECT TOP (20) COALESCE(a.Producto,s.Producto) AS cultivo,
                    a.TipoMovimiento AS movimiento,COUNT(*) AS movimientos,SUM(a.Cantidad) AS kg
                FROM dbo.Almacenamientos a JOIN dbo.Silos s ON s.SiloId=a.SiloId
                LEFT JOIN dbo.Campanias ca ON ca.CampaniaId=a.CampaniaId AND ca.EmpresaId=@EmpresaId
                WHERE s.EmpresaId=@EmpresaId AND (a.EmpresaId=@EmpresaId OR a.EmpresaId IS NULL)
                  AND COALESCE(ca.Periodo,LEFT(LTRIM(a.Campania),9))=@Campania
                  AND (@Cultivo IS NULL OR COALESCE(a.Producto,s.Producto) COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY COALESCE(a.Producto,s.Producto),a.TipoMovimiento ORDER BY kg DESC;
                """,
            "distribucion" => """
                SELECT TOP (20) d.Producto AS cultivo,COUNT(*) AS camiones,
                    SUM(dc.KgDespachados) AS kgDespachados,SUM(dc.KgRecibidos) AS kgRecibidos,
                    SUM(dc.MermaTotalKg) AS mermaTotalKg,SUM(dc.MermaNoJustificadaKg) AS mermaNoJustificadaKg
                FROM dbo.Distribuciones d JOIN dbo.DistribucionCamiones dc ON dc.DistribucionId=d.DistribucionId
                JOIN dbo.Campanias ca ON ca.CampaniaId=d.CampaniaId
                WHERE d.EmpresaId=@EmpresaId AND dc.EmpresaId=@EmpresaId AND ca.EmpresaId=@EmpresaId
                  AND ca.Periodo=@Campania AND dc.FechaConciliacion IS NOT NULL
                  AND (@Cultivo IS NULL OR d.Producto COLLATE Latin1_General_CI_AI=@Cultivo COLLATE Latin1_General_CI_AI)
                GROUP BY d.Producto ORDER BY kgDespachados DESC;
                """,
            _ => throw new ArgumentException("Consulta de Reportería IA no admitida.")
        };
    }

    private async Task<IReadOnlyList<object>> LeerAsync(string sql, int empresaId, int? usuarioId,
        string? campania, string? lote, string? cultivo, CancellationToken ct)
    {
        await using var db = new SqlConnection(_connectionString);
        await db.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, db) { CommandTimeout = 15 };
        cmd.Parameters.AddWithValue("@EmpresaId", empresaId);
        if (usuarioId is not null) cmd.Parameters.AddWithValue("@UsuarioId", usuarioId.Value);
        cmd.Parameters.Add("@Campania", SqlDbType.NVarChar, 9).Value = (object?)campania ?? DBNull.Value;
        cmd.Parameters.Add("@Lote", SqlDbType.NVarChar, 120).Value = (object?)lote ?? DBNull.Value;
        cmd.Parameters.Add("@Cultivo", SqlDbType.NVarChar, 60).Value = (object?)cultivo ?? DBNull.Value;
        return await LeerFilasAsync(cmd, ct);
    }

    private static async Task<IReadOnlyList<object>> LeerFilasAsync(SqlCommand cmd, CancellationToken ct)
    {
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        return await LeerFilasAsync(reader, ct);
    }

    private static async Task<IReadOnlyList<object>> LeerFilasAsync(SqlDataReader reader, CancellationToken ct)
    {
        var rows = new List<object>();
        while (await reader.ReadAsync(ct))
        {
            var row = new Dictionary<string, object?>();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                var value = reader.IsDBNull(i) ? null : reader.GetValue(i);
                row[reader.GetName(i)] = value is DateTime date ? date.ToString("yyyy-MM-dd") : value;
            }
            rows.Add(row);
        }
        return rows;
    }
}
