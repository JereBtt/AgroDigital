using AgroDigital.Api.Dtos;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

/*
    Parametros de almacenamiento por grano (rediseno de Silos, paso 4).

    - dbo.GranoParametrosAlmacenamiento: criterio agronomico de cada empresa,
      por grano y tipo de silo (umbral de humedad, margen de temperatura,
      frecuencia de control). No se precarga: lo define el ingeniero.
    - dbo.GranoBasesComercializacion: humedad base normativa, global y de solo
      lectura. Se muestra como referencia, pero NO es el umbral de alerta.

    Lectura: cualquier usuario de la empresa. Escritura: Gerente o Encargado
    de esa empresa (o Admin).
*/
public class GranoParametroRepository(IConfiguration configuration) : IGranoParametroRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    private const string SelectBase = """
        SELECT p.GranoParametroAlmacenamientoId, p.EmpresaId, p.Producto, p.TipoSilo,
               p.UmbralHumedad, p.MargenTemperaturaC, p.FrecuenciaControlDias,
               b.HumedadBase, COALESCE(p.FechaModificacion, p.FechaCreacion)
        FROM dbo.GranoParametrosAlmacenamiento AS p
        LEFT JOIN dbo.GranoBasesComercializacion AS b ON b.Producto = p.Producto
        """;

    private const string PuedeEditar = """
        (@IncluirTodos = 1 OR EXISTS (
            SELECT 1 FROM dbo.UsuarioEmpresas AS ue
            WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = @EmpresaId AND ue.Activo = 1
              AND ue.Rol IN (N'Gerente', N'Encargado')))
        """;

    public async Task<IReadOnlyList<GranoParametroDto>> ObtenerAsync(int? empresaId, int usuarioId, bool incluirTodos)
    {
        var sql = SelectBase + """
             WHERE (@IncluirTodos = 1 OR EXISTS (
                    SELECT 1 FROM dbo.UsuarioEmpresas AS ue
                    WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = p.EmpresaId AND ue.Activo = 1))
               AND (@EmpresaId IS NULL OR p.EmpresaId = @EmpresaId)
             ORDER BY p.Producto, p.TipoSilo;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        command.Parameters.AddWithValue("@EmpresaId", (object?)empresaId ?? DBNull.Value);

        await using var reader = await command.ExecuteReaderAsync();
        var parametros = new List<GranoParametroDto>();
        while (await reader.ReadAsync())
        {
            parametros.Add(Mapear(reader));
        }

        return parametros;
    }

    public async Task<IReadOnlyList<GranoBaseComercializacionDto>> ObtenerBasesAsync()
    {
        const string sql = """
            SELECT Producto, HumedadBase, FuenteNormativa
            FROM dbo.GranoBasesComercializacion
            ORDER BY Producto;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var bases = new List<GranoBaseComercializacionDto>();
        while (await reader.ReadAsync())
        {
            bases.Add(new GranoBaseComercializacionDto
            {
                Producto = reader.GetString(0),
                HumedadBase = reader.GetDecimal(1),
                FuenteNormativa = reader.GetString(2),
            });
        }

        return bases;
    }

    public async Task<GranoParametroDto?> GuardarAsync(GuardarGranoParametroRequest request, int usuarioId, bool incluirTodos)
    {
        var sql = $"""
            IF NOT {PuedeEditar}
            BEGIN
                SELECT CAST(NULL AS INT);
                RETURN;
            END;

            MERGE dbo.GranoParametrosAlmacenamiento WITH (HOLDLOCK) AS destino
            USING (SELECT @EmpresaId AS EmpresaId, @Producto AS Producto, @TipoSilo AS TipoSilo) AS origen
               ON destino.EmpresaId = origen.EmpresaId
              AND destino.Producto = origen.Producto
              AND destino.TipoSilo = origen.TipoSilo
            WHEN MATCHED THEN
                UPDATE SET UmbralHumedad = @UmbralHumedad,
                           MargenTemperaturaC = @MargenTemperaturaC,
                           FrecuenciaControlDias = @FrecuenciaControlDias,
                           ModificadoPorUsuarioId = @ModificadoPor,
                           FechaModificacion = SYSDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (EmpresaId, Producto, TipoSilo, UmbralHumedad, MargenTemperaturaC, FrecuenciaControlDias, ModificadoPorUsuarioId)
                VALUES (@EmpresaId, @Producto, @TipoSilo, @UmbralHumedad, @MargenTemperaturaC, @FrecuenciaControlDias, @ModificadoPor)
            OUTPUT INSERTED.GranoParametroAlmacenamientoId;
            """;

        int? id;
        await using (var connection = new SqlConnection(_connectionString))
        {
            await connection.OpenAsync();
            await using var command = new SqlCommand(sql, connection);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId);
            command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
            command.Parameters.AddWithValue("@EmpresaId", request.EmpresaId);
            command.Parameters.AddWithValue("@Producto", request.Producto.Trim());
            command.Parameters.AddWithValue("@TipoSilo", request.TipoSilo.Trim());
            command.Parameters.AddWithValue("@UmbralHumedad", request.UmbralHumedad);
            command.Parameters.AddWithValue("@MargenTemperaturaC", request.MargenTemperaturaC);
            command.Parameters.AddWithValue("@FrecuenciaControlDias", request.FrecuenciaControlDias);
            command.Parameters.AddWithValue("@ModificadoPor", usuarioId > 0 ? usuarioId : DBNull.Value);

            var resultado = await command.ExecuteScalarAsync();
            id = resultado is null or DBNull ? null : Convert.ToInt32(resultado);
        }

        if (id is null)
        {
            return null;
        }

        var guardados = await ObtenerAsync(request.EmpresaId, usuarioId, incluirTodos: true);
        return guardados.FirstOrDefault(p => p.GranoParametroAlmacenamientoId == id);
    }

    public async Task<bool> EliminarAsync(int granoParametroId, int usuarioId, bool incluirTodos)
    {
        var sql = $"""
            DECLARE @EmpresaId INT =
                (SELECT EmpresaId FROM dbo.GranoParametrosAlmacenamiento WHERE GranoParametroAlmacenamientoId = @Id);

            IF @EmpresaId IS NULL OR NOT {PuedeEditar}
            BEGIN
                SELECT CAST(0 AS INT);
                RETURN;
            END;

            DELETE FROM dbo.GranoParametrosAlmacenamiento WHERE GranoParametroAlmacenamientoId = @Id;
            SELECT @@ROWCOUNT;
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", granoParametroId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
        return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
    }

    private static GranoParametroDto Mapear(SqlDataReader reader) => new()
    {
        GranoParametroAlmacenamientoId = reader.GetInt32(0),
        EmpresaId = reader.GetInt32(1),
        Producto = reader.GetString(2),
        TipoSilo = reader.GetString(3),
        UmbralHumedad = reader.GetDecimal(4),
        MargenTemperaturaC = reader.GetDecimal(5),
        FrecuenciaControlDias = reader.GetInt16(6),
        HumedadBaseComercializacion = reader.IsDBNull(7) ? null : reader.GetDecimal(7),
        FechaModificacion = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
    };
}
