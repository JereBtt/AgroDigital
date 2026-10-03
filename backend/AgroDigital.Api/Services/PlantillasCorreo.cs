using System.Globalization;
using System.Net;

namespace AgroDigital.Api.Services;

public sealed record CorreoArmado(string Asunto, string Html, string Texto);

/// <summary>
/// Plantillas de los correos de AgroDigital. HTML con estilos en linea
/// (los clientes de correo ignoran las hojas de estilo) y version de texto plano.
/// </summary>
public static class PlantillasCorreo
{
    private static readonly CultureInfo EsAr = CultureInfo.GetCultureInfo("es-AR");

    /// <summary>Invitacion del Admin a un Gerente/Dueno para activar su cuenta.</summary>
    public static CorreoArmado InvitacionGerente(string responsable, string enlace, DateTime? vencimientoUtc)
    {
        const string asunto = "Tu acceso a AgroDigital está listo";

        var nombre = WebUtility.HtmlEncode(responsable);
        var enlaceHtml = WebUtility.HtmlEncode(enlace);
        var vence = vencimientoUtc is { } fecha
            ? DateTime.SpecifyKind(fecha, DateTimeKind.Utc).ToLocalTime().ToString("dd/MM/yyyy 'a las' HH:mm", EsAr)
            : null;
        var textoVence = vence is null ? "El enlace es de un solo uso." : $"El enlace es de un solo uso y vence el {vence} hs.";

        var html = $$"""
            <!doctype html>
            <html lang="es">
            <body style="margin:0;padding:0;background:#f6f8f5;font-family:Arial,Helvetica,sans-serif;color:#14311f;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8f5;padding:24px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe8e1;border-radius:14px;overflow:hidden;">
                      <tr>
                        <td style="background:#0a4327;padding:20px 28px;font-size:22px;font-weight:bold;color:#ffffff;">
                          Agro<span style="color:#e8b23a;">Digital</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:28px;">
                          <h1 style="margin:0 0 14px;font-size:21px;color:#0a4327;">¡Hola, {{nombre}}!</h1>
                          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
                            Te dieron de alta como <strong>Gerente / Dueño</strong> en AgroDigital, el sistema para gestionar
                            tus campañas agrícolas de punta a punta: siembra, cosecha, almacenamiento y distribución.
                          </p>
                          <p style="margin:0 0 22px;font-size:15px;line-height:1.55;">
                            Para empezar, activá tu cuenta. Vas a completar tus datos, definir tu contraseña y registrar tus empresas.
                          </p>
                          <table role="presentation" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="background:#18883b;border-radius:10px;">
                                <a href="{{enlaceHtml}}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">
                                  Activar mi cuenta
                                </a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin:22px 0 6px;font-size:13px;color:#546359;">{{WebUtility.HtmlEncode(textoVence)}}</p>
                          <p style="margin:0 0 6px;font-size:13px;color:#546359;">Si el botón no funciona, copiá este enlace en tu navegador:</p>
                          <p style="margin:0;font-size:12px;word-break:break-all;"><a href="{{enlaceHtml}}" style="color:#18883b;">{{enlaceHtml}}</a></p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 28px;background:#f6f8f5;border-top:1px solid #dfe8e1;font-size:12px;color:#546359;line-height:1.5;">
                          Si no esperabas este correo, podés ignorarlo: sin activar la cuenta no se crea ningún acceso.
                          Este es un mensaje automático, no respondas a esta dirección.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """;

        var texto = $"""
            ¡Hola, {responsable}!

            Te dieron de alta como Gerente / Dueño en AgroDigital.
            Para empezar, activá tu cuenta desde este enlace. Vas a completar tus datos,
            definir tu contraseña y registrar tus empresas:

            {enlace}

            {textoVence}

            Si no esperabas este correo, podés ignorarlo.
            Este es un mensaje automático, no respondas a esta dirección.
            """;

        return new CorreoArmado(asunto, html, texto);
    }
}
