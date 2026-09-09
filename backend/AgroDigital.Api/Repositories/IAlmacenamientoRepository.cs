using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface IAlmacenamientoRepository
{
    Task<IReadOnlyList<AlmacenamientoDto>> ObtenerTodosAsync();
    Task<AlmacenamientoDto?> ObtenerPorIdAsync(int almacenamientoId);
    Task<IReadOnlyList<AlmacenamientoDto>> ObtenerPorSiloAsync(int siloId);

    /// <summary>
    /// Alta manual desde el modulo de Almacenamiento (ALM-01). Recalcula el
    /// stock del silo a partir del movimiento.
    /// </summary>
    Task<AlmacenamientoDto> RegistrarAsync(CrearAlmacenamientoRequest request, int? usuarioId);

    /// <summary>
    /// Alta automatica disparada por otro modulo (ALM-04): "AltaSilo" cuando
    /// se da de alta un Silo con stock inicial, "Distribucion" el dia que
    /// exista ese modulo y despache grano tomando un Silo como origen.
    /// </summary>
    Task<AlmacenamientoDto> RegistrarMovimientoAutomaticoAsync(
        int siloId, string tipoMovimiento, decimal cantidad, string origen, string? observaciones, int? usuarioId);

    Task<bool> ActualizarAsync(int almacenamientoId, ActualizarAlmacenamientoRequest request);
}
