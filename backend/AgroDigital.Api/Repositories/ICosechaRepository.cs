using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ICosechaRepository
{
    Task<IReadOnlyList<CosechaDto>> ObtenerTodosAsync();
    Task<CosechaDto?> ObtenerPorIdAsync(int cosechaId);
    Task<CosechaDto> CrearAsync(CrearCosechaRequest request, int? usuarioId);
    Task<bool> ActualizarAsync(int cosechaId, ActualizarCosechaRequest request);
    Task<bool> FinalizarAsync(int cosechaId, FinalizarCosechaRequest request);
    Task<IReadOnlyList<CosechaTiradaAroDto>> ObtenerTiradasAsync(int cosechaId);
    Task<CosechaTiradaAroDto> AgregarTiradaAsync(int cosechaId, CrearCosechaTiradaAroRequest request, int? usuarioId);
    Task<bool> ActualizarTiradaAsync(int cosechaId, int tiradaId, ActualizarCosechaTiradaAroRequest request);
    Task<bool> EliminarTiradaAsync(int cosechaId, int tiradaId);
    Task<IReadOnlyList<CosechaDocumentoDto>> ObtenerDocumentosAsync(int cosechaId);
    Task<CosechaDocumentoDto> AgregarDocumentoAsync(int cosechaId, string nombreArchivo, string rutaArchivo, int? usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int cosechaId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int cosechaId, int documentoId);
}
