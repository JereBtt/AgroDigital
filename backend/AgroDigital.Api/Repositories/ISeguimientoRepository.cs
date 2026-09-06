using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ISeguimientoRepository
{
    Task<IReadOnlyList<SiembraSeguimientoDto>> ObtenerTodosAsync(int siembraId);
    Task<SiembraSeguimientoDto?> ObtenerPorIdAsync(int siembraId, int seguimientoId);
    Task<SiembraSeguimientoDto?> CrearAsync(int siembraId, CrearSiembraSeguimientoRequest request);
    Task<bool> ActualizarAsync(int siembraId, int seguimientoId, ActualizarSiembraSeguimientoRequest request);
    Task<bool> EliminarAsync(int siembraId, int seguimientoId);
    Task<IReadOnlyList<string>> ObtenerRutasDocumentosDeSeguimientoAsync(int seguimientoId);
    Task<bool> FinalizarAsync(int siembraId);

    Task<IReadOnlyList<SeguimientoInsumoDto>> ObtenerInsumosAsync(int seguimientoId);
    Task<SeguimientoInsumoDto> AgregarInsumoAsync(int seguimientoId, CrearSeguimientoInsumoRequest request);
    Task<bool> EliminarInsumoAsync(int seguimientoId, int insumoId);

    Task<IReadOnlyList<SeguimientoDocumentoDto>> ObtenerDocumentosAsync(int seguimientoId);
    Task<SeguimientoDocumentoDto> AgregarDocumentoAsync(int seguimientoId, string nombreArchivo, string rutaArchivo, int? usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int seguimientoId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int seguimientoId, int documentoId);
}
