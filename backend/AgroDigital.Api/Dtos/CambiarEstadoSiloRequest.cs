namespace AgroDigital.Api.Dtos;

/// <summary>
/// Cambio de estado operativo que decide el usuario (SILO-07).
/// Valores: "En mantenimiento", "Dado de baja" o "Activo" (reactivar).
/// Vacio / Con grano no se eligen: los calcula Almacenamiento segun el stock.
/// </summary>
public class CambiarEstadoSiloRequest
{
    public string Estado { get; set; } = string.Empty;
}
