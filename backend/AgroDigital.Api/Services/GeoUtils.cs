using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Services;

/// <summary>
/// Calculos geograficos compartidos. Antes vivia como metodo privado de
/// SeguimientosController; ahora lo usan Seguimientos y Silos.
/// </summary>
public static class GeoUtils
{
    /// <summary>
    /// Indica si el punto cae dentro del poligono del lote (algoritmo de ray casting).
    /// Con menos de 3 vertices no hay poligono y devuelve false.
    /// </summary>
    public static bool PuntoDentroDelPoligono(decimal latitud, decimal longitud, IReadOnlyList<LoteCoordenadaDto> coordenadas)
    {
        var vertices = coordenadas.OrderBy(coordenada => coordenada.Orden).ToList();
        if (vertices.Count < 3) return false;

        var dentro = false;
        for (int indice = 0, anterior = vertices.Count - 1; indice < vertices.Count; anterior = indice++)
        {
            var actual = vertices[indice];
            var previo = vertices[anterior];
            var intersecta = ((actual.Latitud > latitud) != (previo.Latitud > latitud))
                && (longitud < ((previo.Longitud - actual.Longitud) * (latitud - actual.Latitud) / (previo.Latitud - actual.Latitud)) + actual.Longitud);
            if (intersecta) dentro = !dentro;
        }
        return dentro;
    }
}
