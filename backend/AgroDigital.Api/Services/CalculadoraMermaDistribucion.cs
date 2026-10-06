using System.Globalization;
using System.Text;
using AgroDigital.Api.Dtos;

namespace AgroDigital.Api.Services;

/// <summary>Parametros vigentes para un grano al momento de conciliar.</summary>
public sealed record ParametrosMerma(
    decimal? HumedadBase,
    decimal? ManipuleoPct,
    decimal? ToleranciaMateriasExtranasPct,
    decimal DesvioMedioPp,
    decimal DesvioAltoPp);

/// <summary>
/// Calculo de merma de un camion. Logica pura (sin base de datos) para poder
/// usarla igual en la previsualizacion y en la conciliacion.
///
///   Secado (%)            = (HumedadDestino - HumedadBase) / (100 - HumedadBase) * 100   (0 si no supera la base)
///   ME sobre tolerancia   = MateriasExtranas - Tolerancia                                (0 si no la supera)
///   Merma esperada (%)    = Secado + Manipuleo + ME sobre tolerancia
///   Merma esperada (kg)   = KgRecibidos * MermaEsperada% / 100
///   Diferencia de balanza = KgDespachados - KgRecibidos
///   Descuento por calidad = KgRecibidos - KgNetosLiquidados
///   Merma total           = KgDespachados - KgNetosLiquidados
///   Merma no justificada  = Merma total - Merma esperada (kg)
///   Desvio (pp)           = Merma no justificada / KgDespachados * 100
/// </summary>
public static class CalculadoraMermaDistribucion
{
    public const decimal DesvioMedioPorDefecto = 0.50m;
    public const decimal DesvioAltoPorDefecto = 1.50m;

    public static AnalisisMermaDto Calcular(
        decimal kgDespachados,
        decimal kgRecibidos,
        decimal humedadDestino,
        decimal materiasExtranasDestino,
        decimal kgNetosLiquidados,
        ParametrosMerma? parametros)
    {
        var diferenciaBalanza = kgDespachados - kgRecibidos;
        var descuentoCalidad = kgRecibidos - kgNetosLiquidados;
        var mermaTotal = kgDespachados - kgNetosLiquidados;

        var analisis = new AnalisisMermaDto
        {
            HumedadBase = parametros?.HumedadBase,
            ManipuleoPct = parametros?.ManipuleoPct,
            ToleranciaMateriasExtranasPct = parametros?.ToleranciaMateriasExtranasPct,
            DiferenciaBalanzaKg = Kg(diferenciaBalanza),
            DiferenciaBalanzaPct = Pct(diferenciaBalanza, kgDespachados),
            DescuentoCalidadKg = Kg(descuentoCalidad),
            MermaTotalKg = Kg(mermaTotal),
            MermaTotalPct = Pct(mermaTotal, kgDespachados),
        };

        if (parametros?.HumedadBase is not { } humedadBase
            || parametros.ManipuleoPct is not { } manipuleo
            || parametros.ToleranciaMateriasExtranasPct is not { } tolerancia)
        {
            analisis.ParametrosCompletos = false;
            analisis.Advertencia = parametros?.HumedadBase is null
                ? "No hay humedad base de comercializacion para este grano: no se puede calcular la merma esperada."
                : "Faltan los parametros de distribucion de este grano (manipuleo y tolerancia de materias extranas).";
            return analisis;
        }

        var secado = humedadDestino > humedadBase
            ? (humedadDestino - humedadBase) / (100m - humedadBase) * 100m
            : 0m;
        var excesoMe = Math.Max(0m, materiasExtranasDestino - tolerancia);
        var esperadaPct = secado + manipuleo + excesoMe;
        var esperadaKg = kgRecibidos * esperadaPct / 100m;
        var noJustificada = mermaTotal - esperadaKg;
        var desvio = kgDespachados == 0 ? 0m : noJustificada / kgDespachados * 100m;

        analisis.ParametrosCompletos = true;
        analisis.SecadoPct = Math.Round(secado, 4);
        analisis.MateriasExtranasExcesoPct = Math.Round(excesoMe, 4);
        analisis.MermaEsperadaPct = Math.Round(esperadaPct, 4);
        analisis.MermaEsperadaKg = Kg(esperadaKg);
        analisis.DescuentoNoJustificadoKg = Kg(descuentoCalidad - esperadaKg);
        analisis.MermaNoJustificadaKg = Kg(noJustificada);
        analisis.DesvioPp = Math.Round(desvio, 4);
        analisis.NivelDesvio = Nivel(desvio, parametros.DesvioMedioPp, parametros.DesvioAltoPp);
        return analisis;
    }

    /// <summary>Un desvio negativo (la acopiadora desconto menos de lo esperado) es Bajo.</summary>
    public static string Nivel(decimal desvioPp, decimal medio = DesvioMedioPorDefecto, decimal alto = DesvioAltoPorDefecto)
    {
        if (desvioPp <= medio) return "Bajo";
        return desvioPp <= alto ? "Medio" : "Alto";
    }

    /// <summary>"Maíz", "maiz " y "MAIZ" son el mismo grano (mismo criterio que Almacenamiento).</summary>
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

    private static decimal Kg(decimal valor) => Math.Round(valor, 2);

    private static decimal Pct(decimal parte, decimal total) =>
        total == 0 ? 0m : Math.Round(parte / total * 100m, 4);
}
