using AgroDigital.Api.Dtos;
using AgroDigital.Api.Models;
using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Globalization;
using System.Security.Cryptography;

namespace AgroDigital.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthRepository _authRepository;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IAuthTokenService _authTokenService;
    private readonly INotificacionesSolicitudService _notificaciones;
    private readonly string _connectionString;
    private readonly string _carpetaFotosPerfil;

    private const long TamanioMaximoFotoPerfil = 5 * 1024 * 1024;
    private static readonly string[] ExtensionesFotoPerfil = [".jpg", ".png", ".webp"];

    public AuthController(
        IAuthRepository authRepository,
        IPasswordHasher passwordHasher,
        IAuthTokenService authTokenService,
        INotificacionesSolicitudService notificaciones,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        _authRepository = authRepository;
        _passwordHasher = passwordHasher;
        _authTokenService = authTokenService;
        _notificaciones = notificaciones;
        _connectionString = configuration.GetConnectionString("AgroDigital")
            ?? throw new InvalidOperationException("No se encontro la cadena de conexion AgroDigital.");
        _carpetaFotosPerfil = Path.Combine(environment.ContentRootPath, "App_Data", "perfiles");
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Usuario) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest("Usuario y contraseña son obligatorios.");
        }

        var usuario = await _authRepository.ObtenerPorUsuarioAsync(request.Usuario);
        if (usuario is null || !usuario.Activo || !_passwordHasher.Verify(request.Password, usuario.PasswordHash))
        {
            return Unauthorized("Usuario o contraseña incorrectos.");
        }

        return Ok(new LoginResponse(usuario.Usuario, NombreCompleto(usuario), usuario.Rol, _authTokenService.CreateToken(usuario), usuario.DebeCambiarPassword));
    }

    [HttpPost("completar-registro-gerente")]
    public async Task<ActionResult<LoginResponse>> CompletarRegistroGerente([FromBody] CompletarRegistroGerenteRequest request)
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        if (autenticado.Rol != "Gerente")
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Solo un gerente puede completar este registro.");
        }

        var empresas = (request.Empresas ?? Array.Empty<string>())
            .Select(empresa => empresa.Trim())
            .Where(empresa => !string.IsNullOrWhiteSpace(empresa))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (string.IsNullOrWhiteSpace(request.Nombre)
            || string.IsNullOrWhiteSpace(request.Apellido)
            || string.IsNullOrWhiteSpace(request.Telefono)
            || string.IsNullOrWhiteSpace(request.CorreoElectronico)
            || string.IsNullOrWhiteSpace(request.Password)
            || empresas.Length == 0)
        {
            return BadRequest("Completa tus datos personales y al menos una empresa.");
        }

        if (!EsCorreoValido(request.CorreoElectronico))
        {
            return BadRequest("Ingresa un correo electronico valido.");
        }

        if (!EsPasswordSegura(request.Password))
        {
            return BadRequest("La contraseña debe tener al menos 8 caracteres y mezclar mayúsculas, minúsculas, números y símbolos.");
        }

        if (request.Password != request.RepetirPassword)
        {
            return BadRequest("Las contraseñas no coinciden.");
        }

        var correo = request.CorreoElectronico.Trim().ToLowerInvariant();
        var usuarioActualizado = await _authRepository.CompletarRegistroGerenteAsync(
            autenticado.UsuarioId,
            FormatearNombrePersona(request.Nombre),
            FormatearNombrePersona(request.Apellido),
            request.Telefono.Trim(),
            correo,
            _passwordHasher.Hash(request.Password),
            empresas,
            CrearGrupoGestionCodigo()
        );

        if (usuarioActualizado is null)
        {
            return BadRequest("No se encontro un acceso pendiente de primer ingreso para completar.");
        }

        return Ok(new LoginResponse(usuarioActualizado.Usuario, NombreCompleto(usuarioActualizado), usuarioActualizado.Rol, _authTokenService.CreateToken(usuarioActualizado), usuarioActualizado.DebeCambiarPassword));
    }


    [HttpGet("perfil")]
    public async Task<ActionResult<PerfilUsuarioResponse>> ObtenerPerfil()
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        var usuario = await _authRepository.ObtenerPorIdAsync(autenticado.UsuarioId);
        if (usuario is null || !usuario.Activo)
        {
            return Unauthorized("Sesion no valida.");
        }

        return Ok(CrearPerfilResponse(usuario));
    }

    [HttpPut("perfil")]
    public async Task<ActionResult<object>> ActualizarPerfil([FromBody] ActualizarPerfilUsuarioRequest request)
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        var nombre = FormatearNombrePersona(request.Nombre);
        var apellido = FormatearNombrePersona(request.Apellido);
        var telefono = request.Telefono?.Trim() ?? string.Empty;
        var correo = request.CorreoElectronico?.Trim().ToLowerInvariant() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(nombre)
            || string.IsNullOrWhiteSpace(apellido)
            || string.IsNullOrWhiteSpace(telefono)
            || string.IsNullOrWhiteSpace(correo))
        {
            return BadRequest("Completa nombre, apellido, telefono y correo electronico.");
        }

        if (!EsCorreoValido(correo))
        {
            return BadRequest("Ingresa un correo electronico valido.");
        }

        var usuarioActual = await _authRepository.ObtenerPorIdAsync(autenticado.UsuarioId);
        if (usuarioActual is null || !usuarioActual.Activo)
        {
            return Unauthorized("Sesion no valida.");
        }

        var usuarioActualizado = await _authRepository.ActualizarPerfilAsync(autenticado.UsuarioId, nombre, apellido, telefono, correo);
        if (usuarioActualizado is null)
        {
            return BadRequest("No se pudo actualizar el perfil. Verifica que el correo no este usado por otra cuenta.");
        }

        // Si cambio el usuario de ingreso (el correo), no se emite un token nuevo:
        // la persona debe volver a iniciar sesion con sus nuevas credenciales.
        var cambioUsuarioIngreso = !string.Equals(usuarioActual.Usuario, usuarioActualizado.Usuario, StringComparison.OrdinalIgnoreCase);
        if (cambioUsuarioIngreso)
        {
            return Ok(new
            {
                perfil = CrearPerfilResponse(usuarioActualizado),
                requiereReingreso = true,
                mensaje = $"Tu correo se actualizó. Iniciá sesión nuevamente con {usuarioActualizado.Usuario}."
            });
        }

        return Ok(new
        {
            perfil = CrearPerfilResponse(usuarioActualizado),
            requiereReingreso = false,
            login = new LoginResponse(
                usuarioActualizado.Usuario,
                NombreCompleto(usuarioActualizado),
                usuarioActualizado.Rol,
                _authTokenService.CreateToken(usuarioActualizado),
                usuarioActualizado.DebeCambiarPassword
            )
        });
    }

    [HttpGet("perfil/foto")]
    public async Task<IActionResult> ObtenerFotoPerfil()
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        var usuario = await _authRepository.ObtenerPorIdAsync(autenticado.UsuarioId);
        if (usuario is null || !usuario.Activo)
        {
            return Unauthorized("Sesion no valida.");
        }

        var ruta = BuscarFotoPerfil(autenticado.UsuarioId);
        if (ruta is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "no-store";
        return PhysicalFile(ruta, TipoContenidoFotoPerfil(Path.GetExtension(ruta)));
    }

    [HttpPost("perfil/foto")]
    [RequestSizeLimit(6_000_000)]
    public async Task<ActionResult<PerfilUsuarioResponse>> SubirFotoPerfil(IFormFile archivo)
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        var usuario = await _authRepository.ObtenerPorIdAsync(autenticado.UsuarioId);
        if (usuario is null || !usuario.Activo)
        {
            return Unauthorized("Sesion no valida.");
        }

        if (archivo is null || archivo.Length == 0)
        {
            return BadRequest("Seleccioná una imagen para tu foto de perfil.");
        }

        if (archivo.Length > TamanioMaximoFotoPerfil)
        {
            return BadRequest("La foto de perfil no puede superar los 5 MB.");
        }

        byte[] contenido;
        await using (var memoria = new MemoryStream())
        {
            await archivo.CopyToAsync(memoria);
            contenido = memoria.ToArray();
        }

        // Se valida el contenido real del archivo, no la extension que informa el navegador.
        var extension = DetectarExtensionImagen(contenido);
        if (extension is null)
        {
            return BadRequest("Formato no permitido. Usá una imagen JPG, PNG o WEBP.");
        }

        Directory.CreateDirectory(_carpetaFotosPerfil);
        EliminarFotosPerfil(autenticado.UsuarioId);
        await System.IO.File.WriteAllBytesAsync(RutaFotoPerfil(autenticado.UsuarioId, extension), contenido);

        return Ok(CrearPerfilResponse(usuario));
    }

    [HttpDelete("perfil/foto")]
    public async Task<ActionResult<PerfilUsuarioResponse>> EliminarFotoPerfil()
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        var usuario = await _authRepository.ObtenerPorIdAsync(autenticado.UsuarioId);
        if (usuario is null || !usuario.Activo)
        {
            return Unauthorized("Sesion no valida.");
        }

        EliminarFotosPerfil(autenticado.UsuarioId);
        return Ok(CrearPerfilResponse(usuario));
    }

    [HttpPut("perfil/password")]
    public async Task<ActionResult> CambiarPasswordPerfil([FromBody] CambiarPasswordPerfilRequest request)
    {
        if (!TryGetAuthenticatedUser(out var autenticado, out var error))
        {
            return error;
        }

        if (string.IsNullOrWhiteSpace(request.PasswordActual)
            || string.IsNullOrWhiteSpace(request.PasswordNueva)
            || string.IsNullOrWhiteSpace(request.RepetirPasswordNueva))
        {
            return BadRequest("Completá la contraseña actual y la nueva contraseña.");
        }

        if (request.PasswordNueva != request.RepetirPasswordNueva)
        {
            return BadRequest("Las contraseñas nuevas no coinciden.");
        }

        if (!EsPasswordSegura(request.PasswordNueva))
        {
            return BadRequest("La nueva contraseña debe tener al menos 8 caracteres y mezclar mayúsculas, minúsculas, números y símbolos.");
        }

        var usuario = await _authRepository.ObtenerPorIdAsync(autenticado.UsuarioId);
        if (usuario is null || !usuario.Activo)
        {
            return Unauthorized("Sesion no valida.");
        }

        if (!_passwordHasher.Verify(request.PasswordActual, usuario.PasswordHash))
        {
            return BadRequest("La contraseña actual no es correcta.");
        }

        if (_passwordHasher.Verify(request.PasswordNueva, usuario.PasswordHash))
        {
            return BadRequest("La nueva contraseña no puede ser igual a la actual.");
        }

        var updated = await _authRepository.ActualizarPasswordAsync(usuario.UsuarioId, _passwordHasher.Hash(request.PasswordNueva));
        if (!updated)
        {
            return BadRequest("No se pudo actualizar la contraseña.");
        }

        return Ok(new { mensaje = "Contraseña actualizada correctamente." });
    }

    [HttpPost("solicitar-union-grupo")]
    public async Task<ActionResult> SolicitarUnionGrupo([FromBody] SolicitarUnionGrupoRequest request)
    {
        var nombre = FormatearNombrePersona(request.Nombre);
        var apellido = FormatearNombrePersona(request.Apellido);
        var telefono = request.Telefono?.Trim() ?? string.Empty;
        var correo = request.CorreoElectronico?.Trim().ToLowerInvariant() ?? string.Empty;
        var grupoCodigo = request.GrupoGestionCodigo?.Trim().ToUpperInvariant() ?? string.Empty;
        var otpIngresada = request.Otp?.Trim().ToUpperInvariant() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        if (request.UsuarioExistente)
        {
            // Cuenta existente: los datos personales se toman de la cuenta y la contraseña
            // es la actual, por eso no se exigen las reglas de una contraseña nueva.
            if (string.IsNullOrWhiteSpace(correo)
                || string.IsNullOrWhiteSpace(password)
                || string.IsNullOrWhiteSpace(grupoCodigo)
                || string.IsNullOrWhiteSpace(otpIngresada))
            {
                return BadRequest("Completa tu correo, tu contraseña actual, el codigo de grupo y la OTP.");
            }
        }
        else if (string.IsNullOrWhiteSpace(nombre)
            || string.IsNullOrWhiteSpace(apellido)
            || string.IsNullOrWhiteSpace(telefono)
            || string.IsNullOrWhiteSpace(correo)
            || string.IsNullOrWhiteSpace(password)
            || string.IsNullOrWhiteSpace(grupoCodigo)
            || string.IsNullOrWhiteSpace(otpIngresada))
        {
            return BadRequest("Completa tus datos personales, codigo de grupo y OTP.");
        }

        if (!EsCorreoValido(correo))
        {
            return BadRequest("Ingresa un correo electronico valido.");
        }

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();

        var grupo = await ObtenerGrupoGestionAsync(connection, grupoCodigo);
        if (grupo is null)
        {
            return BadRequest("El codigo de grupo o la OTP no son validos.");
        }

        var otp = await ObtenerOtpValidaAsync(connection, grupo.Value.GrupoGestionId, otpIngresada);
        if (otp is null)
        {
            return BadRequest("El codigo de grupo o la OTP no son validos.");
        }

        // Invitacion por correo (26_invitaciones_empleado_correo.sql): la OTP solo
        // sirve para el correo al que se envio. Las OTP manuales no tienen correo.
        if (otp.Value.CorreoInvitado is { } correoInvitado
            && !string.Equals(correoInvitado, correo, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Esta invitacion fue enviada a otro correo electronico. Usa el correo en el que la recibiste.");
        }

        var usuarioExistente = await ObtenerUsuarioPorCorreoAsync(connection, correo);
        if (usuarioExistente is not null)
        {
            // La cuenta ya existe: se suma al grupo con sus datos actuales si la contraseña coincide.
            if (!_passwordHasher.Verify(password, usuarioExistente.PasswordHash))
            {
                return BadRequest(request.UsuarioExistente
                    ? "El correo o la contraseña de tu cuenta no son correctos."
                    : "Ya existe una cuenta con ese correo. Marcá \"Ya tengo cuenta en AgroDigital\" e ingresá tu contraseña actual.");
            }

            nombre = usuarioExistente.Nombre;
            apellido = usuarioExistente.Apellido;
            telefono = usuarioExistente.Telefono;
        }
        else if (request.UsuarioExistente)
        {
            return BadRequest("El correo o la contraseña de tu cuenta no son correctos.");
        }
        else
        {
            if (!EsPasswordSegura(password))
            {
                return BadRequest("La contraseña debe tener al menos 8 caracteres y mezclar mayúsculas, minúsculas, números y símbolos.");
            }

            if (password != request.RepetirPassword)
            {
                return BadRequest("Las contraseñas no coinciden.");
            }
        }

        var solicitudDuplicada = await ExisteSolicitudPendienteAsync(connection, grupo.Value.GrupoGestionId, correo);
        if (solicitudDuplicada)
        {
            return BadRequest("Ya existe una solicitud pendiente para este grupo de gestion.");
        }

        int solicitudId;
        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            var usuarioId = usuarioExistente?.UsuarioId ?? await CrearUsuarioEmpleadoPendienteAsync(connection, (SqlTransaction)transaction, nombre, apellido, telefono, correo, _passwordHasher.Hash(password));

            await using (var solicitudCommand = new SqlCommand("""
                INSERT INTO dbo.SolicitudesUsuario
                    (GrupoGestionId, UsuarioId, Nombre, Apellido, Telefono, CorreoElectronico, Estado, EmpresaId)
                OUTPUT INSERTED.SolicitudUsuarioId
                VALUES
                    (@GrupoGestionId, @UsuarioId, @Nombre, @Apellido, @Telefono, @CorreoElectronico, N'Pendiente', @EmpresaId);
                """, connection, (SqlTransaction)transaction))
            {
                solicitudCommand.Parameters.AddWithValue("@GrupoGestionId", grupo.Value.GrupoGestionId);
                solicitudCommand.Parameters.AddWithValue("@UsuarioId", usuarioId);
                solicitudCommand.Parameters.AddWithValue("@Nombre", nombre);
                solicitudCommand.Parameters.AddWithValue("@Apellido", apellido);
                solicitudCommand.Parameters.AddWithValue("@Telefono", telefono);
                solicitudCommand.Parameters.AddWithValue("@CorreoElectronico", correo);
                solicitudCommand.Parameters.AddWithValue("@EmpresaId", (object?)otp.Value.EmpresaId ?? DBNull.Value);
                solicitudId = Convert.ToInt32(await solicitudCommand.ExecuteScalarAsync());
            }

            await using (var otpCommand = new SqlCommand("""
                UPDATE dbo.GrupoGestionOtps
                SET Usado = 1,
                    FechaUso = SYSUTCDATETIME(),
                    Activo = 0
                WHERE GrupoGestionOtpId = @GrupoGestionOtpId;
                """, connection, (SqlTransaction)transaction))
            {
                otpCommand.Parameters.AddWithValue("@GrupoGestionOtpId", otp.Value.Id);
                await otpCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        // Aviso al Gerente. Si el correo falla, la solicitud queda registrada igual.
        await _notificaciones.NotificarNuevaSolicitudAsync(solicitudId);
        return Ok(new { mensaje = "Solicitud enviada. El gerente debe aprobar tu acceso." });
    }


    private PerfilUsuarioResponse CrearPerfilResponse(UsuarioLogin usuario)
    {
        return new PerfilUsuarioResponse(
            usuario.UsuarioId,
            usuario.Usuario,
            usuario.Nombre,
            usuario.Apellido,
            usuario.Telefono,
            usuario.CorreoElectronico,
            usuario.Rol,
            usuario.Activo,
            BuscarFotoPerfil(usuario.UsuarioId) is not null
        );
    }

    private string RutaFotoPerfil(int usuarioId, string extension)
    {
        return Path.Combine(_carpetaFotosPerfil, $"usuario-{usuarioId}{extension}");
    }

    private string? BuscarFotoPerfil(int usuarioId)
    {
        return ExtensionesFotoPerfil
            .Select(extension => RutaFotoPerfil(usuarioId, extension))
            .FirstOrDefault(System.IO.File.Exists);
    }

    private void EliminarFotosPerfil(int usuarioId)
    {
        foreach (var extension in ExtensionesFotoPerfil)
        {
            var ruta = RutaFotoPerfil(usuarioId, extension);
            if (System.IO.File.Exists(ruta))
            {
                System.IO.File.Delete(ruta);
            }
        }
    }

    private static string TipoContenidoFotoPerfil(string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };
    }

    private static string? DetectarExtensionImagen(byte[] contenido)
    {
        if (contenido.Length >= 3 && contenido[0] == 0xFF && contenido[1] == 0xD8 && contenido[2] == 0xFF)
        {
            return ".jpg";
        }

        if (contenido.Length >= 8
            && contenido[0] == 0x89 && contenido[1] == 0x50 && contenido[2] == 0x4E && contenido[3] == 0x47
            && contenido[4] == 0x0D && contenido[5] == 0x0A && contenido[6] == 0x1A && contenido[7] == 0x0A)
        {
            return ".png";
        }

        if (contenido.Length >= 12
            && contenido[0] == (byte)'R' && contenido[1] == (byte)'I' && contenido[2] == (byte)'F' && contenido[3] == (byte)'F'
            && contenido[8] == (byte)'W' && contenido[9] == (byte)'E' && contenido[10] == (byte)'B' && contenido[11] == (byte)'P')
        {
            return ".webp";
        }

        return null;
    }

    private static string NombreCompleto(UsuarioLogin usuario)
    {
        return string.Join(' ', new[] { usuario.Nombre, usuario.Apellido }.Where(value => !string.IsNullOrWhiteSpace(value)));
    }
    private bool TryGetAuthenticatedUser(out AuthenticatedUser usuario, out ActionResult error)
    {
        usuario = null!;
        error = Unauthorized("Sesion no valida.");

        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var token = header["Bearer ".Length..].Trim();
        if (!_authTokenService.TryValidate(token, out var authenticatedUser) || authenticatedUser is null)
        {
            return false;
        }

        usuario = authenticatedUser;
        error = Ok();
        return true;
    }

    private async Task<(int GrupoGestionId, string Codigo)?> ObtenerGrupoGestionAsync(SqlConnection connection, string codigo)
    {
        await using var command = new SqlCommand("""
            SELECT GrupoGestionId, Codigo
            FROM dbo.GruposGestion
            WHERE Codigo = @Codigo AND Activo = 1;
            """, connection);
        command.Parameters.AddWithValue("@Codigo", codigo);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return (reader.GetInt32(0), reader.GetString(1));
    }

    private async Task<(int Id, string? CorreoInvitado, int? EmpresaId)?> ObtenerOtpValidaAsync(SqlConnection connection, int grupoGestionId, string otpIngresada)
    {
        await using var command = new SqlCommand("""
            SELECT GrupoGestionOtpId, CodigoOtpHash, CorreoInvitado, EmpresaId
            FROM dbo.GrupoGestionOtps
            WHERE GrupoGestionId = @GrupoGestionId
              AND Activo = 1
              AND Usado = 0
              AND FechaVencimiento >= SYSUTCDATETIME()
            ORDER BY FechaCreacion DESC;
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);

        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var otpId = reader.GetInt32(0);
            var otpHash = reader.GetString(1);
            if (_passwordHasher.Verify(otpIngresada, otpHash))
            {
                return (otpId, reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetInt32(3));
            }
        }

        return null;
    }

    private async Task<UsuarioExistente?> ObtenerUsuarioPorCorreoAsync(SqlConnection connection, string correo)
    {
        await using var command = new SqlCommand("""
            SELECT TOP (1) UsuarioId, PasswordHash, Nombre, ISNULL(Apellido, N''), ISNULL(Telefono, N'')
            FROM dbo.Usuarios
            WHERE Usuario = @Correo OR CorreoElectronico = @Correo;
            """, connection);
        command.Parameters.AddWithValue("@Correo", correo);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return new UsuarioExistente(reader.GetInt32(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4));
    }

    private static async Task<bool> ExisteSolicitudPendienteAsync(SqlConnection connection, int grupoGestionId, string correo)
    {
        await using var command = new SqlCommand("""
            SELECT COUNT(1)
            FROM dbo.SolicitudesUsuario
            WHERE GrupoGestionId = @GrupoGestionId
              AND CorreoElectronico = @CorreoElectronico
              AND Estado = N'Pendiente';
            """, connection);
        command.Parameters.AddWithValue("@GrupoGestionId", grupoGestionId);
        command.Parameters.AddWithValue("@CorreoElectronico", correo);

        var count = Convert.ToInt32(await command.ExecuteScalarAsync());
        return count > 0;
    }

    private static async Task<int> CrearUsuarioEmpleadoPendienteAsync(SqlConnection connection, SqlTransaction transaction, string nombre, string apellido, string telefono, string correo, string passwordHash)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.Usuarios
                (Usuario, PasswordHash, Rol, Nombre, Apellido, Telefono, CorreoElectronico, DebeCambiarPassword, Activo)
            OUTPUT INSERTED.UsuarioId
            VALUES
                (@Correo, @PasswordHash, N'EmpleadoCampo', @Nombre, @Apellido, @Telefono, @Correo, 0, 0);
            """, connection, transaction);
        command.Parameters.AddWithValue("@Correo", correo);
        command.Parameters.AddWithValue("@PasswordHash", passwordHash);
        command.Parameters.AddWithValue("@Nombre", nombre);
        command.Parameters.AddWithValue("@Apellido", apellido);
        command.Parameters.AddWithValue("@Telefono", telefono);

        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static string FormatearNombrePersona(string? valor)
    {
        var limpio = (valor ?? string.Empty).Trim().ToLower(new CultureInfo("es-AR"));
        if (string.IsNullOrWhiteSpace(limpio)) return string.Empty;

        return CultureInfo.GetCultureInfo("es-AR").TextInfo.ToTitleCase(limpio);
    }
    private static bool EsCorreoValido(string correo)
    {
        return correo.Contains('@') && correo.Contains('.');
    }

    private static bool EsPasswordSegura(string password)
    {
        return password.Length >= 8
            && password.Any(char.IsUpper)
            && password.Any(char.IsLower)
            && password.Any(char.IsDigit)
            && password.Any(character => !char.IsLetterOrDigit(character));
    }

    private static string CrearGrupoGestionCodigo()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var token = new string(Enumerable.Range(0, 8)
            .Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)])
            .ToArray());

        return $"GG-{token}";
    }

    private sealed record UsuarioExistente(int UsuarioId, string PasswordHash, string Nombre, string Apellido, string Telefono);
}





