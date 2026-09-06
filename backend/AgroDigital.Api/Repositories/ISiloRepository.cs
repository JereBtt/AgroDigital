using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface ISiloRepository
{
    Task<IReadOnlyList<SiloDto>> ObtenerTodosAsync();
    Task<SiloDto?> ObtenerPorIdAsync(int siloId);
    Task<SiloDto> CrearAsync(CrearSiloRequest request, int? usuarioId);
    Task<bool> ActualizarAsync(int siloId, ActualizarSiloRequest request);

    Task<IReadOnlyList<SiloControlDto>> ObtenerControlesAsync(int siloId);
    Task<SiloControlDto?> ObtenerControlPorIdAsync(int siloId, int controlId);
    Task<SiloControlDto?> RegistrarControlAsync(int siloId, CrearSiloControlRequest request, int? usuarioId);
    Task<bool> ActualizarControlAsync(int siloId, int controlId, ActualizarSiloControlRequest request);
    Task<bool> EliminarControlAsync(int siloId, int controlId);
    Task<IReadOnlyList<string>> ObtenerRutasDocumentosDeControlAsync(int controlId);

    Task<IReadOnlyList<SiloControlIncidenciaDto>> ObtenerIncidenciasAsync(int controlId);
    Task<SiloControlIncidenciaDto> AgregarIncidenciaAsync(int controlId, CrearSiloControlIncidenciaRequest request);
    Task<bool> EliminarIncidenciaAsync(int controlId, int incidenciaId);

    Task<IReadOnlyList<SiloControlInsumoDto>> ObtenerInsumosAsync(int controlId);
    Task<SiloControlInsumoDto> AgregarInsumoAsync(int controlId, CrearSiloControlInsumoRequest request);
    Task<bool> EliminarInsumoAsync(int controlId, int insumoId);

    Task<IReadOnlyList<SiloDocumentoDto>> ObtenerDocumentosAsync(int controlId);
    Task<SiloDocumentoDto> AgregarDocumentoAsync(int controlId, string nombreArchivo, string rutaArchivo, int? usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int controlId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int controlId, int documentoId);
}
