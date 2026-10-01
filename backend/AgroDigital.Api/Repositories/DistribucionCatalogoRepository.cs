using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;
using static AgroDigital.Api.Repositories.DistribucionAcceso;

namespace AgroDigital.Api.Repositories;

public interface IDistribucionCatalogoRepository
{
    Task<IReadOnlyList<TransportistaDto>> ObtenerTransportistasAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin);
    Task<TransportistaDto> GuardarTransportistaAsync(int? transportistaId, GuardarTransportistaRequest request, int usuarioId, bool esAdmin);

    Task<IReadOnlyList<ChoferDto>> ObtenerChoferesAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin);
    Task<ChoferDto> GuardarChoferAsync(int? choferId, GuardarChoferRequest request, int usuarioId, bool esAdmin);

    Task<IReadOnlyList<CamionCatalogoDto>> ObtenerCamionesAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin);
    Task<CamionCatalogoDto> GuardarCamionAsync(int? camionId, GuardarCamionRequest request, int usuarioId, bool esAdmin);

    Task<IReadOnlyList<DestinoDistribucionDto>> ObtenerDestinosAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin);
    Task<DestinoDistribucionDto> GuardarDestinoAsync(int? destinoId, GuardarDestinoRequest request, int usuarioId, bool esAdmin);

    /// <summary>Todos los granos con humedad base, mas los configurados por la empresa.</summary>
    Task<IReadOnlyList<GranoParametroDistribucionDto>> ObtenerParametrosAsync(int empresaId, int usuarioId, bool esAdmin);
    Task<GranoParametroDistribucionDto> GuardarParametroAsync(GuardarGranoParametroDistribucionRequest request, int usuarioId, bool esAdmin);
}

/// <summary>
/// Catalogos de Distribucion (transportistas, choferes, camiones y destinos) y parametros por grano.
/// Los catalogos no se borran: se desactivan, porque los envios historicos los referencian.
/// Alta y edicion: Encargado y Empleado Administrativo. Parametros: Gerente y Encargado.
/// </summary>
public class DistribucionCatalogoRepository(IConfiguration configuration) : IDistribucionCatalogoRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    // =====================================================================
    // Transportistas
    // =====================================================================

    public async Task<IReadOnlyList<TransportistaDto>> ObtenerTransportistasAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin)
    {
        const string sql = """
            SELECT TransportistaId, EmpresaId, RazonSocial, Cuit, Telefono, Activo
            FROM dbo.Transportistas
            WHERE EmpresaId = @EmpresaId AND (@IncluirInactivos = 1 OR Activo = 1)
            ORDER BY RazonSocial;
            """;
        return await LeerAsync(sql, empresaId, incluirInactivos, usuarioId, esAdmin, null, r => new TransportistaDto
        {
            TransportistaId = r.GetInt32(0),
            EmpresaId = r.GetInt32(1),
            RazonSocial = r.GetString(2),
            Cuit = r.IsDBNull(3) ? null : r.GetString(3),
            Telefono = r.IsDBNull(4) ? null : r.GetString(4),
            Activo = r.GetBoolean(5),
        });
    }

    public async Task<TransportistaDto> GuardarTransportistaAsync(int? transportistaId, GuardarTransportistaRequest request, int usuarioId, bool esAdmin)
    {
        const string insert = """
            INSERT INTO dbo.Transportistas (EmpresaId, RazonSocial, Cuit, Telefono, Activo)
            OUTPUT INSERTED.TransportistaId
            VALUES (@EmpresaId, @RazonSocial, @Cuit, @Telefono, @Activo);
            """;
        const string update = """
            UPDATE dbo.Transportistas
            SET RazonSocial = @RazonSocial, Cuit = @Cuit, Telefono = @Telefono, Activo = @Activo, FechaModificacion = SYSDATETIME()
            OUTPUT INSERTED.TransportistaId
            WHERE TransportistaId = @Id AND EmpresaId = @EmpresaId;
            """;

        var id = await GuardarAsync(transportistaId is null ? insert : update, transportistaId, request.EmpresaId, usuarioId, esAdmin,
            "Ya existe un transportista con esa razon social.", command =>
            {
                command.Parameters.AddWithValue("@RazonSocial", request.RazonSocial.Trim());
                command.Parameters.AddWithValue("@Cuit", TextoONull(request.Cuit));
                command.Parameters.AddWithValue("@Telefono", TextoONull(request.Telefono));
                command.Parameters.AddWithValue("@Activo", request.Activo);
            });

        return (await ObtenerTransportistasAsync(request.EmpresaId, true, usuarioId, true)).First(t => t.TransportistaId == id);
    }

    // =====================================================================
    // Choferes
    // =====================================================================

    public async Task<IReadOnlyList<ChoferDto>> ObtenerChoferesAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin)
    {
        const string sql = """
            SELECT c.ChoferId, c.EmpresaId, c.TransportistaId, t.RazonSocial, c.Nombre, c.Apellido, c.Dni, c.Telefono, c.Activo
            FROM dbo.Choferes AS c
            LEFT JOIN dbo.Transportistas AS t ON t.TransportistaId = c.TransportistaId
            WHERE c.EmpresaId = @EmpresaId AND (@IncluirInactivos = 1 OR c.Activo = 1)
            ORDER BY c.Apellido, c.Nombre;
            """;
        return await LeerAsync(sql, empresaId, incluirInactivos, usuarioId, esAdmin, null, r => new ChoferDto
        {
            ChoferId = r.GetInt32(0),
            EmpresaId = r.GetInt32(1),
            TransportistaId = r.IsDBNull(2) ? null : r.GetInt32(2),
            Transportista = r.IsDBNull(3) ? null : r.GetString(3),
            Nombre = r.GetString(4),
            Apellido = r.GetString(5),
            Dni = r.GetString(6),
            Telefono = r.GetString(7),
            Activo = r.GetBoolean(8),
        });
    }

    public async Task<ChoferDto> GuardarChoferAsync(int? choferId, GuardarChoferRequest request, int usuarioId, bool esAdmin)
    {
        const string insert = """
            INSERT INTO dbo.Choferes (EmpresaId, TransportistaId, Nombre, Apellido, Dni, Telefono, Activo)
            OUTPUT INSERTED.ChoferId
            VALUES (@EmpresaId, @TransportistaId, @Nombre, @Apellido, @Dni, @Telefono, @Activo);
            """;
        const string update = """
            UPDATE dbo.Choferes
            SET TransportistaId = @TransportistaId, Nombre = @Nombre, Apellido = @Apellido, Dni = @Dni,
                Telefono = @Telefono, Activo = @Activo, FechaModificacion = SYSDATETIME()
            OUTPUT INSERTED.ChoferId
            WHERE ChoferId = @Id AND EmpresaId = @EmpresaId;
            """;

        var id = await GuardarAsync(choferId is null ? insert : update, choferId, request.EmpresaId, usuarioId, esAdmin,
            "Ya existe un chofer con ese DNI.", command =>
            {
                command.Parameters.AddWithValue("@TransportistaId", (object?)request.TransportistaId ?? DBNull.Value);
                command.Parameters.AddWithValue("@Nombre", request.Nombre.Trim());
                command.Parameters.AddWithValue("@Apellido", request.Apellido.Trim());
                command.Parameters.AddWithValue("@Dni", NormalizarDni(request.Dni));
                command.Parameters.AddWithValue("@Telefono", request.Telefono.Trim());
                command.Parameters.AddWithValue("@Activo", request.Activo);
            });

        return (await ObtenerChoferesAsync(request.EmpresaId, true, usuarioId, true)).First(c => c.ChoferId == id);
    }

    // =====================================================================
    // Camiones
    // =====================================================================

    public async Task<IReadOnlyList<CamionCatalogoDto>> ObtenerCamionesAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin)
    {
        const string sql = """
            SELECT c.CamionId, c.EmpresaId, c.TransportistaId, t.RazonSocial, c.Patente, c.Marca, c.Modelo, c.Activo
            FROM dbo.Camiones AS c
            LEFT JOIN dbo.Transportistas AS t ON t.TransportistaId = c.TransportistaId
            WHERE c.EmpresaId = @EmpresaId AND (@IncluirInactivos = 1 OR c.Activo = 1)
            ORDER BY c.Patente;
            """;
        return await LeerAsync(sql, empresaId, incluirInactivos, usuarioId, esAdmin, null, r => new CamionCatalogoDto
        {
            CamionId = r.GetInt32(0),
            EmpresaId = r.GetInt32(1),
            TransportistaId = r.IsDBNull(2) ? null : r.GetInt32(2),
            Transportista = r.IsDBNull(3) ? null : r.GetString(3),
            Patente = r.GetString(4),
            Marca = r.GetString(5),
            Modelo = r.GetString(6),
            Activo = r.GetBoolean(7),
        });
    }

    public async Task<CamionCatalogoDto> GuardarCamionAsync(int? camionId, GuardarCamionRequest request, int usuarioId, bool esAdmin)
    {
        const string insert = """
            INSERT INTO dbo.Camiones (EmpresaId, TransportistaId, Patente, Marca, Modelo, Activo)
            OUTPUT INSERTED.CamionId
            VALUES (@EmpresaId, @TransportistaId, @Patente, @Marca, @Modelo, @Activo);
            """;
        const string update = """
            UPDATE dbo.Camiones
            SET TransportistaId = @TransportistaId, Patente = @Patente, Marca = @Marca, Modelo = @Modelo,
                Activo = @Activo, FechaModificacion = SYSDATETIME()
            OUTPUT INSERTED.CamionId
            WHERE CamionId = @Id AND EmpresaId = @EmpresaId;
            """;

        var id = await GuardarAsync(camionId is null ? insert : update, camionId, request.EmpresaId, usuarioId, esAdmin,
            "Ya existe un camion con esa patente.", command =>
            {
                command.Parameters.AddWithValue("@TransportistaId", (object?)request.TransportistaId ?? DBNull.Value);
                command.Parameters.AddWithValue("@Patente", NormalizarPatente(request.Patente));
                command.Parameters.AddWithValue("@Marca", request.Marca.Trim());
                command.Parameters.AddWithValue("@Modelo", request.Modelo.Trim());
                command.Parameters.AddWithValue("@Activo", request.Activo);
            });

        return (await ObtenerCamionesAsync(request.EmpresaId, true, usuarioId, true)).First(c => c.CamionId == id);
    }

    // =====================================================================
    // Destinos
    // =====================================================================

    public async Task<IReadOnlyList<DestinoDistribucionDto>> ObtenerDestinosAsync(int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin)
    {
        const string sql = """
            SELECT DestinoId, EmpresaId, Nombre, TipoDestino, Pais, Provincia, Ciudad, Activo
            FROM dbo.DestinosDistribucion
            WHERE EmpresaId = @EmpresaId AND (@IncluirInactivos = 1 OR Activo = 1)
            ORDER BY Nombre;
            """;
        return await LeerAsync(sql, empresaId, incluirInactivos, usuarioId, esAdmin, null, r => new DestinoDistribucionDto
        {
            DestinoId = r.GetInt32(0),
            EmpresaId = r.GetInt32(1),
            Nombre = r.GetString(2),
            TipoDestino = r.GetString(3),
            Pais = r.GetString(4),
            Provincia = r.GetString(5),
            Ciudad = r.GetString(6),
            Activo = r.GetBoolean(7),
        });
    }

    public async Task<DestinoDistribucionDto> GuardarDestinoAsync(int? destinoId, GuardarDestinoRequest request, int usuarioId, bool esAdmin)
    {
        const string insert = """
            INSERT INTO dbo.DestinosDistribucion (EmpresaId, Nombre, TipoDestino, Pais, Provincia, Ciudad, Activo)
            OUTPUT INSERTED.DestinoId
            VALUES (@EmpresaId, @Nombre, @TipoDestino, @Pais, @Provincia, @Ciudad, @Activo);
            """;
        const string update = """
            UPDATE dbo.DestinosDistribucion
            SET Nombre = @Nombre, TipoDestino = @TipoDestino, Pais = @Pais, Provincia = @Provincia, Ciudad = @Ciudad,
                Activo = @Activo, FechaModificacion = SYSDATETIME()
            OUTPUT INSERTED.DestinoId
            WHERE DestinoId = @Id AND EmpresaId = @EmpresaId;
            """;

        var id = await GuardarAsync(destinoId is null ? insert : update, destinoId, request.EmpresaId, usuarioId, esAdmin,
            "Ya existe un destino con ese nombre.", command =>
            {
                command.Parameters.AddWithValue("@Nombre", request.Nombre.Trim());
                command.Parameters.AddWithValue("@TipoDestino", request.TipoDestino.Trim());
                command.Parameters.AddWithValue("@Pais", request.Pais.Trim());
                command.Parameters.AddWithValue("@Provincia", request.Provincia.Trim());
                command.Parameters.AddWithValue("@Ciudad", request.Ciudad.Trim());
                command.Parameters.AddWithValue("@Activo", request.Activo);
            });

        return (await ObtenerDestinosAsync(request.EmpresaId, true, usuarioId, true)).First(d => d.DestinoId == id);
    }

    // =====================================================================
    // Parametros por grano
    // =====================================================================

    public async Task<IReadOnlyList<GranoParametroDistribucionDto>> ObtenerParametrosAsync(int empresaId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await ExigirAccesoAsync(connection, null, usuarioId, esAdmin, empresaId);

        var bases = new List<(string Producto, decimal Humedad)>();
        await using (var command = new SqlCommand("SELECT Producto, HumedadBase FROM dbo.GranoBasesComercializacion;", connection))
        await using (var r = await command.ExecuteReaderAsync())
        {
            while (await r.ReadAsync()) bases.Add((r.GetString(0), r.GetDecimal(1)));
        }

        var parametros = new List<GranoParametroDistribucionDto>();
        const string sql = """
            SELECT GranoParametroDistribucionId, Producto, ManipuleoPct, ToleranciaMateriasExtranasPct, DesvioMedioPp, DesvioAltoPp
            FROM dbo.GranoParametrosDistribucion WHERE EmpresaId = @EmpresaId;
            """;
        await using (var command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@EmpresaId", empresaId);
            await using var r = await command.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                parametros.Add(new GranoParametroDistribucionDto
                {
                    GranoParametroDistribucionId = r.GetInt32(0),
                    EmpresaId = empresaId,
                    Producto = r.GetString(1),
                    ManipuleoPct = r.GetDecimal(2),
                    ToleranciaMateriasExtranasPct = r.GetDecimal(3),
                    DesvioMedioPp = r.GetDecimal(4),
                    DesvioAltoPp = r.GetDecimal(5),
                });
            }
        }

        // Une ambas listas comparando el grano sin tildes ni mayusculas.
        foreach (var parametro in parametros)
        {
            var normalizado = CalculadoraMermaDistribucion.NormalizarGrano(parametro.Producto);
            parametro.HumedadBase = bases
                .Where(b => CalculadoraMermaDistribucion.NormalizarGrano(b.Producto) == normalizado)
                .Select(b => (decimal?)b.Humedad).FirstOrDefault();
        }

        foreach (var (producto, humedad) in bases)
        {
            var normalizado = CalculadoraMermaDistribucion.NormalizarGrano(producto);
            if (parametros.Any(p => CalculadoraMermaDistribucion.NormalizarGrano(p.Producto) == normalizado)) continue;
            parametros.Add(new GranoParametroDistribucionDto { EmpresaId = empresaId, Producto = producto, HumedadBase = humedad });
        }

        return parametros.OrderBy(p => p.Producto).ToList();
    }

    public async Task<GranoParametroDistribucionDto> GuardarParametroAsync(
        GuardarGranoParametroDistribucionRequest request, int usuarioId, bool esAdmin)
    {
        await using (var connection = new SqlConnection(_connectionString))
        {
            await connection.OpenAsync();
            await ExigirRolAsync(connection, null, usuarioId, esAdmin, request.EmpresaId, RolesParametros,
                "Solo el Gerente o el Encargado de la empresa pueden modificar los parametros de distribucion.");

            const string sql = """
                MERGE dbo.GranoParametrosDistribucion WITH (HOLDLOCK) AS destino
                USING (SELECT @EmpresaId AS EmpresaId, @Producto AS Producto) AS origen
                    ON destino.EmpresaId = origen.EmpresaId AND destino.Producto = origen.Producto
                WHEN MATCHED THEN
                    UPDATE SET ManipuleoPct = @Manipuleo, ToleranciaMateriasExtranasPct = @Tolerancia,
                               DesvioMedioPp = @Medio, DesvioAltoPp = @Alto,
                               ModificadoPorUsuarioId = @UsuarioId, FechaModificacion = SYSDATETIME()
                WHEN NOT MATCHED THEN
                    INSERT (EmpresaId, Producto, ManipuleoPct, ToleranciaMateriasExtranasPct, DesvioMedioPp, DesvioAltoPp, ModificadoPorUsuarioId)
                    VALUES (@EmpresaId, @Producto, @Manipuleo, @Tolerancia, @Medio, @Alto, @UsuarioId);
                """;
            await using var command = new SqlCommand(sql, connection);
            command.Parameters.AddWithValue("@EmpresaId", request.EmpresaId);
            command.Parameters.AddWithValue("@Producto", request.Producto.Trim());
            command.Parameters.AddWithValue("@Manipuleo", request.ManipuleoPct);
            command.Parameters.AddWithValue("@Tolerancia", request.ToleranciaMateriasExtranasPct);
            command.Parameters.AddWithValue("@Medio", request.DesvioMedioPp);
            command.Parameters.AddWithValue("@Alto", request.DesvioAltoPp);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
            await command.ExecuteNonQueryAsync();
        }

        var normalizado = CalculadoraMermaDistribucion.NormalizarGrano(request.Producto);
        return (await ObtenerParametrosAsync(request.EmpresaId, usuarioId, esAdmin: true))
            .First(p => CalculadoraMermaDistribucion.NormalizarGrano(p.Producto) == normalizado);
    }

    // =====================================================================
    // Utilidades
    // =====================================================================

    private async Task<IReadOnlyList<T>> LeerAsync<T>(
        string sql, int empresaId, bool incluirInactivos, int usuarioId, bool esAdmin,
        SqlTransaction? transaction, Func<SqlDataReader, T> mapear)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await ExigirAccesoAsync(connection, transaction, usuarioId, esAdmin, empresaId);

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@IncluirInactivos", incluirInactivos);

        var lista = new List<T>();
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync()) lista.Add(mapear(r));
        return lista;
    }

    /// <summary>
    /// Alta (id null) o edicion de un catalogo. Exige gestion en la empresa y traduce los errores
    /// de SQL: duplicado = 409, FK/CHECK = 400 (por ejemplo, un transportista de otra empresa).
    /// </summary>
    private async Task<int> GuardarAsync(
        string sql, int? id, int empresaId, int usuarioId, bool esAdmin, string mensajeDuplicado, Action<SqlCommand> parametros)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await DistribucionAcceso.ExigirGestionAsync(connection, null, usuarioId, esAdmin, empresaId);

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@Id", (object?)id ?? DBNull.Value);
        parametros(command);

        try
        {
            var resultado = await command.ExecuteScalarAsync();
            return resultado as int? ?? throw new KeyNotFoundException("El registro no existe en la empresa indicada.");
        }
        catch (SqlException ex) when (EsDuplicado(ex))
        {
            throw new ConflictoDistribucionException(mensajeDuplicado);
        }
        catch (SqlException ex) when (EsRestriccion(ex))
        {
            throw new InvalidOperationException("Algun dato no es valido para la empresa (por ejemplo, un transportista de otra empresa).");
        }
    }

    /// <summary>"AB 123 CD" y "ab-123-cd" se guardan como AB123CD.</summary>
    public static string NormalizarPatente(string patente) =>
        new string(patente.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    /// <summary>"30.123.456" se guarda como 30123456.</summary>
    public static string NormalizarDni(string dni) => new string(dni.Where(char.IsDigit).ToArray());
}
