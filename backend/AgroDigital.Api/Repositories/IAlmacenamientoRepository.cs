using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Repositories;

public interface IAlmacenamientoRepository
{
    // Consultas filtradas por las empresas del usuario (incluirTodos = Admin).
    // Sin usuario (llamadas internas, por ejemplo la ficha del silo) no filtran.
    Task<IReadOnlyList<AlmacenamientoDto>> ObtenerTodosAsync(int usuarioId = 0, bool incluirTodos = true);
    Task<AlmacenamientoDto?> ObtenerPorIdAsync(int almacenamientoId, int usuarioId = 0, bool incluirTodos = true);
    Task<IReadOnlyList<AlmacenamientoDto>> ObtenerPorSiloAsync(int siloId, int usuarioId = 0, bool incluirTodos = true);

    /// <summary>ALM-05: stock actual por grano y por silo, con partidas y cosechas con saldo.</summary>
    Task<StockActualDto> ObtenerStockAsync(int? empresaId, int? campaniaId, int usuarioId, bool incluirTodos);

    /// <summary>Cosechas finalizadas que todavia tienen grano sin almacenar.</summary>
    Task<IReadOnlyList<SaldoCosechaDto>> ObtenerCosechasConSaldoAsync(int? empresaId, int usuarioId, bool incluirTodos);
    Task<SaldoCosechaDto?> ObtenerSaldoCosechaAsync(int cosechaId, int usuarioId, bool incluirTodos);

    /// <summary>Silos de la empresa, marcando cuales pueden recibir ese grano y por que no los demas.</summary>
    Task<IReadOnlyList<SiloDestinoDto>> ObtenerSilosDestinoAsync(int empresaId, string producto, int usuarioId, bool incluirTodos);

    /// <summary>
    /// Alta manual desde el modulo de Almacenamiento (ALM-01). Valida capacidad,
    /// grano, saldo de cosecha y fechas; abre o consume partidas y actualiza el silo.
    /// </summary>
    Task<AlmacenamientoDto> RegistrarAsync(CrearAlmacenamientoRequest request, int usuarioId, bool incluirTodos);

    /// <summary>
    /// Alta automatica disparada por otro modulo (ALM-04): "AltaSilo" cuando
    /// se da de alta un Silo con stock inicial, "Distribucion" el dia que
    /// exista ese modulo y despache grano tomando un Silo como origen.
    /// </summary>
    /// <summary>ALM-08: ajuste de stock. Solo Encargado (UnauthorizedAccessException si no lo es).</summary>
    Task<AlmacenamientoDto> RegistrarAjusteAsync(RegistrarAjusteRequest request, int usuarioId, bool incluirTodos);

    /// <summary>ALM-06: transferencia entre silos. Las partidas conservan fecha de ingreso y cosecha.</summary>
    Task<TransferenciaResultadoDto> RegistrarTransferenciaAsync(RegistrarTransferenciaRequest request, int usuarioId, bool incluirTodos);

    // Documentos del movimiento (tickets de balanza, comprobantes).
    Task<IReadOnlyList<AlmacenamientoDocumentoDto>> ObtenerDocumentosAsync(int almacenamientoId);
    Task<AlmacenamientoDocumentoDto> AgregarDocumentoAsync(int almacenamientoId, string nombreArchivo, string rutaArchivo, int? usuarioId);
    Task<string?> ObtenerRutaDocumentoAsync(int almacenamientoId, int documentoId);
    Task<bool> EliminarDocumentoAsync(int almacenamientoId, int documentoId);

    Task<AlmacenamientoDto> RegistrarMovimientoAutomaticoAsync(
        int siloId, string tipoMovimiento, decimal cantidad, string origen, string? observaciones, int? usuarioId);

    /// <summary>Solo el ultimo movimiento manual de cada silo. No cambia el tipo ni la cosecha.</summary>
    Task<bool> ActualizarAsync(int almacenamientoId, ActualizarAlmacenamientoRequest request, int usuarioId, bool incluirTodos);
}
