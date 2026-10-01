using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Repositories;

/// <summary>Conflicto de datos unicos (CPE, patente, DNI...). El controller lo devuelve como HTTP 409.</summary>
public class ConflictoDistribucionException(string message) : Exception(message);

/// <summary>
/// Permisos del modulo Distribucion (Manual de Usuario, seccion Roles):
///   - Consulta: cualquier usuario activo de la empresa.
///   - Alta, edicion, recepcion, conciliacion, documentos y catalogos: Encargado y Empleado Administrativo.
///   - Parametros por grano: Gerente y Encargado (mismo criterio que los de Almacenamiento).
///   - Indicadores agregados de merma: Gerente y Encargado.
/// Admin (incluirTodos) puede todo.
/// Convencion de errores: KeyNotFoundException = no existe o no es de tus empresas (404);
/// UnauthorizedAccessException = existe pero tu rol no lo permite (403).
/// </summary>
internal static class DistribucionAcceso
{
    public static readonly string[] RolesGestion = ["Encargado", "EmpleadoAdministrativo"];
    public static readonly string[] RolesParametros = ["Gerente", "Encargado"];
    public static readonly string[] RolesIndicadoresAgregados = ["Gerente", "Encargado"];

    /// <summary>Filtro SQL de acceso por empresa. Requiere @UsuarioId y @IncluirTodos.</summary>
    public static string Filtro(string columnaEmpresa) => $"""
        (@IncluirTodos = 1 OR EXISTS (
            SELECT 1 FROM dbo.UsuarioEmpresas AS ue
            WHERE ue.UsuarioId = @UsuarioId AND ue.EmpresaId = {columnaEmpresa} AND ue.Activo = 1))
        """;

    public static void AgregarParametros(SqlCommand command, int usuarioId, bool incluirTodos)
    {
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@IncluirTodos", incluirTodos);
    }

    public static async Task<string?> ObtenerRolAsync(
        SqlConnection connection, SqlTransaction? transaction, int usuarioId, int empresaId)
    {
        const string sql = """
            SELECT TOP (1) Rol
            FROM dbo.UsuarioEmpresas
            WHERE UsuarioId = @UsuarioId AND EmpresaId = @EmpresaId AND Activo = 1;
            """;

        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        return await command.ExecuteScalarAsync() as string;
    }

    /// <summary>Exige pertenecer a la empresa con alguno de los roles indicados.</summary>
    public static async Task ExigirRolAsync(
        SqlConnection connection, SqlTransaction? transaction, int usuarioId, bool esAdmin, int empresaId,
        string[] roles, string mensaje)
    {
        if (esAdmin) return;

        var rol = await ObtenerRolAsync(connection, transaction, usuarioId, empresaId)
            ?? throw new KeyNotFoundException("La empresa indicada no existe o no pertenece a tus empresas.");

        if (!roles.Contains(rol))
        {
            throw new UnauthorizedAccessException(mensaje);
        }
    }

    public static Task ExigirGestionAsync(
        SqlConnection connection, SqlTransaction? transaction, int usuarioId, bool esAdmin, int empresaId) =>
        ExigirRolAsync(connection, transaction, usuarioId, esAdmin, empresaId, RolesGestion,
            "Solo el Encargado o el Empleado Administrativo pueden gestionar la distribucion.");

    /// <summary>Exige solo pertenecer a la empresa (consulta).</summary>
    public static async Task ExigirAccesoAsync(
        SqlConnection connection, SqlTransaction? transaction, int usuarioId, bool esAdmin, int empresaId)
    {
        if (esAdmin) return;
        _ = await ObtenerRolAsync(connection, transaction, usuarioId, empresaId)
            ?? throw new KeyNotFoundException("La empresa indicada no existe o no pertenece a tus empresas.");
    }

    // Lectura de columnas por nombre (la vista tiene muchas columnas: evita errores de indice).
    public static int? IntN(SqlDataReader r, string columna) { var i = r.GetOrdinal(columna); return r.IsDBNull(i) ? null : r.GetInt32(i); }
    public static decimal? DecN(SqlDataReader r, string columna) { var i = r.GetOrdinal(columna); return r.IsDBNull(i) ? null : r.GetDecimal(i); }
    public static string? StrN(SqlDataReader r, string columna) { var i = r.GetOrdinal(columna); return r.IsDBNull(i) ? null : r.GetString(i); }
    public static DateOnly? FechaN(SqlDataReader r, string columna) { var i = r.GetOrdinal(columna); return r.IsDBNull(i) ? null : DateOnly.FromDateTime(r.GetDateTime(i)); }

    public static object TextoONull(string? valor) => string.IsNullOrWhiteSpace(valor) ? DBNull.Value : valor.Trim();

    /// <summary>Violacion de UNIQUE (2627) o de indice unico (2601).</summary>
    public static bool EsDuplicado(SqlException ex) => ex.Number is 2627 or 2601;

    /// <summary>Violacion de FOREIGN KEY o CHECK.</summary>
    public static bool EsRestriccion(SqlException ex) => ex.Number == 547;
}
