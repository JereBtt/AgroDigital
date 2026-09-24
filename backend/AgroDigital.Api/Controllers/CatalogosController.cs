using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/catalogos")]
public class CatalogosController(IConfiguration configuration, IAuthTokenService authTokenService) : ControllerBase
{
    private static readonly HashSet<string> TiposPermitidos = ["MarcaAgroquimico", "DrogaAgroquimico", "VariedadSemilla"];

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CatalogoValorResponse>>> Obtener([FromQuery] string? tipo)
    {
        if (!SesionValida()) return Unauthorized("Sesion no valida.");
        var connectionString = configuration.GetConnectionString("AgroDigital");
        if (string.IsNullOrWhiteSpace(connectionString)) return Problem("No se configuró la conexión a la base de datos.");

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand("""
            SELECT Tipo, Grano, Nombre
            FROM dbo.CatalogoValores
            WHERE (@Tipo IS NULL OR Tipo = @Tipo)
            ORDER BY Tipo, Grano, Nombre;
            """, connection);
        command.Parameters.Add("@Tipo", System.Data.SqlDbType.NVarChar, 40).Value =
            string.IsNullOrWhiteSpace(tipo) ? DBNull.Value : tipo.Trim();
        await using var reader = await command.ExecuteReaderAsync();
        var valores = new List<CatalogoValorResponse>();
        while (await reader.ReadAsync())
        {
            valores.Add(new CatalogoValorResponse(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }
        return Ok(valores);
    }

    [HttpPost]
    public async Task<ActionResult<CatalogoValorResponse>> Crear(CrearCatalogoValorRequest request)
    {
        if (!SesionValida()) return Unauthorized("Sesion no valida.");
        var tipo = request.Tipo?.Trim() ?? "";
        var grano = request.Grano?.Trim() ?? "";
        var nombre = request.Nombre?.Trim() ?? "";
        if (!TiposPermitidos.Contains(tipo)) return BadRequest("Tipo de catálogo inválido.");
        if (tipo == "VariedadSemilla" && string.IsNullOrWhiteSpace(grano)) return BadRequest("Selecciona primero un grano para agregar una variedad.");
        if (string.IsNullOrWhiteSpace(nombre) || nombre.Length > 100) return BadRequest("El nombre es obligatorio y admite hasta 100 caracteres.");
        if (tipo == "VariedadSemilla") nombre = nombre.ToUpperInvariant();

        var connectionString = configuration.GetConnectionString("AgroDigital");
        if (string.IsNullOrWhiteSpace(connectionString)) return Problem("No se configuró la conexión a la base de datos.");
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand("""
            IF NOT EXISTS (SELECT 1 FROM dbo.CatalogoValores WHERE Tipo = @Tipo AND Grano = @Grano AND Nombre = @Nombre)
                INSERT INTO dbo.CatalogoValores (Tipo, Grano, Nombre) VALUES (@Tipo, @Grano, @Nombre);
            """, connection);
        command.Parameters.AddWithValue("@Tipo", tipo);
        command.Parameters.AddWithValue("@Grano", tipo == "VariedadSemilla" ? grano : "");
        command.Parameters.AddWithValue("@Nombre", nombre);
        await command.ExecuteNonQueryAsync();
        return Ok(new CatalogoValorResponse(tipo, tipo == "VariedadSemilla" ? grano : "", nombre));
    }

    private bool SesionValida()
    {
        var header = Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            && authTokenService.TryValidate(header["Bearer ".Length..].Trim(), out var usuario)
            && usuario is not null;
    }
}

public record CrearCatalogoValorRequest(string? Tipo, string? Grano, string? Nombre);
public record CatalogoValorResponse(string Tipo, string Grano, string Nombre);
