using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Security.Cryptography;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/manager")]
public sealed class ManagerController(IConfiguration configuration, IAuthTokenService authTokenService, IPasswordHasher passwordHasher) : ControllerBase
{
    private static readonly HashSet<string> RolesPermitidos = new(StringComparer.OrdinalIgnoreCase)
    {
        "Encargado",
        "EmpleadoCampo",
        "EmpleadoAdministrativo"
    };

    private readonly string _connectionString =
        configuration.GetConnectionString("AgroDigital")
        ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");

    [HttpGet("contexto")]
    public async Task<ActionResult<ManagerContextResponse>> ObtenerContexto()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        const string sql = """
            SELECT
                g.Codigo,
                g.Nombre,
                ISNULL(u.EmpresaPrincipalId, 0) AS EmpresaPrincipalId,
                e.EmpresaId,
                e.Nombre,
                e.Activo,
                ISNULL((
                    SELECT COUNT(1)
                    FROM dbo.SolicitudesUsuario AS s
                    WHERE s.GrupoGestionId = g.GrupoGestionId
                      AND s.Estado = N'Pendiente'
                ), 0) AS SolicitudesPendientes
            FROM dbo.Usuarios AS u
            INNER JOIN dbo.GruposGestion AS g ON g.GerenteUsuarioId = u.UsuarioId AND g.Activo = 1
            INNER JOIN dbo.Empresas AS e ON e.GrupoGestionId = g.GrupoGestionId
            WHERE u.UsuarioId = @UsuarioId
            ORDER BY CASE WHEN e.EmpresaId = u.EmpresaPrincipalId THEN 0 ELSE 1 END, e.Nombre;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);

        await using var reader = await command.ExecuteReaderAsync();
        string? codigo = null;
        string? nombreGrupo = null;
        var empresaPrincipalId = 0;
        var solicitudesPendientes = 0;
        var empresas = new List<ManagerEmpresaDto>();

        while (await reader.ReadAsync())
        {
            codigo ??= reader.GetString(0);
            nombreGrupo ??= reader.GetString(1);
            empresaPrincipalId = reader.GetInt32(2);
            var empresaId = reader.GetInt32(3);
            solicitudesPendientes = reader.GetInt32(6);
            empresas.Add(new ManagerEmpresaDto(
                empresaId,
                reader.GetString(4),
                empresaId == empresaPrincipalId,
                reader.GetBoolean(5)
            ));
        }

        if (codigo is null || empresas.Count == 0)
        {
            return NotFound("No se encontro un grupo de gestion activo para este gerente.");
        }

        return Ok(new ManagerContextResponse(codigo, nombreGrupo ?? codigo, empresaPrincipalId, empresas, solicitudesPendientes));
    }


    [HttpPost("equipos")]
    public async Task<ActionResult> CrearEquipo([FromBody] ManagerEquipoRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        var nombre = NormalizarNombreEquipo(request.Nombre);
        if (string.IsNullOrWhiteSpace(nombre)) return BadRequest("Ingresa el nombre del equipo.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (await ExisteEquipoConNombreAsync(connection, grupoId.Value, nombre))
        {
            return BadRequest("Ya existe un equipo con ese nombre en tu grupo de gestion.");
        }

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            int empresaId;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.Empresas (GrupoGestionId, Nombre)
                OUTPUT INSERTED.EmpresaId
                VALUES (@GrupoGestionId, @Nombre);
                """, connection, (SqlTransaction)transaction))
            {
                insert.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
                insert.Parameters.AddWithValue("@Nombre", nombre);
                var createdEmpresaId = await insert.ExecuteScalarAsync();
                if (createdEmpresaId is null || createdEmpresaId == DBNull.Value) return StatusCode(500, "No se pudo crear el equipo.");
                empresaId = Convert.ToInt32(createdEmpresaId);
            }

            await VincularGerenteAlEquipoAsync(connection, (SqlTransaction)transaction, usuario.UsuarioId, empresaId);

            await using (var ensurePrincipal = new SqlCommand("""
                UPDATE dbo.Usuarios
                SET EmpresaPrincipalId = COALESCE(EmpresaPrincipalId, @EmpresaId),
                    FechaModificacion = SYSDATETIME()
                WHERE UsuarioId = @UsuarioId;
                """, connection, (SqlTransaction)transaction))
            {
                ensurePrincipal.Parameters.AddWithValue("@EmpresaId", empresaId);
                ensurePrincipal.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
                await ensurePrincipal.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return Ok(new { mensaje = "Equipo creado correctamente." });
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    [HttpPut("equipos/{empresaId:int}")]
    public async Task<ActionResult> ActualizarEquipo(int empresaId, [FromBody] ManagerEquipoRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        var nombre = NormalizarNombreEquipo(request.Nombre);
        if (string.IsNullOrWhiteSpace(nombre)) return BadRequest("Ingresa el nombre del equipo.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (!await EquipoPerteneceAlGrupoAsync(connection, grupoId.Value, empresaId, incluirInactivos: true))
        {
            return NotFound("No se encontro el equipo dentro de tu grupo de gestion.");
        }

        if (await ExisteEquipoConNombreAsync(connection, grupoId.Value, nombre, empresaId))
        {
            return BadRequest("Ya existe otro equipo con ese nombre en tu grupo de gestion.");
        }

        await using var command = new SqlCommand("""
            UPDATE dbo.Empresas
            SET Nombre = @Nombre,
                FechaModificacion = SYSDATETIME()
            WHERE EmpresaId = @EmpresaId AND GrupoGestionId = @GrupoGestionId;
            """, connection);
        command.Parameters.AddWithValue("@Nombre", nombre);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
        await command.ExecuteNonQueryAsync();

        return Ok(new { mensaje = "Equipo actualizado correctamente." });
    }

    [HttpPost("equipos/{empresaId:int}/deshabilitar")]
    public async Task<ActionResult> DeshabilitarEquipo(int empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (!await EquipoPerteneceAlGrupoAsync(connection, grupoId.Value, empresaId, incluirInactivos: false))
        {
            return NotFound("No se encontro un equipo activo dentro de tu grupo de gestion.");
        }

        var equiposActivos = await ContarEquiposActivosAsync(connection, grupoId.Value);
        if (equiposActivos <= 1)
        {
            return BadRequest("No podes deshabilitar el ultimo equipo activo del grupo de gestion.");
        }

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            await using (var disable = new SqlCommand("""
                UPDATE dbo.Empresas
                SET Activo = 0,
                    FechaModificacion = SYSDATETIME()
                WHERE EmpresaId = @EmpresaId AND GrupoGestionId = @GrupoGestionId;
                """, connection, (SqlTransaction)transaction))
            {
                disable.Parameters.AddWithValue("@EmpresaId", empresaId);
                disable.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
                await disable.ExecuteNonQueryAsync();
            }

            await using (var ensurePrincipal = new SqlCommand("""
                IF EXISTS (SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = @UsuarioId AND EmpresaPrincipalId = @EmpresaId)
                BEGIN
                    UPDATE dbo.Usuarios
                    SET EmpresaPrincipalId = (
                            SELECT TOP (1) EmpresaId
                            FROM dbo.Empresas
                            WHERE GrupoGestionId = @GrupoGestionId AND Activo = 1 AND EmpresaId <> @EmpresaId
                            ORDER BY FechaCreacion, EmpresaId
                        ),
                        FechaModificacion = SYSDATETIME()
                    WHERE UsuarioId = @UsuarioId;
                END;
                """, connection, (SqlTransaction)transaction))
            {
                ensurePrincipal.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
                ensurePrincipal.Parameters.AddWithValue("@EmpresaId", empresaId);
                ensurePrincipal.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
                await ensurePrincipal.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return Ok(new { mensaje = "Equipo deshabilitado correctamente." });
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    [HttpPost("equipos/{empresaId:int}/habilitar")]
    public async Task<ActionResult> HabilitarEquipo(int empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (!await EquipoPerteneceAlGrupoAsync(connection, grupoId.Value, empresaId, incluirInactivos: true))
        {
            return NotFound("No se encontro el equipo dentro de tu grupo de gestion.");
        }

        await using var command = new SqlCommand("""
            UPDATE dbo.Empresas
            SET Activo = 1,
                FechaModificacion = SYSDATETIME()
            WHERE EmpresaId = @EmpresaId AND GrupoGestionId = @GrupoGestionId;
            """, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
        await command.ExecuteNonQueryAsync();

        return Ok(new { mensaje = "Equipo habilitado correctamente." });
    }

    [HttpPost("equipos/{empresaId:int}/principal")]
    public async Task<ActionResult> MarcarEquipoPrincipal(int empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (!await EquipoPerteneceAlGrupoAsync(connection, grupoId.Value, empresaId, incluirInactivos: false))
        {
            return BadRequest("Solo podes marcar como principal un equipo activo de tu grupo de gestion.");
        }

        await using var command = new SqlCommand("""
            UPDATE dbo.Usuarios
            SET EmpresaPrincipalId = @EmpresaId,
                FechaModificacion = SYSDATETIME()
            WHERE UsuarioId = @UsuarioId;
            """, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);
        await command.ExecuteNonQueryAsync();

        return Ok(new { mensaje = "Equipo principal actualizado." });
    }

    [HttpGet("solicitudes")]
    public async Task<ActionResult<IReadOnlyList<SolicitudUsuarioDto>>> ObtenerSolicitudes()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        const string sql = """
            SELECT SolicitudUsuarioId, ISNULL(UsuarioId, 0), Nombre, Apellido, Telefono, CorreoElectronico, Estado, FechaCreacion
            FROM dbo.SolicitudesUsuario
            WHERE GrupoGestionId = @GrupoGestionId
              AND Estado = N'Pendiente'
            ORDER BY FechaCreacion DESC;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
        await using var reader = await command.ExecuteReaderAsync();
        var solicitudes = new List<SolicitudUsuarioDto>();

        while (await reader.ReadAsync())
        {
            solicitudes.Add(new SolicitudUsuarioDto(
                reader.GetInt32(0),
                reader.GetInt32(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6),
                reader.GetDateTime(7)
            ));
        }

        return Ok(solicitudes);
    }

    [HttpGet("usuarios")]
    public async Task<ActionResult<IReadOnlyList<ManagerUsuarioDto>>> ObtenerUsuarios()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        const string sql = """
            SELECT
                u.UsuarioId,
                u.Nombre,
                ISNULL(u.Apellido, N'') AS Apellido,
                ISNULL(u.Telefono, N'') AS Telefono,
                ISNULL(u.CorreoElectronico, u.Usuario) AS CorreoElectronico,
                u.Rol,
                u.Activo,
                COALESCE(s.FechaResolucion, u.FechaCreacion) AS FechaAlta,
                e.EmpresaId,
                e.Nombre AS EmpresaNombre,
                ue.Rol AS RolEquipo,
                ue.Activo AS AccesoActivo
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = ue.UsuarioId
            OUTER APPLY (
                SELECT TOP (1) FechaResolucion
                FROM dbo.SolicitudesUsuario
                WHERE GrupoGestionId = e.GrupoGestionId
                  AND UsuarioId = u.UsuarioId
                  AND Estado = N'Aprobada'
                ORDER BY FechaResolucion DESC
            ) AS s
            WHERE e.GrupoGestionId = @GrupoGestionId
              AND u.UsuarioId <> @GerenteUsuarioId
              AND u.Rol IN (N'Encargado', N'EmpleadoCampo', N'EmpleadoAdministrativo')
            ORDER BY u.Activo DESC, u.Nombre, u.Apellido, e.Nombre;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
        command.Parameters.AddWithValue("@GerenteUsuarioId", usuario.UsuarioId);

        await using var reader = await command.ExecuteReaderAsync();
        return Ok(await LeerUsuariosAsync(reader));
    }

    [HttpGet("equipos/{empresaId:int}/usuarios")]
    public async Task<ActionResult<IReadOnlyList<ManagerUsuarioDto>>> ObtenerUsuariosPorEquipo(int empresaId)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (!await EquipoPerteneceAlGrupoAsync(connection, grupoId.Value, empresaId, incluirInactivos: true))
        {
            return NotFound("No se encontro el equipo dentro de tu grupo de gestion.");
        }

        const string sql = """
            SELECT
                u.UsuarioId,
                u.Nombre,
                ISNULL(u.Apellido, N'') AS Apellido,
                ISNULL(u.Telefono, N'') AS Telefono,
                ISNULL(u.CorreoElectronico, u.Usuario) AS CorreoElectronico,
                u.Rol,
                u.Activo,
                COALESCE(s.FechaResolucion, u.FechaCreacion) AS FechaAlta,
                e.EmpresaId,
                e.Nombre AS EmpresaNombre,
                ue.Rol AS RolEquipo,
                ue.Activo AS AccesoActivo
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = ue.UsuarioId
            OUTER APPLY (
                SELECT TOP (1) FechaResolucion
                FROM dbo.SolicitudesUsuario
                WHERE GrupoGestionId = e.GrupoGestionId
                  AND UsuarioId = u.UsuarioId
                  AND Estado = N'Aprobada'
                ORDER BY FechaResolucion DESC
            ) AS s
            WHERE e.GrupoGestionId = @GrupoGestionId
              AND e.EmpresaId = @EmpresaId
              AND u.Rol <> N'Admin'
            ORDER BY CASE WHEN u.UsuarioId = @GerenteUsuarioId THEN 0 ELSE 1 END, u.Activo DESC, u.Nombre, u.Apellido;
            """;

        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        command.Parameters.AddWithValue("@GerenteUsuarioId", usuario.UsuarioId);

        await using var reader = await command.ExecuteReaderAsync();
        return Ok(await LeerUsuariosAsync(reader));
    }

    [HttpPost("usuarios/{usuarioId:int}/deshabilitar")]
    public Task<ActionResult> DeshabilitarUsuario(int usuarioId) => CambiarHabilitacionUsuario(usuarioId, false);

    [HttpPost("usuarios/{usuarioId:int}/habilitar")]
    public Task<ActionResult> HabilitarUsuario(int usuarioId) => CambiarHabilitacionUsuario(usuarioId, true);

    private async Task<ActionResult> CambiarHabilitacionUsuario(int usuarioId, bool activo)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");
        if (usuarioId == usuario.UsuarioId) return BadRequest("No podes modificar tu propio acceso desde esta pantalla.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        if (!await UsuarioPerteneceAlGrupoAsync(connection, grupoId.Value, usuarioId))
        {
            return NotFound("No se encontro el usuario dentro de tu grupo de gestion.");
        }

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            await using (var updateUser = new SqlCommand("""
                UPDATE dbo.Usuarios
                SET Activo = @Activo,
                    FechaModificacion = SYSDATETIME()
                WHERE UsuarioId = @UsuarioId
                  AND Rol IN (N'Encargado', N'EmpleadoCampo', N'EmpleadoAdministrativo');
                """, connection, (SqlTransaction)transaction))
            {
                updateUser.Parameters.AddWithValue("@Activo", activo);
                updateUser.Parameters.AddWithValue("@UsuarioId", usuarioId);
                await updateUser.ExecuteNonQueryAsync();
            }

            await using (var updateAccess = new SqlCommand("""
                UPDATE ue
                SET ue.Activo = @Activo,
                    ue.FechaModificacion = SYSDATETIME()
                FROM dbo.UsuarioEmpresas AS ue
                INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
                WHERE ue.UsuarioId = @UsuarioId
                  AND e.GrupoGestionId = @GrupoGestionId;
                """, connection, (SqlTransaction)transaction))
            {
                updateAccess.Parameters.AddWithValue("@Activo", activo);
                updateAccess.Parameters.AddWithValue("@UsuarioId", usuarioId);
                updateAccess.Parameters.AddWithValue("@GrupoGestionId", grupoId.Value);
                await updateAccess.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return Ok(new { mensaje = activo ? "Usuario habilitado correctamente." : "Usuario deshabilitado correctamente." });
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    [HttpPost("otp")]
    public async Task<ActionResult<ManagerOtpResponse>> GenerarOtp()
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        const string groupSql = """
            SELECT TOP (1) GrupoGestionId, Codigo
            FROM dbo.GruposGestion
            WHERE GerenteUsuarioId = @UsuarioId AND Activo = 1
            ORDER BY GrupoGestionId;
            """;

        await using var groupCommand = new SqlCommand(groupSql, connection);
        groupCommand.Parameters.AddWithValue("@UsuarioId", usuario.UsuarioId);

        await using var reader = await groupCommand.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return NotFound("No se encontro un grupo de gestion activo para este gerente.");
        }

        var grupoGestionId = reader.GetInt32(0);
        var grupoCodigo = reader.GetString(1);
        await reader.CloseAsync();

        var otp = CrearOtp();
        var vence = DateTime.UtcNow.AddDays(7);

        const string insertSql = """
            INSERT INTO dbo.GrupoGestionOtps
                (GrupoGestionId, GeneradoPorUsuarioId, CodigoOtpHash, FechaVencimiento)
            VALUES
                (@GrupoGestionId, @GeneradoPorUsuarioId, @CodigoOtpHash, @FechaVencimiento);
            """;

        await using var insertCommand = new SqlCommand(insertSql, connection);
        insertCommand.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        insertCommand.Parameters.AddWithValue("@GeneradoPorUsuarioId", usuario.UsuarioId);
        insertCommand.Parameters.AddWithValue("@CodigoOtpHash", passwordHasher.Hash(otp));
        insertCommand.Parameters.AddWithValue("@FechaVencimiento", vence);
        await insertCommand.ExecuteNonQueryAsync();

        return Ok(new ManagerOtpResponse(grupoCodigo, otp, vence));
    }

    [HttpPost("solicitudes/{solicitudId:int}/aprobar")]
    public async Task<ActionResult> AprobarSolicitud(int solicitudId, [FromBody] AprobarSolicitudUsuarioRequest request)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        var rolGeneral = NormalizarRol(request.RolGeneral);
        if (!RolesPermitidos.Contains(rolGeneral)) return BadRequest("Selecciona un rol valido.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        var empresas = request.AccesoATodas
            ? await ObtenerEmpresasDelGrupoAsync(connection, grupoId.Value, rolGeneral)
            : (request.Empresas ?? Array.Empty<EmpresaRolRequest>())
                .Select(item => new EmpresaRolRequest(item.EmpresaId, NormalizarRol(item.Rol)))
                .Where(item => RolesPermitidos.Contains(item.Rol))
                .ToArray();

        if (empresas.Count == 0) return BadRequest("Selecciona al menos una empresa/equipo para aprobar el acceso.");

        if (!await EmpresasPertenecenAlGrupoAsync(connection, grupoId.Value, empresas.Select(item => item.EmpresaId).Distinct().ToArray()))
        {
            return BadRequest("Una o mas empresas seleccionadas no pertenecen a tu grupo de gestion.");
        }

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            var solicitud = await ObtenerSolicitudPendienteAsync(connection, (SqlTransaction)transaction, grupoId.Value, solicitudId);
            if (solicitud is null)
            {
                await transaction.RollbackAsync();
                return NotFound("No se encontro una solicitud pendiente para aprobar.");
            }

            var empresaPrincipalId = empresas.First().EmpresaId;

            await using (var updateUser = new SqlCommand("""
                UPDATE dbo.Usuarios
                SET Rol = @RolGeneral,
                    Activo = 1,
                    EmpresaPrincipalId = @EmpresaPrincipalId,
                    FechaModificacion = SYSDATETIME()
                WHERE UsuarioId = @UsuarioId;
                """, connection, (SqlTransaction)transaction))
            {
                updateUser.Parameters.AddWithValue("@RolGeneral", rolGeneral);
                updateUser.Parameters.AddWithValue("@EmpresaPrincipalId", empresaPrincipalId);
                updateUser.Parameters.AddWithValue("@UsuarioId", solicitud.Value);
                await updateUser.ExecuteNonQueryAsync();
            }

            foreach (var empresa in empresas.GroupBy(item => item.EmpresaId).Select(group => group.First()))
            {
                await using var upsert = new SqlCommand("""
                    IF EXISTS (SELECT 1 FROM dbo.UsuarioEmpresas WHERE UsuarioId = @UsuarioId AND EmpresaId = @EmpresaId)
                    BEGIN
                        UPDATE dbo.UsuarioEmpresas
                        SET Rol = @Rol,
                            Activo = 1,
                            FechaModificacion = SYSDATETIME()
                        WHERE UsuarioId = @UsuarioId AND EmpresaId = @EmpresaId;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO dbo.UsuarioEmpresas (UsuarioId, EmpresaId, Rol)
                        VALUES (@UsuarioId, @EmpresaId, @Rol);
                    END;
                    """, connection, (SqlTransaction)transaction);
                upsert.Parameters.AddWithValue("@UsuarioId", solicitud.Value);
                upsert.Parameters.AddWithValue("@EmpresaId", empresa.EmpresaId);
                upsert.Parameters.AddWithValue("@Rol", empresa.Rol);
                await upsert.ExecuteNonQueryAsync();
            }

            await CambiarEstadoSolicitudAsync(connection, (SqlTransaction)transaction, solicitudId, "Aprobada", usuario.UsuarioId);
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Solicitud aprobada correctamente." });
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    [HttpPost("solicitudes/{solicitudId:int}/rechazar")]
    public Task<ActionResult> RechazarSolicitud(int solicitudId) => ResolverSolicitud(solicitudId, "Rechazada");

    [HttpPost("solicitudes/{solicitudId:int}/descartar")]
    public Task<ActionResult> DescartarSolicitud(int solicitudId) => ResolverSolicitud(solicitudId, "Descartada");

    private async Task<ActionResult> ResolverSolicitud(int solicitudId, string estado)
    {
        if (!TryGetAuthenticatedUser(out var usuario, out var error)) return error;
        if (usuario.Rol != "Gerente") return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede realizar esta accion.");

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var grupoId = await ObtenerGrupoGestionIdAsync(connection, usuario.UsuarioId);
        if (grupoId is null) return NotFound("No se encontro un grupo de gestion activo para este gerente.");

        await using var transaction = await connection.BeginTransactionAsync();
        var solicitud = await ObtenerSolicitudPendienteAsync(connection, (SqlTransaction)transaction, grupoId.Value, solicitudId);
        if (solicitud is null)
        {
            await transaction.RollbackAsync();
            return NotFound("No se encontro una solicitud pendiente para resolver.");
        }

        await CambiarEstadoSolicitudAsync(connection, (SqlTransaction)transaction, solicitudId, estado, usuario.UsuarioId);
        await transaction.CommitAsync();
        return Ok(new { mensaje = $"Solicitud {estado.ToLowerInvariant()} correctamente." });
    }


    private static string NormalizarNombreEquipo(string nombre)
    {
        return string.Join(' ', (nombre ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static async Task<bool> ExisteEquipoConNombreAsync(SqlConnection connection, int grupoGestionId, string nombre, int? excluirEmpresaId = null)
    {
        await using var command = new SqlCommand("""
            SELECT COUNT(1)
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId
              AND LOWER(Nombre) = LOWER(@Nombre)
              AND (@ExcluirEmpresaId IS NULL OR EmpresaId <> @ExcluirEmpresaId);
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.AddWithValue("@Nombre", nombre);
        command.Parameters.AddWithValue("@ExcluirEmpresaId", excluirEmpresaId is null ? DBNull.Value : excluirEmpresaId.Value);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0);
        return count > 0;
    }

    private static async Task<bool> EquipoPerteneceAlGrupoAsync(SqlConnection connection, int grupoGestionId, int empresaId, bool incluirInactivos)
    {
        await using var command = new SqlCommand($"""
            SELECT COUNT(1)
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId
              AND EmpresaId = @EmpresaId
              {(incluirInactivos ? string.Empty : "AND Activo = 1")};
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0);
        return count > 0;
    }

    private static async Task<int> ContarEquiposActivosAsync(SqlConnection connection, int grupoGestionId)
    {
        await using var command = new SqlCommand("""
            SELECT COUNT(1)
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId AND Activo = 1;
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        return Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0);
    }

    private static async Task VincularGerenteAlEquipoAsync(SqlConnection connection, SqlTransaction transaction, int usuarioId, int empresaId)
    {
        await using var command = new SqlCommand("""
            IF EXISTS (SELECT 1 FROM dbo.UsuarioEmpresas WHERE UsuarioId = @UsuarioId AND EmpresaId = @EmpresaId)
            BEGIN
                UPDATE dbo.UsuarioEmpresas
                SET Rol = N'Gerente',
                    Activo = 1,
                    FechaModificacion = SYSDATETIME()
                WHERE UsuarioId = @UsuarioId AND EmpresaId = @EmpresaId;
            END
            ELSE
            BEGIN
                INSERT INTO dbo.UsuarioEmpresas (UsuarioId, EmpresaId, Rol)
                VALUES (@UsuarioId, @EmpresaId, N'Gerente');
            END;
            """, connection, transaction);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        await command.ExecuteNonQueryAsync();
    }
    private bool TryGetAuthenticatedUser(out AuthenticatedUser usuario, out ActionResult error)
    {
        usuario = null!;
        error = Unauthorized("Sesion no valida.");

        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;

        var token = header["Bearer ".Length..].Trim();
        if (!authTokenService.TryValidate(token, out var authenticatedUser) || authenticatedUser is null) return false;

        usuario = authenticatedUser;
        error = Ok();
        return true;
    }

    private static string CrearOtp()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var first = new string(Enumerable.Range(0, 4).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
        var second = new string(Enumerable.Range(0, 4).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
        return $"OTP-{first}-{second}";
    }

    private static string NormalizarRol(string rol)
    {
        return (rol ?? string.Empty).Trim() switch
        {
            "Empleado de campo" => "EmpleadoCampo",
            "Empleado administrativo" => "EmpleadoAdministrativo",
            var value => value
        };
    }

    private async Task<int?> ObtenerGrupoGestionIdAsync(SqlConnection connection, int gerenteUsuarioId)
    {
        await using var command = new SqlCommand("""
            SELECT TOP (1) GrupoGestionId
            FROM dbo.GruposGestion
            WHERE GerenteUsuarioId = @UsuarioId AND Activo = 1
            ORDER BY GrupoGestionId;
            """, connection);
        command.Parameters.AddWithValue("@UsuarioId", gerenteUsuarioId);
        var result = await command.ExecuteScalarAsync();
        return result is null || result == DBNull.Value ? null : Convert.ToInt32(result);
    }

    private static async Task<IReadOnlyList<EmpresaRolRequest>> ObtenerEmpresasDelGrupoAsync(SqlConnection connection, int grupoGestionId, string rol)
    {
        await using var command = new SqlCommand("""
            SELECT EmpresaId
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId AND Activo = 1
            ORDER BY EmpresaId;
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        await using var reader = await command.ExecuteReaderAsync();
        var empresas = new List<EmpresaRolRequest>();
        while (await reader.ReadAsync()) empresas.Add(new EmpresaRolRequest(reader.GetInt32(0), rol));
        return empresas;
    }

    private static async Task<bool> EmpresasPertenecenAlGrupoAsync(SqlConnection connection, int grupoGestionId, IReadOnlyList<int> empresaIds)
    {
        if (empresaIds.Count == 0) return false;
        var placeholders = string.Join(",", empresaIds.Select((_, index) => $"@EmpresaId{index}"));
        await using var command = new SqlCommand($"""
            SELECT COUNT(1)
            FROM dbo.Empresas
            WHERE GrupoGestionId = @GrupoGestionId
              AND Activo = 1
              AND EmpresaId IN ({placeholders});
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        for (var index = 0; index < empresaIds.Count; index++) command.Parameters.AddWithValue($"@EmpresaId{index}", empresaIds[index]);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0);
        return count == empresaIds.Count;
    }

    private static async Task<bool> UsuarioPerteneceAlGrupoAsync(SqlConnection connection, int grupoGestionId, int usuarioId)
    {
        await using var command = new SqlCommand("""
            SELECT COUNT(1)
            FROM dbo.UsuarioEmpresas AS ue
            INNER JOIN dbo.Empresas AS e ON e.EmpresaId = ue.EmpresaId
            INNER JOIN dbo.Usuarios AS u ON u.UsuarioId = ue.UsuarioId
            WHERE e.GrupoGestionId = @GrupoGestionId
              AND ue.UsuarioId = @UsuarioId
              AND u.Rol IN (N'Encargado', N'EmpleadoCampo', N'EmpleadoAdministrativo');
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.AddWithValue("@UsuarioId", usuarioId);
        var count = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0);
        return count > 0;
    }

    private static async Task<int?> ObtenerSolicitudPendienteAsync(SqlConnection connection, SqlTransaction transaction, int grupoGestionId, int solicitudId)
    {
        await using var command = new SqlCommand("""
            SELECT UsuarioId
            FROM dbo.SolicitudesUsuario
            WHERE SolicitudUsuarioId = @SolicitudUsuarioId
              AND GrupoGestionId = @GrupoGestionId
              AND Estado = N'Pendiente';
            """, connection, transaction);
        command.Parameters.AddWithValue("@SolicitudUsuarioId", solicitudId);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);

        var result = await command.ExecuteScalarAsync();
        return result is null || result == DBNull.Value ? null : Convert.ToInt32(result);
    }

    private static async Task CambiarEstadoSolicitudAsync(SqlConnection connection, SqlTransaction transaction, int solicitudId, string estado, int resueltoPorUsuarioId)
    {
        await using var command = new SqlCommand("""
            UPDATE dbo.SolicitudesUsuario
            SET Estado = @Estado,
                FechaResolucion = SYSUTCDATETIME(),
                ResueltoPorUsuarioId = @ResueltoPorUsuarioId
            WHERE SolicitudUsuarioId = @SolicitudUsuarioId;
            """, connection, transaction);
        command.Parameters.AddWithValue("@Estado", estado);
        command.Parameters.AddWithValue("@ResueltoPorUsuarioId", resueltoPorUsuarioId);
        command.Parameters.AddWithValue("@SolicitudUsuarioId", solicitudId);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<IReadOnlyList<ManagerUsuarioDto>> LeerUsuariosAsync(SqlDataReader reader)
    {
        var usuarios = new Dictionary<int, ManagerUsuarioMutable>();

        while (await reader.ReadAsync())
        {
            var usuarioId = reader.GetInt32(0);
            if (!usuarios.TryGetValue(usuarioId, out var usuario))
            {
                usuario = new ManagerUsuarioMutable(
                    usuarioId,
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetBoolean(6),
                    reader.GetDateTime(7)
                );
                usuarios.Add(usuarioId, usuario);
            }

            usuario.Equipos.Add(new ManagerUsuarioEquipoDto(
                reader.GetInt32(8),
                reader.GetString(9),
                reader.GetString(10),
                reader.GetBoolean(11)
            ));
        }

        return usuarios.Values
            .Select(usuario => new ManagerUsuarioDto(
                usuario.UsuarioId,
                usuario.Nombre,
                usuario.Apellido,
                usuario.Telefono,
                usuario.CorreoElectronico,
                usuario.RolGeneral,
                usuario.Equipos.Count > 0 && usuario.Equipos.All(equipo => equipo.Rol == usuario.RolGeneral),
                usuario.Activo,
                usuario.FechaAlta,
                usuario.Equipos
            ))
            .ToArray();
    }

    private sealed record ManagerUsuarioMutable(
        int UsuarioId,
        string Nombre,
        string Apellido,
        string Telefono,
        string CorreoElectronico,
        string RolGeneral,
        bool Activo,
        DateTime FechaAlta
    )
    {
        public List<ManagerUsuarioEquipoDto> Equipos { get; } = [];
    }
}



