using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

/// <summary>Regla de negocio incumplida. El controller responde 400.</summary>
public sealed class ReglaCosechaException(string message) : Exception(message);

/// <summary>Estado incompatible o registro duplicado. El controller responde 409.</summary>
public sealed class ConflictoCosechaException(string message) : Exception(message);

public interface ICosechaRepository
{
    // Consultas filtradas por las empresas del usuario (incluirTodos = Admin).
    Task<IReadOnlyList<CosechaDto>> ObtenerTodosAsync(int usuarioId, bool incluirTodos);

    /// <summary>Sin filtro de acceso: el controller ya valido permisos sobre la cosecha.</summary>
    Task<CosechaDto?> ObtenerPorIdAsync(int cosechaId);

    /// <summary>Siembras finalizadas, ultimas de su cadena y sin cosecha.</summary>
    Task<IReadOnlyList<SiembraParaCosechaDto>> ObtenerSiembrasDisponiblesAsync(int usuarioId, bool incluirTodos);

    Task<CosechaDto> CrearAsync(CrearCosechaRequest request, int usuarioId);
    Task<bool> ActualizarAsync(int cosechaId, ActualizarCosechaRequest request);
    Task FinalizarAsync(int cosechaId, FinalizarCosechaRequest request);

    // Control de perdidas (Tirada de Aros)
    Task<ParametrosPerdidaCosechaDto> ObtenerParametrosPerdidaAsync(int cosechaId);
    Task<IReadOnlyList<CosechaTiradaAroDto>> ObtenerTiradasAsync(int cosechaId);
    Task<CosechaTiradaAroDto> AgregarTiradaAsync(int cosechaId, CrearCosechaTiradaAroRequest request, int usuarioId);
    Task<bool> ActualizarTiradaAsync(int cosechaId, int tiradaId, ActualizarCosechaTiradaAroRequest request);
    Task<bool> EliminarTiradaAsync(int cosechaId, int tiradaId);
    Task FinalizarControlAsync(int cosechaId);

    // Partes diarios de avance
    Task<IReadOnlyList<CosechaParteDto>> ObtenerPartesAsync(int cosechaId);
    Task<CosechaParteDto> AgregarParteAsync(int cosechaId, CrearCosechaParteRequest request, int usuarioId);
    Task<bool> ActualizarParteAsync(int cosechaId, int parteId, ActualizarCosechaParteRequest request);
    Task<bool> EliminarParteAsync(int cosechaId, int parteId);

    // Documentacion
    Task<IReadOnlyList<CosechaDocumentoDto>> ObtenerDocumentosAsync(int cosechaId);
    Task<CosechaDocumentoDto> AgregarDocumentoAsync(int cosechaId, string nombreArchivo, string rutaArchivo, int? usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int cosechaId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int cosechaId, int documentoId);
}
