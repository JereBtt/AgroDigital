using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AgroDigital.Api.Models;

namespace AgroDigital.Api.Services;

public sealed class HmacAuthTokenService : IAuthTokenService
{
    private readonly byte[] _signingKey;

    public HmacAuthTokenService(IConfiguration configuration)
    {
        var configuredKey = configuration["Auth:SigningKey"];
        _signingKey = string.IsNullOrWhiteSpace(configuredKey)
            ? RandomNumberGenerator.GetBytes(64)
            : Encoding.UTF8.GetBytes(configuredKey);
    }

    public string CreateToken(UsuarioLogin usuario)
    {
        var payload = new TokenPayload(
            usuario.UsuarioId,
            usuario.Usuario,
            usuario.Rol,
            DateTimeOffset.UtcNow.AddHours(8).ToUnixTimeSeconds()
        );

        var payloadJson = JsonSerializer.Serialize(payload);
        var payloadSegment = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));
        var signatureSegment = Base64UrlEncode(Sign(payloadSegment));

        return $"{payloadSegment}.{signatureSegment}";
    }

    public bool TryValidate(string token, out AuthenticatedUser? usuario)
    {
        usuario = null;
        var parts = token.Split('.', 2);
        if (parts.Length != 2)
        {
            return false;
        }

        var expectedSignature = Sign(parts[0]);
        var actualSignature = Base64UrlDecode(parts[1]);
        if (actualSignature is null || !CryptographicOperations.FixedTimeEquals(expectedSignature, actualSignature))
        {
            return false;
        }

        try
        {
            var payloadJson = Encoding.UTF8.GetString(Base64UrlDecode(parts[0]) ?? []);
            var payload = JsonSerializer.Deserialize<TokenPayload>(payloadJson);
            if (payload is null || payload.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            {
                return false;
            }

            usuario = new AuthenticatedUser(payload.UsuarioId, payload.Usuario, payload.Rol);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private byte[] Sign(string payloadSegment)
    {
        using var hmac = new HMACSHA256(_signingKey);
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadSegment));
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[]? Base64UrlDecode(string value)
    {
        try
        {
            var base64 = value.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            return Convert.FromBase64String(base64);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private sealed record TokenPayload(int UsuarioId, string Usuario, string Rol, long ExpiresAt);
}
