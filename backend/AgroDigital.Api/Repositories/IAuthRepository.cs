using AgroDigital.Api.Models;

namespace AgroDigital.Api.Repositories;

public interface IAuthRepository
{
    Task<UsuarioLogin?> ObtenerPorUsuarioAsync(string usuario);
    Task<UsuarioLogin?> ObtenerPorIdAsync(int usuarioId);
    Task<UsuarioLogin?> ActualizarPerfilAsync(int usuarioId, string nombre, string apellido, string telefono, string correoElectronico);
    Task<bool> ActualizarPasswordAsync(int usuarioId, string passwordHash);
    Task<UsuarioLogin?> CompletarRegistroGerenteAsync(
        int usuarioId,
        string nombre,
        string apellido,
        string telefono,
        string correoElectronico,
        string passwordHash,
        IReadOnlyList<string> empresas,
        string grupoGestionCodigo);
}
