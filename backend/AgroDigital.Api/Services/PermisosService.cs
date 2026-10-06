using Microsoft.Data.SqlClient;

namespace AgroDigital.Api.Services;

/*
    Permisos por rol en los módulos operativos (28_permisos_autor_seguimientos.sql).

    El permiso depende del ROL DEL USUARIO EN LA EMPRESA del registro (UsuarioEmpresas.Rol):
    una misma persona puede ser Encargado en una empresa y Empleado de campo en otra.

    Matriz:
      Estructura        Lotes, Campañas, Siembras, Cosechas, Silos, parámetros de grano,
                        finalizar etapas y bajas ............... Gerente, Encargado
      RegistroCampo     Seguimiento de siembra, tirada de aros, partes de cosecha y control de silo
                        ........................................ Gerente, Encargado, Empleado de campo
                        (el Empleado de campo solo edita o elimina lo que cargó él)
      MovimientoGrano   Almacenamiento y Distribución .......... Gerente, Encargado, Empleado administrativo
      (consulta)        Cualquier rol con acceso a la empresa.

    El Admin no tiene restricciones (panel interno / "Ver sistema operativo").
*/

/// <summary>Grupos de roles de la matriz de permisos.</summary>
public static class RolesPermiso
{
    public static readonly string[] Estructura = ["Gerente", "Encargado"];
    public static readonly string[] RegistroCampo = ["Gerente", "Encargado", "EmpleadoCampo"];
    public static readonly string[] MovimientoGrano = ["Gerente", "Encargado", "EmpleadoAdministrativo"];
}

/// <summary>Registros operativos a partir de los cuales se averigua la empresa.</summary>
public enum RecursoOperativo
{
    Empresa,
    Lote,
    Campania,
    Siembra,
    Seguimiento,
    Cosecha,
    TiradaAros,
    ParteCosecha,
    Silo,
    ControlSilo,
    Almacenamiento,
    Distribucion,
    GranoParametro
}

/// <summary>El rol del usuario en la empresa no permite la accion. Se responde 403.</summary>
public sealed class PermisoDenegadoException(string message) : UnauthorizedAccessException(message);

/// <summary>El registro no existe o el usuario no tiene acceso a su empresa. Se responde 404.</summary>
public sealed class RecursoNoEncontradoException(string message) : Exception(message);

public interface IPermisosService
{
    /// <summary>Exige que el rol del usuario en la empresa del registro este en roles. Devuelve el rol.</summary>
    Task<string> ExigirAsync(AuthenticatedUser usuario, RecursoOperativo recurso, int id, IReadOnlyCollection<string> roles, string accion);

    /// <summary>Igual que ExigirAsync, para altas que van a la empresa principal del usuario (ej. un lote nuevo).</summary>
    Task<string> ExigirEnEmpresaPrincipalAsync(AuthenticatedUser usuario, IReadOnlyCollection<string> roles, string accion);

    /// <summary>
    /// Editar o eliminar un registro de campo (Seguimiento, TiradaAros, ControlSilo):
    /// Gerente y Encargado siempre; el Empleado de campo solo si lo cargo el.
    /// </summary>
    Task ExigirEdicionRegistroCampoAsync(AuthenticatedUser usuario, RecursoOperativo recurso, int id, string accion);
}

public sealed class PermisosService(IConfiguration configuration) : IPermisosService
{
    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    public async Task<string> ExigirAsync(AuthenticatedUser usuario, RecursoOperativo recurso, int id, IReadOnlyCollection<string> roles, string accion)
    {
        if (EsAdmin(usuario)) return "Admin";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var empresaId = await ObtenerEmpresaIdAsync(connection, recurso, id)
            ?? throw new RecursoNoEncontradoException("No se encontró el registro.");

        return await ExigirRolAsync(connection, usuario.UsuarioId, empresaId, roles, accion);
    }

    public async Task<string> ExigirEnEmpresaPrincipalAsync(AuthenticatedUser usuario, IReadOnlyCollection<string> roles, string accion)
    {
        if (EsAdmin(usuario)) return "Admin";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        // Misma regla que usa LoteRepository para asignar la empresa de un lote nuevo.
        const string sql = """
            SELECT TOP (1) COALESCE(u.EmpresaPrincipalId, ue.EmpresaId)
            FROM dbo.Usuarios AS u
            INNER JOIN dbo.UsuarioEmpresas AS ue ON ue.UsuarioId = u.UsuarioId AND ue.Activo = 1
            WHERE u.UsuarioId = @UsuarioId
            ORDER BY CASE WHEN ue.EmpresaId = u.EmpresaPrincipalId THEN 0 ELSE 1 END, ue.EmpresaId;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
        var resultado = await command.ExecuteScalarAsync();
        if (resultado is null or DBNull)
        {
            throw new PermisoDenegadoException("No tenés una empresa asignada para realizar esta acción.");
        }

        return await ExigirRolAsync(connection, usuario.UsuarioId, Convert.ToInt32(resultado), roles, accion);
    }

    public async Task ExigirEdicionRegistroCampoAsync(AuthenticatedUser usuario, RecursoOperativo recurso, int id, string accion)
    {
        var rol = await ExigirAsync(usuario, recurso, id, RolesPermiso.RegistroCampo, accion);
        if (rol != "EmpleadoCampo") return;

        var sql = recurso switch
        {
            RecursoOperativo.Seguimiento => "SELECT CreadoPorUsuarioId FROM dbo.SiembraSeguimientos WHERE SiembraSeguimientoId = @Id;",
            RecursoOperativo.TiradaAros => "SELECT CreadoPorUsuarioId FROM dbo.CosechaTiradaAros WHERE CosechaTiradaAroId = @Id;",
            RecursoOperativo.ParteCosecha => "SELECT CreadoPorUsuarioId FROM dbo.CosechaPartes WHERE CosechaParteId = @Id;",
            RecursoOperativo.ControlSilo => "SELECT CreadoPorUsuarioId FROM dbo.SiloControles WHERE SiloControlId = @Id;",
            _ => throw new ArgumentOutOfRangeException(nameof(recurso), "Solo aplica a registros de campo.")
        };

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", id);
        var autor = await command.ExecuteScalarAsync();

        if (autor is null or DBNull || Convert.ToInt32(autor) != usuario.UsuarioId)
        {
            throw new PermisoDenegadoException("Como Empleado de campo solo podés modificar los registros que cargaste vos.");
        }
    }

    // =====================================================================

    private static bool EsAdmin(AuthenticatedUser usuario) => usuario.Rol == "Admin";

    private static async Task<string> ExigirRolAsync(
        SqlConnection connection, int usuarioId, int empresaId, IReadOnlyCollection<string> roles, string accion)
    {
        const string sql = """
            SELECT TOP (1) ue.Rol
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            WHERE ue.UsuarioId = @UsuarioId
              AND ue.EmpresaId = @EmpresaId
              AND ue.Activo = 1
              AND e.Activo = 1;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);

        // Sin acceso a la empresa: se responde como "no encontrado" para no revelar datos ajenos.
        if (await command.ExecuteScalarAsync() is not string rol)
        {
            throw new RecursoNoEncontradoException("No se encontró el registro.");
        }

        if (!roles.Contains(rol))
        {
            throw new PermisoDenegadoException($"Tu rol en esta empresa ({NombreRol(rol)}) no permite {accion}.");
        }

        return rol;
    }

    private static async Task<int?> ObtenerEmpresaIdAsync(SqlConnection connection, RecursoOperativo recurso, int id)
    {
        var sql = recurso switch
        {
            RecursoOperativo.Empresa => "SELECT EmpresaId FROM dbo.Empresas WHERE EmpresaId = @Id;",
            RecursoOperativo.Lote => "SELECT EmpresaId FROM dbo.Lotes WHERE LoteId = @Id;",
            RecursoOperativo.Campania => "SELECT EmpresaId FROM dbo.Campanias WHERE CampaniaId = @Id;",
            RecursoOperativo.Siembra => """
                SELECT l.EmpresaId FROM dbo.Siembras AS s
                INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
                WHERE s.SiembraId = @Id;
                """,
            RecursoOperativo.Seguimiento => """
                SELECT l.EmpresaId FROM dbo.SiembraSeguimientos AS ss
                INNER JOIN dbo.Siembras AS s ON s.SiembraId = ss.SiembraId
                INNER JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
                WHERE ss.SiembraSeguimientoId = @Id;
                """,
            RecursoOperativo.Cosecha => """
                SELECT l.EmpresaId FROM dbo.Cosechas AS c
                INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
                WHERE c.CosechaId = @Id;
                """,
            RecursoOperativo.TiradaAros => """
                SELECT l.EmpresaId FROM dbo.CosechaTiradaAros AS t
                INNER JOIN dbo.Cosechas AS c ON c.CosechaId = t.CosechaId
                INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
                WHERE t.CosechaTiradaAroId = @Id;
                """,
            RecursoOperativo.ParteCosecha => """
                SELECT l.EmpresaId FROM dbo.CosechaPartes AS p
                INNER JOIN dbo.Cosechas AS c ON c.CosechaId = p.CosechaId
                INNER JOIN dbo.Lotes AS l ON l.LoteId = c.LoteId
                WHERE p.CosechaParteId = @Id;
                """,
            RecursoOperativo.Silo => """
                SELECT COALESCE(s.EmpresaId, l.EmpresaId) FROM dbo.Silos AS s
                LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
                WHERE s.SiloId = @Id;
                """,
            RecursoOperativo.ControlSilo => """
                SELECT COALESCE(s.EmpresaId, l.EmpresaId) FROM dbo.SiloControles AS sc
                INNER JOIN dbo.Silos AS s ON s.SiloId = sc.SiloId
                LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
                WHERE sc.SiloControlId = @Id;
                """,
            RecursoOperativo.Almacenamiento => """
                SELECT COALESCE(a.EmpresaId, s.EmpresaId, l.EmpresaId) FROM dbo.Almacenamientos AS a
                LEFT JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
                LEFT JOIN dbo.Lotes AS l ON l.LoteId = s.LoteId
                WHERE a.AlmacenamientoId = @Id;
                """,
            RecursoOperativo.Distribucion => "SELECT EmpresaId FROM dbo.Distribuciones WHERE DistribucionId = @Id;",
            RecursoOperativo.GranoParametro => "SELECT EmpresaId FROM dbo.GranoParametrosAlmacenamiento WHERE GranoParametroAlmacenamientoId = @Id;",
            _ => throw new ArgumentOutOfRangeException(nameof(recurso))
        };

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@Id", id);
        var resultado = await command.ExecuteScalarAsync();
        return resultado is null or DBNull ? null : Convert.ToInt32(resultado);
    }

    private static string NombreRol(string rol) => rol switch
    {
        "EmpleadoCampo" => "Empleado de campo",
        "EmpleadoAdministrativo" => "Empleado administrativo",
        _ => rol
    };
}
