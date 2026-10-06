using System.Globalization;
using System.Text;
using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Services;

/// <summary>
/// Datos que necesita el evaluador: el silo, los parametros que definio el
/// ingeniero para ese grano y tipo de silo (si existen) y el control anterior.
/// </summary>
public sealed record ContextoControlSilo(
    int SiloId,
    string TipoSilo,
    string? Producto,
    decimal? UmbralHumedad,
    decimal? MargenTemperaturaC,
    int? FrecuenciaControlDias,
    decimal? TemperaturaAnterior,
    DateTime? FechaControlAnterior);

/// <summary>
/// SILO-04 / SILO-08: calcula el resultado de un control de silo.
/// Es una clase pura (no accede a la base) para poder probarla de forma aislada.
///
/// Reglas:
///   - Critico:  estado del grano Deteriorado.
///   - Atencion: estado Regular, humedad por encima del umbral de almacenamiento,
///               suba de temperatura mayor al margen respecto del control anterior,
///               o rotura de bolsa.
///   - Normal:   ninguna de las anteriores.
///   - Proximo control: a la frecuencia configurada; si el resultado no es Normal,
///               a la mitad (redondeando hacia arriba, minimo 1 dia).
/// Sin parametros configurados no se inventan umbrales: solo se evaluan el
/// estado del grano y la rotura, y se informa que faltan parametros.
/// </summary>
public static class EvaluadorControlSilo
{
    public const string Normal = "Normal";
    public const string Atencion = "Atencion";
    public const string Critico = "Critico";

    public static EvaluacionControlDto Evaluar(
        ContextoControlSilo contexto, decimal humedad, decimal temperatura, string estadoGrano, bool? roturaBolsa, DateTime fecha)
    {
        var motivos = new List<string>();
        var nivel = 0; // 0 Normal, 1 Atencion, 2 Critico

        var estado = estadoGrano.Trim();
        if (estado == "Deteriorado")
        {
            nivel = 2;
            motivos.Add("El grano esta deteriorado.");
        }
        else if (estado == "Regular")
        {
            nivel = Math.Max(nivel, 1);
            motivos.Add("El estado del grano es regular.");
        }

        if (roturaBolsa == true)
        {
            nivel = Math.Max(nivel, 1);
            motivos.Add("La bolsa tiene roturas.");
        }

        if (contexto.UmbralHumedad is decimal umbral && humedad > umbral)
        {
            nivel = Math.Max(nivel, 1);
            motivos.Add($"Humedad {humedad:0.##} % supera el umbral de almacenamiento ({umbral:0.##} %).");
        }

        if (contexto.MargenTemperaturaC is decimal margen && contexto.TemperaturaAnterior is decimal anterior)
        {
            var suba = temperatura - anterior;
            if (suba > margen)
            {
                nivel = Math.Max(nivel, 1);
                motivos.Add($"La temperatura subio {suba:0.##} °C desde el control anterior (margen: {margen:0.##} °C).");
            }
        }

        var parametrosConfigurados = contexto.UmbralHumedad.HasValue;
        if (!parametrosConfigurados)
        {
            motivos.Add(string.IsNullOrWhiteSpace(contexto.Producto)
                ? "El silo no tiene grano: solo se evalua el estado."
                : $"No hay parametros cargados para {contexto.Producto} en silos de {NombreTipo(contexto.TipoSilo)}: solo se evaluan el estado y la rotura.");
        }

        var resultado = nivel switch { 2 => Critico, 1 => Atencion, _ => Normal };

        DateOnly? proximo = null;
        if (contexto.FrecuenciaControlDias is int frecuencia and > 0)
        {
            var dias = resultado == Normal ? frecuencia : Math.Max(1, (int)Math.Ceiling(frecuencia / 2m));
            proximo = DateOnly.FromDateTime(fecha).AddDays(dias);
        }

        return new EvaluacionControlDto
        {
            Resultado = resultado,
            Motivos = motivos,
            FechaProximoControlSugerida = proximo,
            ParametrosConfigurados = parametrosConfigurados,
            Producto = contexto.Producto,
            UmbralHumedad = contexto.UmbralHumedad,
            MargenTemperaturaC = contexto.MargenTemperaturaC,
            FrecuenciaControlDias = contexto.FrecuenciaControlDias,
            TemperaturaAnterior = contexto.TemperaturaAnterior,
        };
    }

    /// <summary>"Maíz", "maiz " y "MAIZ" son el mismo grano.</summary>
    public static string NormalizarGrano(string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor)) return string.Empty;

        var descompuesto = valor.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(descompuesto.Length);
        foreach (var caracter in descompuesto)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(caracter) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(char.ToLowerInvariant(caracter));
            }
        }

        return builder.ToString();
    }

    private static string NombreTipo(string tipoSilo) => tipoSilo == "Bolson" ? "bolson" : "chapa";
}
