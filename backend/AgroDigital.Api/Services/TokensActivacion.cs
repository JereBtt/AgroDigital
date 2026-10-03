using System.Security.Cryptography;
using System.Text;

namespace AgroDigital.Api.Services;

/// <summary>
/// Tokens de un solo uso para los enlaces de los correos (ej. activacion de Gerente).
/// El token viaja en el enlace; en la base se guarda solo su hash SHA-256,
/// asi una filtracion de la base no permite activar cuentas.
/// </summary>
public static class TokensActivacion
{
    /// <summary>32 bytes aleatorios (256 bits) en Base64 apto para URL (43 caracteres).</summary>
    public static string Generar()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    /// <summary>Hash SHA-256 en hexadecimal (64 caracteres), el valor que se guarda en la base.</summary>
    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim())));

    /// <summary>Formato esperado: 43 caracteres Base64 URL. Evita consultar la base con basura.</summary>
    public static bool FormatoValido(string? token) =>
        !string.IsNullOrWhiteSpace(token)
        && token.Trim().Length == 43
        && token.Trim().All(c => char.IsAsciiLetterOrDigit(c) || c == '-' || c == '_');
}
