using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ISiembraRepository
{
    Task<IReadOnlyList<SiembraDto>> ObtenerTodosAsync();
    Task<SiembraDto?> ObtenerPorIdAsync(int siembraId);
    Task<SiembraDto> CrearAsync(CrearSiembraRequest request, int? usuarioId);
    Task<bool> ActualizarAsync(int siembraId, ActualizarSiembraRequest request);
    Task<bool> FinalizarSiembraAsync(int siembraId, FinalizarSiembraRequest request);

    Task<IReadOnlyList<SiembraInsumoDto>> ObtenerInsumosAsync(int siembraId);
    Task<SiembraInsumoDto> AgregarInsumoAsync(int siembraId, CrearSiembraInsumoRequest request);
    Task<bool> EliminarInsumoAsync(int siembraId, int insumoId);

    Task<IReadOnlyList<SiembraDocumentoDto>> ObtenerDocumentosAsync(int siembraId);
    Task<SiembraDocumentoDto> AgregarDocumentoAsync(int siembraId, string nombreArchivo, string rutaArchivo, int? usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int siembraId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int siembraId, int documentoId);
}
