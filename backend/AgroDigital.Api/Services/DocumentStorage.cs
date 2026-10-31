namespace AgroDigital.Api.Services;

/// <summary>
/// Resuelve la carpeta persistente para los documentos cargados por los módulos.
/// En desarrollo conserva App_Data dentro de la API. En un hosting se configura
/// Storage:DocumentsPath con una ruta persistente y fuera de la publicación.
/// </summary>
public sealed class DocumentStorage(IConfiguration configuration, IWebHostEnvironment environment)
{
    private readonly string _root = ResolveRoot(configuration["Storage:DocumentsPath"], environment.ContentRootPath);

    public string For(string module) => Path.Combine(_root, module);

    private static string ResolveRoot(string? configuredPath, string contentRootPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.Combine(contentRootPath, "App_Data");
        }

        return Path.IsPathRooted(configuredPath)
            ? Path.GetFullPath(configuredPath)
            : Path.GetFullPath(Path.Combine(contentRootPath, configuredPath));
    }
}
