using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ICampaniaRepository
{
    Task<IReadOnlyList<CampaniaConsultaDto>> ObtenerConsultaAsync(int usuarioId, bool incluirTodos = false);
    Task<CampaniaDto?> ObtenerPorIdAsync(int campaniaId, int usuarioId, bool incluirTodos = false);
    Task<CampaniaDto> CrearAsync(CrearCampaniaRequest request, int usuarioId, bool incluirTodos = false);
    Task<bool> ActualizarAsync(int campaniaId, ActualizarCampaniaRequest request, int usuarioId, bool incluirTodos = false);
}
