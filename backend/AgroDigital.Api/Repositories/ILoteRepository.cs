using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ILoteRepository
{
    Task<IReadOnlyList<LoteDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos = false);
    Task<LoteDto?> ObtenerPorIdAsync(int loteId, int usuarioId, bool incluirTodos = false);
    Task<LoteDto> CrearAsync(CrearLoteRequest request, int usuarioId, bool incluirTodos = false);
    Task<bool> ActualizarAsync(int loteId, ActualizarLoteRequest request, int usuarioId, bool incluirTodos = false);
    Task<bool> CambiarEstadoAsync(int loteId, bool activo, int usuarioId, bool incluirTodos = false);
}
