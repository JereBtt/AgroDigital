using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

/*
    Tolerancias de perdida de cosecha por grano (29_cosechas_rediseno.sql).

    - dbo.GranoToleranciasCosecha: referencia global INTA PRECOP, solo lectura.
    - dbo.GranoParametrosCosecha: ajuste opcional de cada empresa.

    Si la empresa no ajusta un grano, se usa la referencia con el factor de
    severidad por defecto. Los permisos los valida el controller.
*/
public class GranoParametroCosechaRepository(IConfiguration configuration) : IGranoParametroCosechaRepository
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<IReadOnlyList<GranoParametroCosechaDto>> ObtenerAsync(int empresaId)
    {
        const string sql = """
            SELECT p.GranoParametroCosechaId,
                   COALESCE(p.Producto, g.Producto) AS Producto,
                   COALESCE(p.ToleranciaKgHa, g.ToleranciaKgHa) AS ToleranciaKgHa,
                   COALESCE(p.FactorAlta, CAST(@FactorDefecto AS DECIMAL(4,2))) AS FactorAlta,
                   g.ToleranciaKgHa AS ToleranciaReferenciaKgHa,
                   g.PmgReferenciaG,
                   g.FuenteReferencia,
                   COALESCE(p.FechaModificacion, p.FechaCreacion) AS FechaModificacion
            FROM dbo.GranoToleranciasCosecha AS g
            FULL OUTER JOIN (
                SELECT * FROM dbo.GranoParametrosCosecha WHERE EmpresaId = @EmpresaId
            ) AS p ON p.Producto = g.Producto
            ORDER BY COALESCE(p.Producto, g.Producto);
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@FactorDefecto", CalculadoraPerdidasCosecha.FactorAltaPorDefecto);
        await using var reader = await command.ExecuteReaderAsync();

        var parametros = new List<GranoParametroCosechaDto>();
        while (await reader.ReadAsync())
        {
            var tolerancia = reader.GetDecimal(2);
            var factor = reader.GetDecimal(3);
            parametros.Add(new GranoParametroCosechaDto
            {
                GranoParametroCosechaId = reader.IsDBNull(0) ? null : reader.GetInt32(0),
                EmpresaId = empresaId,
                Producto = reader.GetString(1),
                ToleranciaKgHa = tolerancia,
                FactorAlta = factor,
                LimiteMediaKgHa = decimal.Round(tolerancia * factor, 2),
                Personalizado = !reader.IsDBNull(0),
                ToleranciaReferenciaKgHa = reader.IsDBNull(4) ? null : reader.GetDecimal(4),
                PmgReferenciaG = reader.IsDBNull(5) ? null : reader.GetDecimal(5),
                FuenteReferencia = reader.IsDBNull(6) ? null : reader.GetString(6),
                FechaModificacion = reader.IsDBNull(7) ? null : reader.GetDateTime(7)
            });
        }

        return parametros;
    }

    public async Task<GranoParametroCosechaDto> GuardarAsync(GuardarGranoParametroCosechaRequest request, int usuarioId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        // "Maíz" y "Maiz" son el mismo grano: si coincide con una referencia se guarda con su nombre.
        var producto = await ResolverNombreGranoAsync(connection, request.Producto);

        const string sql = """
            UPDATE dbo.GranoParametrosCosecha WITH (HOLDLOCK)
            SET ToleranciaKgHa = @ToleranciaKgHa,
                FactorAlta = @FactorAlta,
                ModificadoPorUsuarioId = @UsuarioId,
                FechaModificacion = SYSDATETIME()
            WHERE EmpresaId = @EmpresaId AND Producto = @Producto;

            IF @@ROWCOUNT = 0
                INSERT INTO dbo.GranoParametrosCosecha (EmpresaId, Producto, ToleranciaKgHa, FactorAlta, ModificadoPorUsuarioId)
                VALUES (@EmpresaId, @Producto, @ToleranciaKgHa, @FactorAlta, @UsuarioId);
            """;

        await using (var command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@EmpresaId", request.EmpresaId);
            command.Parameters.AddWithValue("@Producto", producto);
            command.Parameters.AddWithValue("@ToleranciaKgHa", request.ToleranciaKgHa);
            command.Parameters.AddWithValue("@FactorAlta", request.FactorAlta);
            command.Parameters.AddWithValue("@UsuarioId", usuarioId > 0 ? usuarioId : DBNull.Value);
            await command.ExecuteNonQueryAsync();
        }

        return (await ObtenerAsync(request.EmpresaId)).First(p => p.Producto == producto);
    }

    public async Task<int?> ObtenerEmpresaIdAsync(int granoParametroCosechaId)
    {
        const string sql = "SELECT EmpresaId FROM dbo.GranoParametrosCosecha WHERE GranoParametroCosechaId = @Id;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", granoParametroCosechaId);
        return await command.ExecuteScalarAsync() is int empresaId ? empresaId : null;
    }

    public async Task<bool> EliminarAsync(int granoParametroCosechaId)
    {
        const string sql = "DELETE FROM dbo.GranoParametrosCosecha WHERE GranoParametroCosechaId = @Id;";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", granoParametroCosechaId);
        return await command.ExecuteNonQueryAsync() > 0;
    }

    private static async Task<string> ResolverNombreGranoAsync(SqlConnection connection, string producto)
    {
        var buscado = CalculadoraPerdidasCosecha.NormalizarGrano(producto);

        await using var command = new SqlCommand("SELECT Producto FROM dbo.GranoToleranciasCosecha;", connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var referencia = reader.GetString(0);
            if (CalculadoraPerdidasCosecha.NormalizarGrano(referencia) == buscado)
            {
                return referencia;
            }
        }

        return producto.Trim();
    }
}
