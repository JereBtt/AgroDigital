using AgroDigital.Api.Models;

namespace AgroDigital.Api.Services;

public interface IAuthTokenService
{
    string CreateToken(UsuarioLogin usuario);
    bool TryValidate(string token, out AuthenticatedUser? usuario);
}
