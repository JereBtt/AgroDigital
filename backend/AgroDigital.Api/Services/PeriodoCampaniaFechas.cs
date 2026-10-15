using System.Text.RegularExpressions;

namespace AgroDigital.Api.Services;

public static class PeriodoCampaniaFechas
{
    public static string OperativoActual() => OperativoPara(DateOnly.FromDateTime(DateTime.Today));

    public static string OperativoPara(DateOnly fecha)
    {
        var inicio = fecha.Month >= 6 ? fecha.Year : fecha.Year - 1;
        return $"{inicio}-{inicio + 1}";
    }

    public static (DateOnly Inicio, DateOnly Fin, string Periodo) Limites(string? periodo, DateOnly? fechaReferencia = null)
    {
        var match = Regex.Match(periodo ?? "", @"(?<!\d)(\d{4})-(\d{4})(?!\d)");
        var valor = match.Success && int.Parse(match.Groups[2].Value) == int.Parse(match.Groups[1].Value) + 1
            ? match.Value : fechaReferencia.HasValue ? OperativoPara(fechaReferencia.Value) : OperativoActual();
        var inicio = int.Parse(valor[..4]);
        var fin = int.Parse(valor[5..]);
        return (new DateOnly(inicio, 1, 1), new DateOnly(fin, 12, 31), valor);
    }

    public static void Validar(DateOnly fecha, string? periodo, string campo, DateOnly? fechaReferencia = null)
    {
        var (inicio, fin, nombre) = Limites(periodo, fechaReferencia);
        if (fecha < inicio || fecha > fin)
            throw new InvalidOperationException($"La {campo} debe estar entre el 01/01/{inicio.Year} y el 31/12/{fin.Year} (campaña {nombre}).");
    }
}
