using AgroDigital.Api.Dtos;
using AgroDigital.Api.Services;

namespace AgroDigital.Api.Repositories;

public interface ISiloRepository
{
    Task<IReadOnlyList<SiloDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos);
    Task<SiloDto?> ObtenerPorIdAsync(int siloId, int usuarioId = 0, bool incluirTodos = true);
    Task<SiloDto> CrearAsync(CrearSiloRequest request, int usuarioId, bool incluirTodos);
    Task<bool> ActualizarAsync(int siloId, ActualizarSiloRequest request, int usuarioId, bool incluirTodos);

    /// <summary>
    /// SILO-03: ficha del silo con sus partidas y la serie de controles.
    /// Los movimientos los completa el controller desde Almacenamiento.
    /// </summary>
    Task<SiloFichaDto?> ObtenerFichaAsync(int siloId, int usuarioId, bool incluirTodos);

    /// <summary>SILO-07: En mantenimiento, Dado de baja o Activo (reactivar).</summary>
    Task<bool> CambiarEstadoAsync(int siloId, string estado, int usuarioId, bool incluirTodos);

    Task<IReadOnlyList<SiloControlDto>> ObtenerControlesAsync(int siloId);
    Task<SiloControlDto?> ObtenerControlPorIdAsync(int siloId, int controlId);
    Task<SiloControlDto?> RegistrarControlAsync(
        int siloId, CrearSiloControlRequest request, int? usuarioId, string resultado, DateOnly? fechaProximoControl);
    Task<bool> ActualizarControlAsync(
        int siloId, int controlId, ActualizarSiloControlRequest request, string resultado, DateOnly? fechaProximoControl);

    /// <summary>
    /// Datos para evaluar un control: silo (con control de acceso), parametros de
    /// su grano y tipo, y la temperatura del control anterior. Null si no hay acceso.
    /// </summary>
    Task<ContextoControlSilo?> ObtenerContextoControlAsync(
        int siloId, DateTime fecha, int? excluirControlId, int usuarioId, bool incluirTodos);
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
