namespace AgroDigital.Api.Services;

/// <summary>
/// Configuracion del envio de correos (seccion "Email" de appsettings.json).
/// En desarrollo apunta a smtp4dev (localhost:2525, sin usuario ni SSL).
/// Para un proveedor real (ej. Brevo) se cambian estos valores, no el codigo.
/// Las credenciales reales van en user-secrets, nunca en el repositorio.
/// </summary>
public sealed class EmailSettings
{
    public const string Seccion = "Email";

    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 2525;

    /// <summary>true = STARTTLS (proveedores reales, puerto 587). false = sin cifrado (smtp4dev).</summary>
    public bool UsarSsl { get; set; }

    public string? Usuario { get; set; }
    public string? Password { get; set; }

    public string RemitenteNombre { get; set; } = "AgroDigital";
    public string RemitenteCorreo { get; set; } = "no-responder@agrodigital.local";

    /// <summary>URL del front, para armar los enlaces de los correos.</summary>
    public string UrlAplicacion { get; set; } = "http://localhost:5173";
}
