using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface IGranoParametroRepository
{
    /// <summary>Parametros de las empresas del usuario (o de una empresa puntual).</summary>
    Task<IReadOnlyList<GranoParametroDto>> ObtenerAsync(int? empresaId, int usuarioId, bool incluirTodos);

    /// <summary>Humedades base de comercializacion (valor normativo, global).</summary>
    Task<IReadOnlyList<GranoBaseComercializacionDto>> ObtenerBasesAsync();

    /// <summary>
    /// Crea o actualiza. Solo Gerente o Encargado de esa empresa (o Admin).
    /// Devuelve null si el usuario no tiene permiso sobre la empresa.
    /// </summary>
    Task<GranoParametroDto?> GuardarAsync(GuardarGranoParametroRequest request, int usuarioId, bool incluirTodos);

    Task<bool> EliminarAsync(int granoParametroId, int usuarioId, bool incluirTodos);
}
