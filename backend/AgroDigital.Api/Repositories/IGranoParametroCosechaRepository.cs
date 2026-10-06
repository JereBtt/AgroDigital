using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface IGranoParametroCosechaRepository
{
    /// <summary>
    /// Tolerancias de la empresa: cada grano de referencia (con el ajuste de la empresa
    /// si lo tiene) mas los granos que la empresa haya cargado sin referencia.
    /// </summary>
    Task<IReadOnlyList<GranoParametroCosechaDto>> ObtenerAsync(int empresaId);

    /// <summary>Crea o actualiza el ajuste de la empresa para un grano.</summary>
    Task<GranoParametroCosechaDto> GuardarAsync(GuardarGranoParametroCosechaRequest request, int usuarioId);

    /// <summary>Empresa del ajuste, para validar permisos antes de eliminarlo.</summary>
    Task<int?> ObtenerEmpresaIdAsync(int granoParametroCosechaId);

    /// <summary>Elimina el ajuste: el grano vuelve a usar la referencia.</summary>
    Task<bool> EliminarAsync(int granoParametroCosechaId);
}
