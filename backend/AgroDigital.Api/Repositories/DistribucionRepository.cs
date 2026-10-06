using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;
using static AgroDigital.Api.Repositories.DistribucionAcceso;

namespace AgroDigital.Api.Repositories;

/*
    Modulo Distribucion (script 23_distribucion.sql).

    Reglas vigentes:
      - Un envio agrupa camiones; la merma se concilia por camion / Carta de Porte.
      - Ciclo del camion: En transito -> Recibido -> Conciliado.
      - Una vez registrados, los kg despachados y el origen no se modifican y los
        camiones no se borran: solo se editan datos logisticos (chofer, camion,
        destino, CPE, ticket). Asi el Egreso FIFO del silo nunca queda desfasado.
      - Si el grano sale de un silo, cada camion genera su Egreso en Almacenamiento
        dentro de la MISMA transaccion del envio.
      - Si sale directo de la cosecha, no puede superar lo cosechado menos lo
        almacenado y lo ya distribuido directo.
*/
public class DistribucionRepository(IConfiguration configuration, IAlmacenamientoRepository almacenamientoRepository)
    : IDistribucionRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private static readonly string[] EstadosValidos = ["En transito", "Recibido", "Conciliado"];

    // =====================================================================
    // Consultas
    // =====================================================================

    public async Task<IReadOnlyList<DistribucionCamionDto>> ObtenerCamionesAsync(
        int? empresaId, int? campaniaId, string? estado, DateOnly? desde, DateOnly? hasta, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var estadoFiltro = EstadosValidos.Contains(estado) ? estado : null;
        return await LeerCamionesAsync(connection, null, usuarioId, esAdmin,
            empresaId, campaniaId, estadoFiltro, desde, hasta, distribucionId: null, distribucionCamionId: null);
    }

    public async Task<DistribucionIndicadoresDto> ObtenerIndicadoresAsync(
        int empresaId, int? campaniaId, DateOnly? desde, DateOnly? hasta, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await ExigirAccesoAsync(connection, null, usuarioId, esAdmin, empresaId);

        var rol = esAdmin ? "Admin" : await ObtenerRolAsync(connection, null, usuarioId, empresaId);
        var incluyeMerma = esAdmin || RolesIndicadoresAgregados.Contains(rol);

        const string sql = """
            SELECT
                ISNULL(SUM(v.KgDespachados), 0)                                         AS KgDespachados,
                COUNT(1)                                                                AS CantidadCamiones,
                COUNT(DISTINCT v.DestinoId)                                             AS CantidadDestinos,
                SUM(CASE WHEN v.Estado = N'Recibido' THEN 1 ELSE 0 END)                 AS Recibidos,
                SUM(CASE WHEN v.Estado = N'En transito' THEN 1 ELSE 0 END)              AS EnTransito,
                MAX(CASE WHEN v.Estado = N'Recibido' THEN v.DiasSinConciliar END)       AS MaxDias,
                -- Merma: solo camiones conciliados con merma esperada calculada.
                SUM(CASE WHEN v.Estado = N'Conciliado' AND v.MermaEsperadaKg IS NOT NULL THEN v.KgDespachados END) AS KgBaseMerma,
                SUM(CASE WHEN v.Estado = N'Conciliado' AND v.MermaEsperadaKg IS NOT NULL THEN v.MermaTotalKg END)  AS KgMermaReal,
                SUM(CASE WHEN v.Estado = N'Conciliado' AND v.MermaEsperadaKg IS NOT NULL THEN v.MermaEsperadaKg END) AS KgMermaEsperada
            FROM dbo.vw_DistribucionCamiones AS v
            WHERE v.EmpresaId = @EmpresaId
              AND (@CampaniaId IS NULL OR v.CampaniaId = @CampaniaId)
              AND (@Desde IS NULL OR v.FechaSalida >= @Desde)
              AND (@Hasta IS NULL OR v.FechaSalida <= @Hasta);
            """;

        var indicadores = new DistribucionIndicadoresDto { IncluyeMerma = incluyeMerma };
        await using (var command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@EmpresaId", empresaId);
            command.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@Desde", (object?)desde ?? DBNull.Value);
            command.Parameters.AddWithValue("@Hasta", (object?)hasta ?? DBNull.Value);

            await using var r = await command.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                indicadores.KgDespachados = r.GetDecimal(0);
                indicadores.CantidadCamiones = r.GetInt32(1);
                indicadores.CantidadDestinos = r.GetInt32(2);
                indicadores.CamionesRecibidosSinConciliar = r.IsDBNull(3) ? 0 : r.GetInt32(3);
                indicadores.CamionesEnTransito = r.IsDBNull(4) ? 0 : r.GetInt32(4);
                indicadores.MaxDiasSinConciliar = r.IsDBNull(5) ? null : r.GetInt32(5);

                var kgBase = r.IsDBNull(6) ? 0m : r.GetDecimal(6);
                if (incluyeMerma && kgBase > 0)
                {
                    var real = r.GetDecimal(7);
                    var esperada = r.GetDecimal(8);
                    var desvio = (real - esperada) / kgBase * 100m;
                    indicadores.MermaRealPct = Math.Round(real / kgBase * 100m, 2);
                    indicadores.MermaEsperadaPct = Math.Round(esperada / kgBase * 100m, 2);
                    indicadores.DesvioPp = Math.Round(desvio, 2);
                    indicadores.KgSinJustificar = Math.Round(real - esperada, 2);
                    // Varios granos pueden tener umbrales distintos: el agregado usa los umbrales por defecto.
                    indicadores.NivelDesvio = CalculadoraMermaDistribucion.Nivel(desvio);
                }
            }
        }

        if (campaniaId.HasValue)
        {
            await CompletarDestinoCosechaAsync(connection, indicadores, empresaId, campaniaId.Value);
        }

        return indicadores;
    }

    /// <summary>% de la cosecha de la campania que ya se distribuyo, esta en silos o no tiene destino.</summary>
    private static async Task CompletarDestinoCosechaAsync(
        SqlConnection connection, DistribucionIndicadoresDto indicadores, int empresaId, int campaniaId)
    {
        const string sql = """
            SELECT
                (SELECT SUM(c.CantidadGranoCosechado)
                 FROM dbo.Cosechas AS c
                 INNER JOIN dbo.Lotes AS lo ON lo.LoteId = c.LoteId
                 INNER JOIN dbo.Campanias AS cp ON cp.Nombre = c.CampaniaNombre
                 WHERE cp.CampaniaId = @CampaniaId AND lo.EmpresaId = @EmpresaId
                   AND c.CantidadGranoCosechado IS NOT NULL)                             AS KgCosechados,
                (SELECT SUM(dc.KgDespachados)
                 FROM dbo.DistribucionCamiones AS dc
                 INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = dc.DistribucionId
                 WHERE d.CampaniaId = @CampaniaId AND d.EmpresaId = @EmpresaId)          AS KgDistribuidos,
                (SELECT SUM(p.KgRestantes)
                 FROM dbo.AlmacenamientoPartidas AS p
                 WHERE p.CampaniaId = @CampaniaId AND p.EmpresaId = @EmpresaId)          AS KgEnSilos;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@CampaniaId", campaniaId);
        await using var r = await command.ExecuteReaderAsync();
        if (!await r.ReadAsync() || r.IsDBNull(0)) return;

        var cosechado = r.GetDecimal(0);
        if (cosechado <= 0) return;

        var distribuido = r.IsDBNull(1) ? 0m : r.GetDecimal(1);
        var enSilos = r.IsDBNull(2) ? 0m : r.GetDecimal(2);
        var pctDistribuido = Math.Min(100m, distribuido / cosechado * 100m);
        var pctEnSilos = Math.Min(100m - pctDistribuido, enSilos / cosechado * 100m);

        indicadores.KgCosechados = cosechado;
        indicadores.PctDistribuido = Math.Round(pctDistribuido, 1);
        indicadores.PctEnSilos = Math.Round(pctEnSilos, 1);
        indicadores.PctSinDestino = Math.Round(Math.Max(0m, 100m - pctDistribuido - pctEnSilos), 1);
    }

    public async Task<DistribucionDto?> ObtenerPorIdAsync(int distribucionId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = $"""
            SELECT r.DistribucionId, r.EmpresaId, r.Nombre, r.CampaniaId, r.CosechaId, r.Producto, r.OrigenGrano,
                   r.SiloId, r.FechaSalida, r.ResponsableACargo, d.Observaciones, r.Estado, r.CantidadCamiones,
                   ISNULL(r.KgDespachados, 0) AS KgDespachados
            FROM dbo.vw_DistribucionesResumen AS r
            INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = r.DistribucionId
            WHERE r.DistribucionId = @DistribucionId AND {Filtro("r.EmpresaId")};
            """;

        DistribucionDto? envio = null;
        await using (var command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@DistribucionId", distribucionId);
            AgregarParametros(command, usuarioId, esAdmin);
            await using var r = await command.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                envio = new DistribucionDto
                {
                    DistribucionId = r.GetInt32(0),
                    EmpresaId = r.GetInt32(1),
                    Nombre = r.GetString(2),
                    CampaniaId = r.IsDBNull(3) ? null : r.GetInt32(3),
                    CosechaId = r.IsDBNull(4) ? null : r.GetInt32(4),
                    Producto = r.GetString(5),
                    OrigenGrano = r.GetString(6),
                    SiloId = r.IsDBNull(7) ? null : r.GetInt32(7),
                    FechaSalida = DateOnly.FromDateTime(r.GetDateTime(8)),
                    ResponsableACargo = r.GetString(9),
                    Observaciones = r.IsDBNull(10) ? null : r.GetString(10),
                    Estado = r.GetString(11),
                    CantidadCamiones = r.GetInt32(12),
                    KgDespachados = r.GetDecimal(13),
                };
            }
        }

        if (envio is null) return null;

        envio.Camiones = await LeerCamionesAsync(connection, null, usuarioId, esAdmin,
            empresaId: null, campaniaId: null, estado: null, desde: null, hasta: null, distribucionId, distribucionCamionId: null);
        envio.Documentos = await LeerDocumentosAsync(connection, distribucionId, distribucionCamionId: null, soloDelCamion: false);
        return envio;
    }

    public async Task<TrazabilidadCamionDto?> ObtenerTrazabilidadCamionAsync(int distribucionCamionId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var camion = (await LeerCamionesAsync(connection, null, usuarioId, esAdmin,
            null, null, null, null, null, distribucionId: null, distribucionCamionId)).FirstOrDefault();
        if (camion is null) return null;

        var traza = new TrazabilidadCamionDto { Camion = camion };

        // Lote, siembra y cosecha de origen (si el envio esta vinculado a una cosecha).
        const string origenSql = """
            SELECT lo.Nombre, lo.Ciudad + N', ' + lo.Provincia, lo.Condicion,
                   si.Nombre, si.VariedadSemilla, si.FechaInicio, co.HumedadGrano, co.Impurezas
            FROM dbo.Distribuciones AS d
            INNER JOIN dbo.Cosechas AS co ON co.CosechaId = d.CosechaId
            LEFT JOIN dbo.Lotes AS lo ON lo.LoteId = co.LoteId
            LEFT JOIN dbo.Siembras AS si ON si.SiembraId = co.SiembraId
            WHERE d.DistribucionId = @DistribucionId;
            """;
        await using (var command = new SqlCommand(origenSql, connection))
        {
            command.Parameters.AddWithValue("@DistribucionId", camion.DistribucionId);
            await using var r = await command.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                traza.Lote = r.IsDBNull(0) ? null : r.GetString(0);
                traza.LoteUbicacion = r.IsDBNull(1) ? null : r.GetString(1);
                traza.LoteCondicion = r.IsDBNull(2) ? null : r.GetString(2);
                traza.Siembra = r.IsDBNull(3) ? null : r.GetString(3);
                traza.VariedadSemilla = r.IsDBNull(4) ? null : r.GetString(4);
                traza.FechaSiembra = r.IsDBNull(5) ? null : DateOnly.FromDateTime(r.GetDateTime(5));
                traza.HumedadCosecha = r.IsDBNull(6) ? null : r.GetDecimal(6);
                traza.ImpurezasCosecha = r.IsDBNull(7) ? null : r.GetDecimal(7);
            }
        }

        // Partidas FIFO que consumio el egreso de este camion.
        if (camion.AlmacenamientoEgresoId.HasValue)
        {
            const string partidasSql = """
                SELECT p.PartidaId, p.FechaIngreso, co.Nombre, lo.Nombre, c.Kg,
                       DATEDIFF(DAY, p.FechaIngreso, @FechaSalida) AS DiasAlmacenado
                FROM dbo.AlmacenamientoPartidaConsumos AS c
                INNER JOIN dbo.AlmacenamientoPartidas AS p ON p.PartidaId = c.PartidaId
                LEFT JOIN dbo.Cosechas AS co ON co.CosechaId = p.CosechaId
                LEFT JOIN dbo.Lotes AS lo ON lo.LoteId = co.LoteId
                WHERE c.AlmacenamientoId = @EgresoId
                ORDER BY p.FechaIngreso, p.PartidaId;
                """;
            var partidas = new List<PartidaConsumidaDto>();
            await using (var command = new SqlCommand(partidasSql, connection))
            {
                command.Parameters.AddWithValue("@EgresoId", camion.AlmacenamientoEgresoId.Value);
                command.Parameters.AddWithValue("@FechaSalida", camion.FechaSalida);
                await using var r = await command.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    partidas.Add(new PartidaConsumidaDto
                    {
                        PartidaId = r.GetInt32(0),
                        FechaIngreso = DateOnly.FromDateTime(r.GetDateTime(1)),
                        Cosecha = r.IsDBNull(2) ? null : r.GetString(2),
                        Lote = r.IsDBNull(3) ? null : r.GetString(3),
                        Kg = r.GetDecimal(4),
                        DiasAlmacenado = r.GetInt32(5),
                    });
                }
            }

            traza.Partidas = partidas;
        }

        // Ultimo control del silo hasta el dia de salida.
        if (camion.SiloId.HasValue)
        {
            // Las plagas ya no son una columna de SiloControles (script 03): se registran como
            // incidencias del control en SiloControlIncidencias.
            const string controlSql = """
                SELECT TOP (1) sc.Fecha, sc.HumedadGrano, sc.Temperatura, sc.EstadoGrano,
                       CAST(CASE WHEN EXISTS (
                           SELECT 1 FROM dbo.SiloControlIncidencias AS i WHERE i.SiloControlId = sc.SiloControlId
                       ) THEN 1 ELSE 0 END AS BIT) AS PresenciaPlagas
                FROM dbo.SiloControles AS sc
                WHERE sc.SiloId = @SiloId AND CAST(sc.Fecha AS DATE) <= @FechaSalida
                ORDER BY sc.Fecha DESC, sc.SiloControlId DESC;
                """;
            await using var command = new SqlCommand(controlSql, connection);
            command.Parameters.AddWithValue("@SiloId", camion.SiloId.Value);
            command.Parameters.AddWithValue("@FechaSalida", camion.FechaSalida);
            await using var r = await command.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                traza.UltimoControlSilo = new UltimoControlSiloDto
                {
                    Fecha = DateOnly.FromDateTime(r.GetDateTime(0)),
                    HumedadGrano = r.GetDecimal(1),
                    Temperatura = r.GetDecimal(2),
                    EstadoGrano = r.GetString(3),
                    PresenciaPlagas = r.GetBoolean(4),
                };
            }
        }

        traza.Documentos = await LeerDocumentosAsync(connection, camion.DistribucionId, distribucionCamionId, soloDelCamion: true);
        return traza;
    }

    public async Task<DisponibilidadDistribucionDto> ObtenerDisponibilidadAsync(
        int empresaId, int? siloId, int? cosechaId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await ExigirAccesoAsync(connection, null, usuarioId, esAdmin, empresaId);

        if (siloId.HasValue)
        {
            var silo = await LeerSiloAsync(connection, null, siloId.Value)
                ?? throw new KeyNotFoundException("El silo indicado no existe.");
            if (silo.EmpresaId != empresaId) throw new KeyNotFoundException("El silo indicado no pertenece a la empresa.");

            return new DisponibilidadDistribucionDto
            {
                OrigenGrano = "Silo",
                Producto = silo.Producto,
                KgDisponibles = silo.Stock,
                Detalle = $"Stock actual del silo {silo.Nombre}.",
            };
        }

        if (cosechaId.HasValue)
        {
            var saldo = await LeerSaldoCosechaAsync(connection, null, cosechaId.Value, bloquear: false)
                ?? throw new KeyNotFoundException("La cosecha indicada no existe.");
            if (saldo.EmpresaId != empresaId) throw new KeyNotFoundException("La cosecha indicada no pertenece a la empresa.");

            return new DisponibilidadDistribucionDto
            {
                OrigenGrano = "Cosecha",
                Producto = saldo.Producto,
                KgDisponibles = saldo.KgDisponibles,
                Detalle = saldo.KgCosechados is null
                    ? $"La cosecha {saldo.Nombre} todavia no tiene cantidad cosechada."
                    : $"Cosechado {saldo.KgCosechados:N0} kg, menos lo almacenado ({saldo.KgAlmacenados:N0} kg) y lo ya distribuido directo ({saldo.KgDistribuidos:N0} kg).",
            };
        }

        throw new InvalidOperationException("Indica un silo o una cosecha.");
    }

    // =====================================================================
    // Registro del envio
    // =====================================================================

    public async Task<DistribucionDto> RegistrarAsync(CrearDistribucionRequest request, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        int distribucionId;
        try
        {
            await DistribucionAcceso.ExigirGestionAsync(connection, transaction, usuarioId, esAdmin, request.EmpresaId);

            var totalKg = request.Camiones.Sum(c => c.KgDespachados);
            var campaniaId = request.CampaniaId;
            string producto;

            if (request.OrigenGrano == "Cosecha")
            {
                var saldo = await LeerSaldoCosechaAsync(connection, transaction, request.CosechaId!.Value, bloquear: true)
                    ?? throw new InvalidOperationException("La cosecha indicada no existe.");
                ValidarCosecha(saldo, request.EmpresaId);

                if (saldo.KgCosechados is null)
                {
                    throw new InvalidOperationException(
                        $"La cosecha {saldo.Nombre} todavia no tiene cantidad cosechada. Finalizala antes de distribuir su grano.");
                }

                if (totalKg > saldo.KgDisponibles)
                {
                    throw new InvalidOperationException(
                        $"El envio ({totalKg:N0} kg) supera lo disponible de la cosecha {saldo.Nombre} ({saldo.KgDisponibles:N0} kg).");
                }

                if (request.FechaSalida < saldo.FechaInicio)
                {
                    throw new InvalidOperationException(
                        $"La fecha de salida no puede ser anterior al inicio de la cosecha ({saldo.FechaInicio:dd/MM/yyyy}).");
                }

                producto = saldo.Producto;
                campaniaId = saldo.CampaniaId ?? campaniaId;
            }
            else
            {
                var silo = await LeerSiloAsync(connection, transaction, request.SiloId!.Value)
                    ?? throw new InvalidOperationException("El silo indicado no existe.");

                if (silo.EmpresaId != request.EmpresaId)
                {
                    throw new InvalidOperationException("El silo de origen no pertenece a la empresa del envio.");
                }

                if (silo.Stock <= 0 || string.IsNullOrWhiteSpace(silo.Producto))
                {
                    throw new InvalidOperationException($"El silo {silo.Nombre} no tiene grano para despachar.");
                }

                if (totalKg > silo.Stock)
                {
                    throw new InvalidOperationException(
                        $"El envio ({totalKg:N0} kg) supera el stock del silo {silo.Nombre} ({silo.Stock:N0} kg).");
                }

                producto = silo.Producto;

                // Vinculo opcional con una cosecha (para trazabilidad y campania): debe ser del mismo grano.
                if (request.CosechaId.HasValue)
                {
                    var saldo = await LeerSaldoCosechaAsync(connection, transaction, request.CosechaId.Value, bloquear: false)
                        ?? throw new InvalidOperationException("La cosecha indicada no existe.");
                    ValidarCosecha(saldo, request.EmpresaId);

                    if (CalculadoraMermaDistribucion.NormalizarGrano(saldo.Producto) != CalculadoraMermaDistribucion.NormalizarGrano(producto))
                    {
                        throw new InvalidOperationException(
                            $"La cosecha {saldo.Nombre} es de {saldo.Producto} y el silo contiene {producto}.");
                    }

                    campaniaId = saldo.CampaniaId ?? campaniaId;
                }
            }

            if (campaniaId.HasValue)
            {
                await ValidarCampaniaAsync(connection, transaction, campaniaId.Value, request.EmpresaId);
            }

            // Catalogos y CPE de cada camion.
            var camiones = new List<(CamionDistribucionRequest Datos, int? TransportistaId, string Cpe)>();
            var cpesDelEnvio = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var camion in request.Camiones)
            {
                var cpe = NormalizarCpe(camion.CodigoCpe);
                if (!cpesDelEnvio.Add(cpe))
                {
                    throw new InvalidOperationException($"La Carta de Porte {cpe} esta repetida en el envio.");
                }

                await ValidarCpeLibreAsync(connection, transaction, request.EmpresaId, cpe, excluirCamionId: null);
                var transportistaId = await ValidarCatalogosAsync(
                    connection, transaction, request.EmpresaId, camion.ChoferId, camion.CamionId, camion.DestinoId);
                camiones.Add((camion, transportistaId, cpe));
            }

            var nombre = await GenerarNombreAsync(connection, transaction, request.EmpresaId);

            const string insertEnvio = """
                INSERT INTO dbo.Distribuciones
                    (EmpresaId, Nombre, CampaniaId, CosechaId, Producto, OrigenGrano, SiloId, FechaSalida,
                     ResponsableACargo, Observaciones, CreadoPorUsuarioId)
                OUTPUT INSERTED.DistribucionId
                VALUES
                    (@EmpresaId, @Nombre, @CampaniaId, @CosechaId, @Producto, @OrigenGrano, @SiloId, @FechaSalida,
                     @ResponsableACargo, @Observaciones, @CreadoPorUsuarioId);
                """;

            await using (var insert = new SqlCommand(insertEnvio, connection, transaction))
            {
                insert.Parameters.AddWithValue("@EmpresaId", request.EmpresaId);
                insert.Parameters.AddWithValue("@Nombre", nombre);
                insert.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@CosechaId", (object?)request.CosechaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@Producto", producto);
                insert.Parameters.AddWithValue("@OrigenGrano", request.OrigenGrano);
                insert.Parameters.AddWithValue("@SiloId", request.OrigenGrano == "Silo" ? request.SiloId!.Value : DBNull.Value);
                insert.Parameters.AddWithValue("@FechaSalida", request.FechaSalida);
                insert.Parameters.AddWithValue("@ResponsableACargo", request.ResponsableACargo.Trim());
                insert.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
                insert.Parameters.AddWithValue("@CreadoPorUsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
                distribucionId = (int)(await insert.ExecuteScalarAsync()
                    ?? throw new InvalidOperationException("No se pudo registrar la distribucion."));
            }

            foreach (var (datos, transportistaId, cpe) in camiones)
            {
                int? egresoId = null;
                if (request.OrigenGrano == "Silo")
                {
                    egresoId = await almacenamientoRepository.RegistrarEgresoDistribucionAsync(
                        connection, transaction, request.SiloId!.Value, request.EmpresaId, request.FechaSalida,
                        datos.KgDespachados, $"{nombre} - CPE {cpe}", usuarioId);
                }

                const string insertCamion = """
                    INSERT INTO dbo.DistribucionCamiones
                        (DistribucionId, EmpresaId, ChoferId, CamionId, TransportistaId, DestinoId, CodigoCpe,
                         NroTicketBalanza, KgDespachados, AlmacenamientoEgresoId, Estado)
                    VALUES
                        (@DistribucionId, @EmpresaId, @ChoferId, @CamionId, @TransportistaId, @DestinoId, @CodigoCpe,
                         @NroTicketBalanza, @KgDespachados, @EgresoId, N'En transito');
                    """;

                await using var insert = new SqlCommand(insertCamion, connection, transaction);
                insert.Parameters.AddWithValue("@DistribucionId", distribucionId);
                insert.Parameters.AddWithValue("@EmpresaId", request.EmpresaId);
                insert.Parameters.AddWithValue("@ChoferId", datos.ChoferId);
                insert.Parameters.AddWithValue("@CamionId", datos.CamionId);
                insert.Parameters.AddWithValue("@TransportistaId", (object?)transportistaId ?? DBNull.Value);
                insert.Parameters.AddWithValue("@DestinoId", datos.DestinoId);
                insert.Parameters.AddWithValue("@CodigoCpe", cpe);
                insert.Parameters.AddWithValue("@NroTicketBalanza", TextoONull(datos.NroTicketBalanza));
                insert.Parameters.AddWithValue("@KgDespachados", datos.KgDespachados);
                insert.Parameters.AddWithValue("@EgresoId", (object?)egresoId ?? DBNull.Value);
                await insert.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch (SqlException ex) when (EsDuplicado(ex))
        {
            await transaction.RollbackAsync();
            throw new ConflictoDistribucionException("Otra persona registro la misma Carta de Porte al mismo tiempo. Revisa los codigos.");
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        return (await ObtenerPorIdAsync(distribucionId, usuarioId, esAdmin: true))!;
    }

    // =====================================================================
    // Modificaciones
    // =====================================================================

    public async Task ActualizarAsync(int distribucionId, ActualizarDistribucionRequest request, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var empresaId = await ObtenerEmpresaEnvioAsync(connection, null, distribucionId)
            ?? throw new KeyNotFoundException("La distribucion no existe.");
        await DistribucionAcceso.ExigirGestionAsync(connection, null, usuarioId, esAdmin, empresaId);

        const string sql = """
            UPDATE dbo.Distribuciones
            SET ResponsableACargo = @ResponsableACargo, Observaciones = @Observaciones, FechaModificacion = SYSDATETIME()
            WHERE DistribucionId = @DistribucionId;
            """;
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@ResponsableACargo", request.ResponsableACargo.Trim());
        command.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
        command.Parameters.AddWithValue("@DistribucionId", distribucionId);
        await command.ExecuteNonQueryAsync();
    }

    public async Task ActualizarLogisticaCamionAsync(
        int distribucionCamionId, ActualizarCamionLogisticaRequest request, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var camion = await BloquearCamionAsync(connection, transaction, distribucionCamionId)
                ?? throw new KeyNotFoundException("El camion no existe.");
            await DistribucionAcceso.ExigirGestionAsync(connection, transaction, usuarioId, esAdmin, camion.EmpresaId);

            var cpe = NormalizarCpe(request.CodigoCpe);
            await ValidarCpeLibreAsync(connection, transaction, camion.EmpresaId, cpe, excluirCamionId: distribucionCamionId);
            var transportistaId = await ValidarCatalogosAsync(
                connection, transaction, camion.EmpresaId, request.ChoferId, request.CamionId, request.DestinoId);

            const string sql = """
                UPDATE dbo.DistribucionCamiones
                SET ChoferId = @ChoferId, CamionId = @CamionId, TransportistaId = @TransportistaId,
                    DestinoId = @DestinoId, CodigoCpe = @CodigoCpe, NroTicketBalanza = @NroTicketBalanza,
                    FechaModificacion = SYSDATETIME()
                WHERE DistribucionCamionId = @Id;
                """;
            await using var command = new SqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@ChoferId", request.ChoferId);
            command.Parameters.AddWithValue("@CamionId", request.CamionId);
            command.Parameters.AddWithValue("@TransportistaId", (object?)transportistaId ?? DBNull.Value);
            command.Parameters.AddWithValue("@DestinoId", request.DestinoId);
            command.Parameters.AddWithValue("@CodigoCpe", cpe);
            command.Parameters.AddWithValue("@NroTicketBalanza", TextoONull(request.NroTicketBalanza));
            command.Parameters.AddWithValue("@Id", distribucionCamionId);
            await command.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
        }
        catch (SqlException ex) when (EsDuplicado(ex))
        {
            await transaction.RollbackAsync();
            throw new ConflictoDistribucionException("Esa Carta de Porte ya esta registrada en otro envio.");
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task RegistrarRecepcionAsync(
        int distribucionCamionId, RegistrarRecepcionRequest request, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var camion = await BloquearCamionAsync(connection, transaction, distribucionCamionId)
                ?? throw new KeyNotFoundException("El camion no existe.");
            await DistribucionAcceso.ExigirGestionAsync(connection, transaction, usuarioId, esAdmin, camion.EmpresaId);

            if (camion.Estado == "Conciliado")
            {
                throw new InvalidOperationException(
                    "El camion ya esta conciliado: corregi la recepcion desde la conciliacion.");
            }

            ValidarFechaLlegada(request.FechaLlegada, camion.FechaSalida);

            const string sql = """
                UPDATE dbo.DistribucionCamiones
                SET FechaLlegada = @FechaLlegada, KgRecibidos = @KgRecibidos, Estado = N'Recibido',
                    FechaModificacion = SYSDATETIME()
                WHERE DistribucionCamionId = @Id;
                """;
            await using var command = new SqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("@FechaLlegada", request.FechaLlegada);
            command.Parameters.AddWithValue("@KgRecibidos", request.KgRecibidos);
            command.Parameters.AddWithValue("@Id", distribucionCamionId);
            await command.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<AnalisisMermaDto> PrevisualizarConciliacionAsync(
        int distribucionCamionId, ConciliarCamionRequest request, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var camion = await BloquearCamionAsync(connection, null, distribucionCamionId, bloquear: false)
            ?? throw new KeyNotFoundException("El camion no existe.");
        await ExigirAccesoAsync(connection, null, usuarioId, esAdmin, camion.EmpresaId);

        var parametros = await LeerParametrosMermaAsync(connection, null, camion.EmpresaId, camion.Producto);
        return CalculadoraMermaDistribucion.Calcular(camion.KgDespachados, request.KgRecibidos,
            request.HumedadDestino, request.MateriasExtranasDestino, request.KgNetosLiquidados, parametros);
    }

    public async Task<AnalisisMermaDto> ConciliarAsync(
        int distribucionCamionId, ConciliarCamionRequest request, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();

        try
        {
            var camion = await BloquearCamionAsync(connection, transaction, distribucionCamionId)
                ?? throw new KeyNotFoundException("El camion no existe.");
            await DistribucionAcceso.ExigirGestionAsync(connection, transaction, usuarioId, esAdmin, camion.EmpresaId);
            ValidarFechaLlegada(request.FechaLlegada, camion.FechaSalida);

            var parametros = await LeerParametrosMermaAsync(connection, transaction, camion.EmpresaId, camion.Producto);
            var analisis = CalculadoraMermaDistribucion.Calcular(camion.KgDespachados, request.KgRecibidos,
                request.HumedadDestino, request.MateriasExtranasDestino, request.KgNetosLiquidados, parametros);

            const string sql = """
                UPDATE dbo.DistribucionCamiones
                SET FechaLlegada = @FechaLlegada,
                    KgRecibidos = @KgRecibidos,
                    HumedadDestino = @HumedadDestino,
                    MateriasExtranasDestino = @MateriasExtranas,
                    KgNetosLiquidados = @KgNetos,
                    NroLiquidacion = @NroLiquidacion,
                    Observaciones = @Observaciones,
                    HumedadBaseAplicada = @HumedadBase,
                    ManipuleoPctAplicado = @Manipuleo,
                    ToleranciaMePctAplicada = @Tolerancia,
                    MermaEsperadaPct = @EsperadaPct,
                    MermaEsperadaKg = @EsperadaKg,
                    NivelDesvio = @NivelDesvio,
                    FechaConciliacion = SYSDATETIME(),
                    ConciliadoPorUsuarioId = @UsuarioId,
                    Estado = N'Conciliado',
                    FechaModificacion = SYSDATETIME()
                WHERE DistribucionCamionId = @Id;
                """;
            await using (var command = new SqlCommand(sql, connection, transaction))
            {
                command.Parameters.AddWithValue("@FechaLlegada", request.FechaLlegada);
                command.Parameters.AddWithValue("@KgRecibidos", request.KgRecibidos);
                command.Parameters.AddWithValue("@HumedadDestino", request.HumedadDestino);
                command.Parameters.AddWithValue("@MateriasExtranas", request.MateriasExtranasDestino);
                command.Parameters.AddWithValue("@KgNetos", request.KgNetosLiquidados);
                command.Parameters.AddWithValue("@NroLiquidacion", TextoONull(request.NroLiquidacion));
                command.Parameters.AddWithValue("@Observaciones", TextoONull(request.Observaciones));
                command.Parameters.AddWithValue("@HumedadBase", (object?)analisis.HumedadBase ?? DBNull.Value);
                command.Parameters.AddWithValue("@Manipuleo", (object?)analisis.ManipuleoPct ?? DBNull.Value);
                command.Parameters.AddWithValue("@Tolerancia", (object?)analisis.ToleranciaMateriasExtranasPct ?? DBNull.Value);
                command.Parameters.AddWithValue("@EsperadaPct", (object?)analisis.MermaEsperadaPct ?? DBNull.Value);
                command.Parameters.AddWithValue("@EsperadaKg", (object?)analisis.MermaEsperadaKg ?? DBNull.Value);
                command.Parameters.AddWithValue("@NivelDesvio", (object?)analisis.NivelDesvio ?? DBNull.Value);
                command.Parameters.AddWithValue("@UsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
                command.Parameters.AddWithValue("@Id", distribucionCamionId);
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return analisis;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    // =====================================================================
    // Documentos
    // =====================================================================

    public async Task ExigirGestionAsync(int distribucionId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var empresaId = await ObtenerEmpresaEnvioAsync(connection, null, distribucionId)
            ?? throw new KeyNotFoundException("La distribucion no existe.");
        await DistribucionAcceso.ExigirGestionAsync(connection, null, usuarioId, esAdmin, empresaId);
    }

    public async Task<IReadOnlyList<DistribucionDocumentoDto>> ObtenerDocumentosAsync(int distribucionId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        return await LeerDocumentosAsync(connection, distribucionId, null, soloDelCamion: false);
    }

    public async Task<DistribucionDocumentoDto> AgregarDocumentoAsync(
        int distribucionId, int? distribucionCamionId, string nombreArchivo, string rutaArchivo, int usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        if (distribucionCamionId.HasValue)
        {
            const string pertenece = """
                SELECT COUNT(1) FROM dbo.DistribucionCamiones
                WHERE DistribucionCamionId = @CamionId AND DistribucionId = @DistribucionId;
                """;
            await using var check = new SqlCommand(pertenece, connection);
            check.Parameters.AddWithValue("@CamionId", distribucionCamionId.Value);
            check.Parameters.AddWithValue("@DistribucionId", distribucionId);
            if (Convert.ToInt32(await check.ExecuteScalarAsync()) == 0)
            {
                throw new InvalidOperationException("El camion indicado no pertenece a este envio.");
            }
        }

        const string sql = """
            INSERT INTO dbo.DistribucionDocumentos (DistribucionId, DistribucionCamionId, NombreArchivo, RutaArchivo, CargadoPorUsuarioId)
            OUTPUT INSERTED.DistribucionDocumentoId, INSERTED.FechaCarga
            VALUES (@DistribucionId, @CamionId, @NombreArchivo, @RutaArchivo, @UsuarioId);
            """;
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@DistribucionId", distribucionId);
        command.Parameters.AddWithValue("@CamionId", (object?)distribucionCamionId ?? DBNull.Value);
        command.Parameters.AddWithValue("@NombreArchivo", nombreArchivo);
        command.Parameters.AddWithValue("@RutaArchivo", rutaArchivo);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
        await using var r = await command.ExecuteReaderAsync();
        await r.ReadAsync();

        return new DistribucionDocumentoDto
        {
            DistribucionDocumentoId = r.GetInt32(0),
            DistribucionId = distribucionId,
            DistribucionCamionId = distribucionCamionId,
            NombreArchivo = nombreArchivo,
            FechaCarga = r.GetDateTime(1),
        };
    }

    public async Task<string?> ObtenerRutaDocumentoAsync(int distribucionId, int documentoId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        const string sql = """
            SELECT RutaArchivo FROM dbo.DistribucionDocumentos
            WHERE DistribucionDocumentoId = @DocumentoId AND DistribucionId = @DistribucionId;
            """;
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@DocumentoId", documentoId);
        command.Parameters.AddWithValue("@DistribucionId", distribucionId);
        return await command.ExecuteScalarAsync() as string;
    }

    public async Task<bool> EliminarDocumentoAsync(int distribucionId, int documentoId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        const string sql = """
            DELETE FROM dbo.DistribucionDocumentos
            WHERE DistribucionDocumentoId = @DocumentoId AND DistribucionId = @DistribucionId;
            """;
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@DocumentoId", documentoId);
        command.Parameters.AddWithValue("@DistribucionId", distribucionId);
        return await command.ExecuteNonQueryAsync() > 0;
    }

    // =====================================================================
    // Lecturas internas
    // =====================================================================

    private static async Task<IReadOnlyList<DistribucionCamionDto>> LeerCamionesAsync(
        SqlConnection connection, SqlTransaction? transaction, int usuarioId, bool esAdmin,
        int? empresaId, int? campaniaId, string? estado, DateOnly? desde, DateOnly? hasta,
        int? distribucionId, int? distribucionCamionId)
    {
        var sql = $"""
            SELECT v.*, dc.NroTicketBalanza, dc.NroLiquidacion, dc.Observaciones AS ObservacionesCamion
            FROM dbo.vw_DistribucionCamiones AS v
            INNER JOIN dbo.DistribucionCamiones AS dc ON dc.DistribucionCamionId = v.DistribucionCamionId
            WHERE {Filtro("v.EmpresaId")}
              AND (@EmpresaId IS NULL OR v.EmpresaId = @EmpresaId)
              AND (@CampaniaId IS NULL OR v.CampaniaId = @CampaniaId)
              AND (@Estado IS NULL OR v.Estado = @Estado)
              AND (@Desde IS NULL OR v.FechaSalida >= @Desde)
              AND (@Hasta IS NULL OR v.FechaSalida <= @Hasta)
              AND (@DistribucionId IS NULL OR v.DistribucionId = @DistribucionId)
              AND (@CamionId IS NULL OR v.DistribucionCamionId = @CamionId)
            ORDER BY v.FechaSalida DESC, v.DistribucionCamionId DESC;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        AgregarParametros(command, usuarioId, esAdmin);
        command.Parameters.AddWithValue("@EmpresaId", (object?)empresaId ?? DBNull.Value);
        command.Parameters.AddWithValue("@CampaniaId", (object?)campaniaId ?? DBNull.Value);
        command.Parameters.AddWithValue("@Estado", (object?)estado ?? DBNull.Value);
        command.Parameters.AddWithValue("@Desde", (object?)desde ?? DBNull.Value);
        command.Parameters.AddWithValue("@Hasta", (object?)hasta ?? DBNull.Value);
        command.Parameters.AddWithValue("@DistribucionId", (object?)distribucionId ?? DBNull.Value);
        command.Parameters.AddWithValue("@CamionId", (object?)distribucionCamionId ?? DBNull.Value);

        var camiones = new List<DistribucionCamionDto>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var estadoCamion = r.GetString(r.GetOrdinal("Estado"));
            camiones.Add(new DistribucionCamionDto
            {
                DistribucionCamionId = r.GetInt32(r.GetOrdinal("DistribucionCamionId")),
                DistribucionId = r.GetInt32(r.GetOrdinal("DistribucionId")),
                EmpresaId = r.GetInt32(r.GetOrdinal("EmpresaId")),
                Distribucion = r.GetString(r.GetOrdinal("Distribucion")),
                CampaniaId = IntN(r, "CampaniaId"),
                Campania = StrN(r, "Campania"),
                CosechaId = IntN(r, "CosechaId"),
                Cosecha = StrN(r, "Cosecha"),
                LoteId = IntN(r, "LoteId"),
                Producto = r.GetString(r.GetOrdinal("Producto")),
                OrigenGrano = r.GetString(r.GetOrdinal("OrigenGrano")),
                SiloId = IntN(r, "SiloId"),
                Silo = StrN(r, "Silo"),
                FechaSalida = FechaN(r, "FechaSalida")!.Value,
                ResponsableACargo = r.GetString(r.GetOrdinal("ResponsableACargo")),
                CodigoCpe = r.GetString(r.GetOrdinal("CodigoCpe")),
                NroTicketBalanza = StrN(r, "NroTicketBalanza"),
                ChoferId = r.GetInt32(r.GetOrdinal("ChoferId")),
                Chofer = r.GetString(r.GetOrdinal("Chofer")),
                TransportistaId = IntN(r, "TransportistaId"),
                Transportista = StrN(r, "Transportista"),
                CamionId = r.GetInt32(r.GetOrdinal("CamionId")),
                Patente = r.GetString(r.GetOrdinal("Patente")),
                DestinoId = r.GetInt32(r.GetOrdinal("DestinoId")),
                Destino = r.GetString(r.GetOrdinal("Destino")),
                Estado = estadoCamion,
                FechaLlegada = FechaN(r, "FechaLlegada"),
                DiasSinConciliar = estadoCamion == "Recibido" ? IntN(r, "DiasSinConciliar") : null,
                KgDespachados = r.GetDecimal(r.GetOrdinal("KgDespachados")),
                KgRecibidos = DecN(r, "KgRecibidos"),
                KgNetosLiquidados = DecN(r, "KgNetosLiquidados"),
                HumedadDestino = DecN(r, "HumedadDestino"),
                MateriasExtranasDestino = DecN(r, "MateriasExtranasDestino"),
                NroLiquidacion = StrN(r, "NroLiquidacion"),
                Observaciones = StrN(r, "ObservacionesCamion"),
                DiferenciaBalanzaKg = DecN(r, "DiferenciaBalanzaKg"),
                DescuentoCalidadKg = DecN(r, "DescuentoCalidadKg"),
                MermaTotalKg = DecN(r, "MermaTotalKg"),
                MermaEsperadaKg = DecN(r, "MermaEsperadaKg"),
                MermaEsperadaPct = DecN(r, "MermaEsperadaPct"),
                MermaNoJustificadaKg = DecN(r, "MermaNoJustificadaKg"),
                DiferenciaBalanzaPct = DecN(r, "DiferenciaBalanzaPct"),
                MermaTotalPct = DecN(r, "MermaTotalPct"),
                DesvioPp = DecN(r, "DesvioPp"),
                NivelDesvio = StrN(r, "NivelDesvio"),
                AlmacenamientoEgresoId = IntN(r, "AlmacenamientoEgresoId"),
            });
        }

        return camiones;
    }

    private static async Task<IReadOnlyList<DistribucionDocumentoDto>> LeerDocumentosAsync(
        SqlConnection connection, int distribucionId, int? distribucionCamionId, bool soloDelCamion)
    {
        // soloDelCamion: documentos de ese camion mas los del envio completo (CamionId NULL).
        const string sql = """
            SELECT d.DistribucionDocumentoId, d.DistribucionCamionId, d.NombreArchivo, d.FechaCarga,
                   u.Nombre + ISNULL(N' ' + u.Apellido, N'') AS CargadoPor
            FROM dbo.DistribucionDocumentos AS d
            LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = d.CargadoPorUsuarioId
            WHERE d.DistribucionId = @DistribucionId
              AND (@SoloDelCamion = 0 OR d.DistribucionCamionId IS NULL OR d.DistribucionCamionId = @CamionId)
            ORDER BY d.FechaCarga DESC, d.DistribucionDocumentoId DESC;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@DistribucionId", distribucionId);
        command.Parameters.AddWithValue("@CamionId", (object?)distribucionCamionId ?? DBNull.Value);
        command.Parameters.AddWithValue("@SoloDelCamion", soloDelCamion);

        var documentos = new List<DistribucionDocumentoDto>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            documentos.Add(new DistribucionDocumentoDto
            {
                DistribucionDocumentoId = r.GetInt32(0),
                DistribucionId = distribucionId,
                DistribucionCamionId = r.IsDBNull(1) ? null : r.GetInt32(1),
                NombreArchivo = r.GetString(2),
                FechaCarga = r.GetDateTime(3),
                CargadoPor = r.IsDBNull(4) ? null : r.GetString(4),
            });
        }

        return documentos;
    }

    private sealed record SiloOrigen(int SiloId, int? EmpresaId, string Nombre, decimal Stock, string? Producto);

    private static async Task<SiloOrigen?> LeerSiloAsync(SqlConnection connection, SqlTransaction? transaction, int siloId)
    {
        const string sql = """
            SELECT SiloId, EmpresaId, Nombre, CantidadGranoAlmacenado, Producto
            FROM dbo.Silos WHERE SiloId = @SiloId;
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@SiloId", siloId);
        await using var r = await command.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        return new SiloOrigen(r.GetInt32(0), r.IsDBNull(1) ? null : r.GetInt32(1), r.GetString(2),
            r.GetDecimal(3), r.IsDBNull(4) ? null : r.GetString(4));
    }

    private sealed record SaldoCosecha(
        int CosechaId, int? EmpresaId, string Nombre, string Producto, DateOnly FechaInicio, int? CampaniaId,
        decimal? KgCosechados, decimal KgAlmacenados, decimal KgDistribuidos)
    {
        public decimal KgDisponibles => KgCosechados is null ? 0 : Math.Max(0, KgCosechados.Value - KgAlmacenados - KgDistribuidos);
    }

    /// <summary>
    /// Saldo de una cosecha para despachar directo: cosechado - ingresos a silos - ya distribuido directo.
    /// Mismo criterio que AlmacenamientoRepository. bloquear = UPDLOCK sobre la cosecha para que
    /// dos envios simultaneos no tomen el mismo saldo.
    /// </summary>
    private static async Task<SaldoCosecha?> LeerSaldoCosechaAsync(
        SqlConnection connection, SqlTransaction? transaction, int cosechaId, bool bloquear)
    {
        var sql = $"""
            SELECT c.CosechaId, lo.EmpresaId, c.Nombre, c.Producto, c.FechaInicio, cp.CampaniaId,
                   c.CantidadGranoCosechado, ISNULL(alm.Kg, 0), ISNULL(dist.Kg, 0)
            FROM dbo.Cosechas AS c {(bloquear ? "WITH (UPDLOCK, ROWLOCK)" : string.Empty)}
            INNER JOIN dbo.Lotes AS lo ON lo.LoteId = c.LoteId
            OUTER APPLY (
                SELECT TOP (1) x.CampaniaId
                FROM dbo.Campanias AS x
                WHERE x.Nombre = c.CampaniaNombre
                ORDER BY CASE WHEN x.EmpresaId = lo.EmpresaId THEN 0 ELSE 1 END, x.CampaniaId
            ) AS cp
            OUTER APPLY (
                SELECT SUM(a.Cantidad) AS Kg
                FROM dbo.Almacenamientos AS a
                WHERE a.CosechaId = c.CosechaId AND a.TipoMovimiento = N'Ingreso' AND a.Origen <> N'Transferencia'
            ) AS alm
            OUTER APPLY (
                SELECT SUM(dc.KgDespachados) AS Kg
                FROM dbo.DistribucionCamiones AS dc
                INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = dc.DistribucionId
                WHERE d.CosechaId = c.CosechaId AND d.OrigenGrano = N'Cosecha'
            ) AS dist
            WHERE c.CosechaId = @CosechaId;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@CosechaId", cosechaId);
        await using var r = await command.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        return new SaldoCosecha(
            r.GetInt32(0),
            r.IsDBNull(1) ? null : r.GetInt32(1),
            r.GetString(2),
            r.GetString(3),
            DateOnly.FromDateTime(r.GetDateTime(4)),
            r.IsDBNull(5) ? null : r.GetInt32(5),
            r.IsDBNull(6) ? null : r.GetDecimal(6),
            r.GetDecimal(7),
            r.GetDecimal(8));
    }

    private static void ValidarCosecha(SaldoCosecha saldo, int empresaId)
    {
        if (saldo.EmpresaId != empresaId)
        {
            throw new InvalidOperationException("La cosecha no pertenece a la empresa del envio.");
        }
    }

    private static async Task ValidarCampaniaAsync(SqlConnection connection, SqlTransaction transaction, int campaniaId, int empresaId)
    {
        const string sql = "SELECT EmpresaId FROM dbo.Campanias WHERE CampaniaId = @CampaniaId;";
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@CampaniaId", campaniaId);
        var resultado = await command.ExecuteScalarAsync();

        if (resultado is null)
        {
            throw new InvalidOperationException("La campania indicada no existe.");
        }

        if (resultado is int empresaCampania && empresaCampania != empresaId)
        {
            throw new InvalidOperationException("La campania no pertenece a la empresa del envio.");
        }
    }

    /// <summary>Chofer, camion y destino de la empresa y activos. Devuelve el transportista a registrar.</summary>
    private static async Task<int?> ValidarCatalogosAsync(
        SqlConnection connection, SqlTransaction transaction, int empresaId, int choferId, int camionId, int destinoId)
    {
        const string sql = """
            SELECT
                (SELECT CASE WHEN Activo = 1 THEN 1 ELSE 0 END FROM dbo.Choferes WHERE ChoferId = @ChoferId AND EmpresaId = @EmpresaId) AS ChoferOk,
                (SELECT CASE WHEN Activo = 1 THEN 1 ELSE 0 END FROM dbo.Camiones WHERE CamionId = @CamionId AND EmpresaId = @EmpresaId) AS CamionOk,
                (SELECT CASE WHEN Activo = 1 THEN 1 ELSE 0 END FROM dbo.DestinosDistribucion WHERE DestinoId = @DestinoId AND EmpresaId = @EmpresaId) AS DestinoOk,
                (SELECT TransportistaId FROM dbo.Camiones WHERE CamionId = @CamionId) AS TransporteCamion,
                (SELECT TransportistaId FROM dbo.Choferes WHERE ChoferId = @ChoferId) AS TransporteChofer;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@ChoferId", choferId);
        command.Parameters.AddWithValue("@CamionId", camionId);
        command.Parameters.AddWithValue("@DestinoId", destinoId);
        await using var r = await command.ExecuteReaderAsync();
        await r.ReadAsync();

        string? Problema(int indice, string entidad) =>
            r.IsDBNull(indice) ? $"El {entidad} indicado no existe en la empresa."
            : r.GetInt32(indice) == 0 ? $"El {entidad} indicado esta inactivo."
            : null;

        var problema = Problema(0, "chofer") ?? Problema(1, "camion") ?? Problema(2, "destino");
        if (problema is not null)
        {
            throw new InvalidOperationException(problema);
        }

        // El transporte del camion manda; si el camion no tiene, el del chofer.
        if (!r.IsDBNull(3)) return r.GetInt32(3);
        return r.IsDBNull(4) ? null : r.GetInt32(4);
    }

    private static async Task ValidarCpeLibreAsync(
        SqlConnection connection, SqlTransaction transaction, int empresaId, string cpe, int? excluirCamionId)
    {
        const string sql = """
            SELECT TOP (1) d.Nombre
            FROM dbo.DistribucionCamiones AS dc WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = dc.DistribucionId
            WHERE dc.EmpresaId = @EmpresaId AND dc.CodigoCpe = @Cpe
              AND (@Excluir IS NULL OR dc.DistribucionCamionId <> @Excluir);
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@Cpe", cpe);
        command.Parameters.AddWithValue("@Excluir", (object?)excluirCamionId ?? DBNull.Value);

        if (await command.ExecuteScalarAsync() is string envio)
        {
            throw new ConflictoDistribucionException($"La Carta de Porte {cpe} ya esta registrada en {envio}.");
        }
    }

    private static async Task<string> GenerarNombreAsync(SqlConnection connection, SqlTransaction transaction, int empresaId)
    {
        // Numeracion por empresa. UPDLOCK + HOLDLOCK: dos altas simultaneas no obtienen el mismo numero.
        const string sql = """
            SELECT ISNULL(MAX(TRY_CAST(RIGHT(Nombre, 4) AS INT)), 0) + 1
            FROM dbo.Distribuciones WITH (UPDLOCK, HOLDLOCK)
            WHERE EmpresaId = @EmpresaId;
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        var siguiente = Convert.ToInt32(await command.ExecuteScalarAsync());
        return $"DIST - {siguiente:D4}";
    }

    private static async Task<int?> ObtenerEmpresaEnvioAsync(SqlConnection connection, SqlTransaction? transaction, int distribucionId)
    {
        const string sql = "SELECT EmpresaId FROM dbo.Distribuciones WHERE DistribucionId = @Id;";
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@Id", distribucionId);
        return await command.ExecuteScalarAsync() as int?;
    }

    private sealed record CamionBloqueado(
        int DistribucionCamionId, int EmpresaId, string Estado, decimal KgDespachados, DateOnly FechaSalida, string Producto);

    private static async Task<CamionBloqueado?> BloquearCamionAsync(
        SqlConnection connection, SqlTransaction? transaction, int distribucionCamionId, bool bloquear = true)
    {
        var sql = $"""
            SELECT dc.DistribucionCamionId, dc.EmpresaId, dc.Estado, dc.KgDespachados, d.FechaSalida, d.Producto
            FROM dbo.DistribucionCamiones AS dc {(bloquear ? "WITH (UPDLOCK, ROWLOCK)" : string.Empty)}
            INNER JOIN dbo.Distribuciones AS d ON d.DistribucionId = dc.DistribucionId
            WHERE dc.DistribucionCamionId = @Id;
            """;
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@Id", distribucionCamionId);
        await using var r = await command.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        return new CamionBloqueado(r.GetInt32(0), r.GetInt32(1), r.GetString(2), r.GetDecimal(3),
            DateOnly.FromDateTime(r.GetDateTime(4)), r.GetString(5));
    }

    /// <summary>Humedad base (normativa) y parametros de la empresa para el grano, comparando sin tildes.</summary>
    private static async Task<ParametrosMerma?> LeerParametrosMermaAsync(
        SqlConnection connection, SqlTransaction? transaction, int empresaId, string producto)
    {
        const string sql = """
            SELECT N'Base' AS Fuente, Producto, HumedadBase, NULL, NULL, NULL, NULL FROM dbo.GranoBasesComercializacion
            UNION ALL
            SELECT N'Empresa', Producto, NULL, ManipuleoPct, ToleranciaMateriasExtranasPct, DesvioMedioPp, DesvioAltoPp
            FROM dbo.GranoParametrosDistribucion WHERE EmpresaId = @EmpresaId;
            """;

        var grano = CalculadoraMermaDistribucion.NormalizarGrano(producto);
        decimal? humedadBase = null, manipuleo = null, tolerancia = null;
        decimal medio = CalculadoraMermaDistribucion.DesvioMedioPorDefecto;
        decimal alto = CalculadoraMermaDistribucion.DesvioAltoPorDefecto;
        var encontrado = false;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            if (CalculadoraMermaDistribucion.NormalizarGrano(r.GetString(1)) != grano) continue;
            encontrado = true;

            if (r.GetString(0) == "Base")
            {
                humedadBase = r.GetDecimal(2);
            }
            else
            {
                manipuleo = r.GetDecimal(3);
                tolerancia = r.GetDecimal(4);
                medio = r.GetDecimal(5);
                alto = r.GetDecimal(6);
            }
        }

        return encontrado ? new ParametrosMerma(humedadBase, manipuleo, tolerancia, medio, alto) : null;
    }

    private static void ValidarFechaLlegada(DateOnly fechaLlegada, DateOnly fechaSalida)
    {
        if (fechaLlegada < fechaSalida)
        {
            throw new InvalidOperationException($"La fecha de llegada no puede ser anterior a la salida ({fechaSalida:dd/MM/yyyy}).");
        }

        if (fechaLlegada > DateOnly.FromDateTime(DateTime.Today))
        {
            throw new InvalidOperationException("La fecha de llegada no puede ser posterior a hoy.");
        }
    }

    /// <summary>CPE sin espacios en los extremos y en mayusculas, para comparar duplicados.</summary>
    private static string NormalizarCpe(string cpe) => cpe.Trim().ToUpperInvariant();
}
