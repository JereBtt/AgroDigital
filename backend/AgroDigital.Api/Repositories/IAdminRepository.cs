using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface IAdminRepository
{
    Task<IReadOnlyList<CuentaGerenteInicialDto>> ObtenerCuentasGerenteAsync();
    Task<CuentaGerenteInicialDto> CrearCuentaGerenteAsync(string responsable, string usuario, string passwordHash, DateTime fechaVencimiento);
    Task<CuentaGerenteInicialDto?> ActualizarResponsableAsync(int accesoId, string responsable, string usuario);
    Task<CuentaGerenteInicialDto?> CambiarHabilitacionAsync(int accesoId, bool habilitado);
    Task<CuentaGerenteInicialDto?> RegenerarPasswordAsync(int accesoId, string passwordHash, DateTime fechaVencimiento);
    Task<bool> ExisteUsuarioAsync(string usuario);
}
