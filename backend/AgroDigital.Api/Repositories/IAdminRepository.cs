using AgroDigital.Api.Dtos;
using AgroDigital.Api.Models;

namespace AgroDigital.Api.Repositories;

public interface IAdminRepository
{
    Task<IReadOnlyList<CuentaGerenteInicialDto>> ObtenerCuentasGerenteAsync();
    Task<CuentaGerenteInicialDto?> ObtenerCuentaGerenteAsync(int accesoId);

    Task<CuentaGerenteInicialDto> CrearCuentaGerenteAsync(
        string responsable, string usuario, string correoElectronico,
        string passwordHash, string tokenActivacionHash, DateTime fechaVencimiento);

    Task<CuentaGerenteInicialDto?> ActualizarResponsableAsync(int accesoId, string responsable, string usuario, string? correoElectronico);
    Task<CuentaGerenteInicialDto?> CambiarHabilitacionAsync(int accesoId, bool habilitado);
    Task<CuentaGerenteInicialDto?> RegenerarPasswordAsync(int accesoId, string passwordHash, DateTime fechaVencimiento);
    Task<bool> ExisteUsuarioAsync(string usuario);

    // ---- Invitacion por correo ----

    /// <summary>true si el correo ya es de un usuario o de otra invitacion pendiente.</summary>
    Task<bool> CorreoEnUsoAsync(string correoElectronico, int? excluirAccesoId);

    /// <summary>Nuevo token (invalida el anterior) y nuevo vencimiento. Solo accesos pendientes con correo.</summary>
    Task<CuentaGerenteInicialDto?> RenovarTokenActivacionAsync(int accesoId, string tokenActivacionHash, DateTime fechaVencimiento);

    /// <summary>Guarda el intento en CorreosEnviados y actualiza el resumen de envio del acceso.</summary>
    Task<CuentaGerenteInicialDto?> RegistrarEnvioInvitacionAsync(
        int accesoId, string destinatario, string asunto, bool enviado, string? error, int? enviadoPorUsuarioId);

    /// <summary>Usuario de un acceso pendiente y vigente a partir del hash del token del enlace.</summary>
    Task<(UsuarioLogin Usuario, string? CorreoInvitacion)?> ObtenerUsuarioPorTokenActivacionAsync(string tokenActivacionHash);
}
