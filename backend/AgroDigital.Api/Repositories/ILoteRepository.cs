using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ILoteRepository
{
    Task<IReadOnlyList<LoteDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos = false);
    Task<LoteDto?> ObtenerPorIdAsync(int loteId, int usuarioId, bool incluirTodos = false);
    Task<bool> ExisteNombreAsync(string nombre, int usuarioId, bool incluirTodos = false, int? excluirLoteId = null);
    Task<LoteSuperpuestoInfo?> ObtenerSuperposicionAsync(IEnumerable<LoteCoordenadaDto> coordenadas, int usuarioId, bool incluirTodos = false, int? excluirLoteId = null);
    Task<LoteDto> CrearAsync(CrearLoteRequest request, int usuarioId, bool incluirTodos = false);
    Task<bool> ActualizarAsync(int loteId, ActualizarLoteRequest request, int usuarioId, bool incluirTodos = false);
    Task<bool> CambiarEstadoAsync(int loteId, bool activo, int usuarioId, bool incluirTodos = false, DeshabilitarLoteRequest? deshabilitacion = null);
    Task<string?> ObtenerBloqueoDeshabilitacionAsync(int loteId, int usuarioId, bool incluirTodos = false);
    Task<string?> ObtenerPeriodoDeshabilitacionAsync(int loteId, int usuarioId, bool incluirTodos = false);
    Task<bool> PuedeDeshabilitarPorAlquilerRecienteAsync(int loteId, int usuarioId, bool incluirTodos = false);
    Task<HabilitacionLoteDto?> ObtenerHabilitacionAsync(int loteId, int usuarioId, bool incluirTodos = false);
    Task<bool> HabilitarAsync(int loteId, int usuarioId, bool incluirTodos = false, string? modo = null);
    Task<bool> DeshabilitarSiembraAsync(int siembraId, DeshabilitarSiembraRequest request, int usuarioId, bool incluirTodos = false);
    Task<bool> HabilitarSiembraAsync(int siembraId, int usuarioId, bool incluirTodos = false);
}
