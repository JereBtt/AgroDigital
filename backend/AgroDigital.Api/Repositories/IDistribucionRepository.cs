using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

/// <summary>
/// Envios de grano y su conciliacion por camion. Ver DistribucionAcceso para la
/// convencion de permisos y errores (KeyNotFound = 404, UnauthorizedAccess = 403,
/// ConflictoDistribucion = 409, InvalidOperation = 400).
/// </summary>
public interface IDistribucionRepository
{
    // ---------- Consultas ----------
    Task<IReadOnlyList<DistribucionCamionDto>> ObtenerCamionesAsync(
        int? empresaId, int? campaniaId, string? estado, DateOnly? desde, DateOnly? hasta, int usuarioId, bool esAdmin);

    Task<DistribucionIndicadoresDto> ObtenerIndicadoresAsync(
        int empresaId, int? campaniaId, DateOnly? desde, DateOnly? hasta, int usuarioId, bool esAdmin);

    Task<DistribucionDto?> ObtenerPorIdAsync(int distribucionId, int usuarioId, bool esAdmin);

    Task<TrazabilidadCamionDto?> ObtenerTrazabilidadCamionAsync(int distribucionCamionId, int usuarioId, bool esAdmin);

    /// <summary>Kg que se pueden despachar desde un silo o directo de una cosecha.</summary>
    Task<DisponibilidadDistribucionDto> ObtenerDisponibilidadAsync(int empresaId, int? siloId, int? cosechaId, int usuarioId, bool esAdmin);

    // ---------- Altas y modificaciones ----------

    /// <summary>
    /// Registra el envio con todos sus camiones en una sola transaccion. Si el grano sale
    /// de un silo, genera un Egreso FIFO por camion. Todos los camiones quedan En transito.
    /// </summary>
    Task<DistribucionDto> RegistrarAsync(CrearDistribucionRequest request, int usuarioId, bool esAdmin);

    /// <summary>Solo responsable y observaciones: fecha de salida y origen quedan fijos.</summary>
    Task ActualizarAsync(int distribucionId, ActualizarDistribucionRequest request, int usuarioId, bool esAdmin);

    /// <summary>Chofer, camion, destino, CPE y ticket. Nunca los kg despachados.</summary>
    Task ActualizarLogisticaCamionAsync(int distribucionCamionId, ActualizarCamionLogisticaRequest request, int usuarioId, bool esAdmin);

    /// <summary>En transito -> Recibido. No aplica a camiones ya conciliados.</summary>
    Task RegistrarRecepcionAsync(int distribucionCamionId, RegistrarRecepcionRequest request, int usuarioId, bool esAdmin);

    /// <summary>Calcula la merma con los parametros vigentes sin guardar nada.</summary>
    Task<AnalisisMermaDto> PrevisualizarConciliacionAsync(int distribucionCamionId, ConciliarCamionRequest request, int usuarioId, bool esAdmin);

    /// <summary>
    /// Guarda recepcion, analisis y liquidacion, con la foto de los parametros usados,
    /// y pasa el camion a Conciliado. Volver a conciliar corrige con los parametros vigentes.
    /// </summary>
    Task<AnalisisMermaDto> ConciliarAsync(int distribucionCamionId, ConciliarCamionRequest request, int usuarioId, bool esAdmin);

    // ---------- Documentos ----------

    /// <summary>Verifica que el usuario pueda gestionar el envio (lanza las excepciones de la convencion).</summary>
    Task ExigirGestionAsync(int distribucionId, int usuarioId, bool esAdmin);

    Task<IReadOnlyList<DistribucionDocumentoDto>> ObtenerDocumentosAsync(int distribucionId);
    Task<DistribucionDocumentoDto> AgregarDocumentoAsync(int distribucionId, int? distribucionCamionId, string nombreArchivo, string rutaArchivo, int usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int distribucionId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int distribucionId, int documentoId);
}
