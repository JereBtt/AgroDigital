using System.Globalization;
using System.Text;

namespace AgroDigital.Api.Services;

/*
    Calculos del modulo Cosechas. Se usan igual al registrar, al editar y al
    previsualizar, para que frontend y API clasifiquen con la misma regla.

    Tirada de Aros (metodo INTA PRECOP, cada aro cubre 0,25 m2):
      kg/ha = (granos / 0,25) x PMG / 100
      Perdida precosecha = granos que ya estaban en el suelo (promedio por aro).
      Perdida cabezal    = granos bajo el aro de cabezal, descontada la precosecha.
      Perdida cola       = promedio de los 3 aros de cola.
      Perdida total      = cabezal + cola (perdida atribuible a la cosechadora).

    Severidad, con la tolerancia del grano (T) y el factor de severidad (F):
      Baja  <= T
      Media <= T x F
      Alta  >  T x F

    Rinde seco: kg/ha llevados a la humedad base de comercializacion del grano.
      RindeSeco = Rinde x (100 - Humedad) / (100 - HumedadBase), si Humedad > Base.
*/
public static class CalculadoraPerdidasCosecha
{
    public const decimal AreaAroM2 = 0.25m;

    /// <summary>Factor de severidad cuando la empresa no definio uno propio.</summary>
    public const decimal FactorAltaPorDefecto = 1.5m;

    /// <summary>
    /// Grano sin referencia ni ajuste de empresa: se conservan los cortes anteriores
    /// al rediseno (Baja &lt; 80, Media hasta 150, Alta por encima).
    /// </summary>
    public const decimal ToleranciaGeneralKgHa = 80m;
    public const decimal FactorAltaGeneral = 1.875m;

    public sealed record ResultadoPerdida(
        decimal PerdidaPrecosecha, decimal PerdidaCabezal, decimal PerdidaCola, decimal PerdidaTotal, string Severidad);

    public static decimal KgHa(decimal granosPorAro, decimal pmg) =>
        granosPorAro / AreaAroM2 * pmg / 100m;

    public static ResultadoPerdida Calcular(
        int aroCabezal, int aroCola1, int aroCola2, int aroCola3, decimal? granosPrecosecha,
        decimal pmg, decimal toleranciaKgHa, decimal factorAlta)
    {
        var precosecha = granosPrecosecha ?? 0m;
        var cabezalNeto = Math.Max(0m, aroCabezal - precosecha);
        var promedioCola = (aroCola1 + aroCola2 + aroCola3) / 3m;

        var perdidaPrecosecha = KgHa(precosecha, pmg);
        var perdidaCabezal = KgHa(cabezalNeto, pmg);
        var perdidaCola = KgHa(promedioCola, pmg);
        var perdidaTotal = perdidaCabezal + perdidaCola;

        return new ResultadoPerdida(
            decimal.Round(perdidaPrecosecha, 4),
            decimal.Round(perdidaCabezal, 4),
            decimal.Round(perdidaCola, 4),
            decimal.Round(perdidaTotal, 4),
            Clasificar(perdidaTotal, toleranciaKgHa, factorAlta));
    }

    public static string Clasificar(decimal perdidaTotalKgHa, decimal toleranciaKgHa, decimal factorAlta)
    {
        if (perdidaTotalKgHa <= toleranciaKgHa) return "Baja";
        if (perdidaTotalKgHa <= toleranciaKgHa * factorAlta) return "Media";
        return "Alta";
    }

    public static decimal Rinde(decimal kgCosechados, decimal hectareas) =>
        decimal.Round(kgCosechados / hectareas, 4);

    public static decimal? RindeSeco(decimal rindeKgHa, decimal humedadPct, decimal? humedadBasePct)
    {
        if (humedadBasePct is null or <= 0 or >= 100) return null;
        if (humedadPct <= humedadBasePct.Value) return decimal.Round(rindeKgHa, 4);
        return decimal.Round(rindeKgHa * (100m - humedadPct) / (100m - humedadBasePct.Value), 4);
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
}
