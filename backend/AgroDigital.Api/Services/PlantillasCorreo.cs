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

    // =====================================================================
    // Invitacion del Admin a un Gerente / Dueno
    // =====================================================================

    public static CorreoArmado InvitacionGerente(string responsable, string enlace, DateTime? vencimientoUtc)
    {
        const string asunto = "Tu acceso a AgroDigital está listo";
        var textoVence = TextoVencimiento(vencimientoUtc);

        var cuerpo = $$"""
            <h1 style="margin:0 0 14px;font-size:21px;color:#0a4327;">¡Hola, {{Html(responsable)}}!</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              Te dieron de alta como <strong>Gerente / Dueño</strong> en AgroDigital, el sistema para gestionar
              tus campañas agrícolas de punta a punta: siembra, cosecha, almacenamiento y distribución.
            </p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.55;">
              Para empezar, activá tu cuenta. Vas a completar tus datos, definir tu contraseña y registrar tus empresas.
            </p>
            {{Boton("Activar mi cuenta", enlace)}}
            {{PieEnlace(textoVence, enlace)}}
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

        return new CorreoArmado(
            asunto,
            Envolver(cuerpo, "Si no esperabas este correo, podés ignorarlo: sin activar la cuenta no se crea ningún acceso."),
            texto);
    }

    // =====================================================================
    // Invitacion de un Gerente a un empleado
    // =====================================================================

    public static CorreoArmado InvitacionEmpleado(
        string? nombreInvitado,
        string nombreGerente,
        string? empresas,
        string codigoGrupo,
        string otp,
        string enlace,
        DateTime vencimientoUtc)
    {
        var asunto = $"{nombreGerente} te invitó a sumarte a AgroDigital";
        var saludo = string.IsNullOrWhiteSpace(nombreInvitado) ? "¡Hola!" : $"¡Hola, {nombreInvitado.Trim()}!";
        var textoVence = TextoVencimiento(vencimientoUtc);
        var lineaEmpresas = string.IsNullOrWhiteSpace(empresas) ? string.Empty : $" para trabajar con {empresas}";

        var cuerpo = $$"""
            <h1 style="margin:0 0 14px;font-size:21px;color:#0a4327;">{{Html(saludo)}}</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              <strong>{{Html(nombreGerente)}}</strong> te invitó a sumarte a su equipo en AgroDigital{{Html(lineaEmpresas)}}.
            </p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">
              Tocá el botón para solicitar tu acceso. Vas a cargar tus datos y definir tu contraseña;
              después, {{Html(nombreGerente)}} aprueba tu solicitud y te asigna un rol.
            </p>
            {{Boton("Solicitar acceso", enlace)}}
            <p style="margin:22px 0 8px;font-size:13px;color:#546359;">Si preferís cargarlos a mano, estos son tus datos de invitación:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #dfe8e1;border-radius:10px;">
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#546359;">Código de grupo</td>
                <td style="padding:12px 16px;font-size:16px;font-weight:bold;font-family:Consolas,monospace;color:#0a4327;text-align:right;">{{Html(codigoGrupo)}}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#546359;border-top:1px solid #dfe8e1;">OTP (un solo uso)</td>
                <td style="padding:12px 16px;font-size:16px;font-weight:bold;font-family:Consolas,monospace;color:#0a4327;text-align:right;border-top:1px solid #dfe8e1;">{{Html(otp)}}</td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-size:13px;color:#546359;">
              Usá este mismo correo al solicitar el acceso: la invitación es personal y no sirve con otro correo.
            </p>
            {{PieEnlace(textoVence, enlace)}}
            """;

        var texto = $"""
            {saludo}

            {nombreGerente} te invitó a sumarte a su equipo en AgroDigital{lineaEmpresas}.

            Solicitá tu acceso desde este enlace (los datos ya van cargados):
            {enlace}

            O cargalos a mano en "Solicitar acceso":
              Código de grupo: {codigoGrupo}
              OTP (un solo uso): {otp}

            Usá este mismo correo al solicitar el acceso: la invitación es personal.
            {textoVence}

            Si no esperabas este correo, podés ignorarlo.
            Este es un mensaje automático, no respondas a esta dirección.
            """;

        return new CorreoArmado(
            asunto,
            Envolver(cuerpo, "Si no esperabas este correo, podés ignorarlo: sin tu solicitud no se crea ningún acceso."),
            texto);
    }

    // =====================================================================
    // Solicitudes de acceso
    // =====================================================================

    /// <summary>Al Gerente: llego una solicitud nueva para aprobar.</summary>
    public static CorreoArmado NuevaSolicitud(string nombreGerente, string solicitante, string correoSolicitante, string enlace)
    {
        var asunto = $"Nueva solicitud de acceso: {solicitante}";

        var cuerpo = $$"""
            <h1 style="margin:0 0 14px;font-size:21px;color:#0a4327;">¡Hola, {{Html(nombreGerente)}}!</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              <strong>{{Html(solicitante)}}</strong> ({{Html(correoSolicitante)}}) pidió sumarse a tu grupo en AgroDigital.
            </p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.55;">
              Entrá a <strong>Usuarios</strong> para revisar sus datos, asignarle un rol en cada empresa y aprobar el acceso,
              o rechazar la solicitud si no corresponde.
            </p>
            {{Boton("Revisar la solicitud", enlace)}}
            """;

        var texto = $"""
            ¡Hola, {nombreGerente}!

            {solicitante} ({correoSolicitante}) pidió sumarse a tu grupo en AgroDigital.
            Entrá a Usuarios para revisar sus datos, asignarle un rol y aprobar el acceso:
            {enlace}

            Este es un mensaje automático, no respondas a esta dirección.
            """;

        return new CorreoArmado(
            asunto,
            Envolver(cuerpo, "Recibís este aviso porque sos el Gerente del grupo de gestión."),
            texto);
    }

    /// <summary>Al empleado: su solicitud fue aprobada, con su rol en cada empresa.</summary>
    public static CorreoArmado SolicitudAprobada(
        string nombre, string nombreGerente, IReadOnlyList<(string Empresa, string Rol)> accesos, string usuario, string enlace)
    {
        const string asunto = "¡Ya podés ingresar a AgroDigital!";

        var filas = string.Join(Environment.NewLine, accesos.Select((a, i) => $"""
            <tr>
              <td style="padding:11px 16px;font-size:14px;color:#14311f;{(i > 0 ? "border-top:1px solid #dfe8e1;" : "")}">{Html(a.Empresa)}</td>
              <td style="padding:11px 16px;font-size:14px;font-weight:bold;color:#0a4327;text-align:right;{(i > 0 ? "border-top:1px solid #dfe8e1;" : "")}">{Html(a.Rol)}</td>
            </tr>
            """));

        var cuerpo = $$"""
            <h1 style="margin:0 0 14px;font-size:21px;color:#0a4327;">¡Hola, {{Html(nombre)}}!</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              <strong>{{Html(nombreGerente)}}</strong> aprobó tu solicitud. Ya podés ingresar a AgroDigital con tu correo
              (<strong>{{Html(usuario)}}</strong>) y la contraseña que definiste.
            </p>
            <p style="margin:0 0 8px;font-size:13px;color:#546359;">Estos son tus accesos:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;border:1px solid #dfe8e1;border-radius:10px;">
              <tr>
                <td style="padding:9px 16px;font-size:12px;font-weight:bold;color:#546359;background:#f6f8f5;">Empresa</td>
                <td style="padding:9px 16px;font-size:12px;font-weight:bold;color:#546359;background:#f6f8f5;text-align:right;">Rol</td>
              </tr>
            {{filas}}
            </table>
            {{Boton("Ingresar a AgroDigital", enlace)}}
            """;

        var lineasAccesos = string.Join(Environment.NewLine, accesos.Select(a => $"  - {a.Empresa}: {a.Rol}"));
        var texto = $"""
            ¡Hola, {nombre}!

            {nombreGerente} aprobó tu solicitud. Ya podés ingresar a AgroDigital con tu correo
            ({usuario}) y la contraseña que definiste.

            Tus accesos:
            {lineasAccesos}

            Ingresá desde: {enlace}

            Este es un mensaje automático, no respondas a esta dirección.
            """;

        return new CorreoArmado(
            asunto,
            Envolver(cuerpo, "Si olvidaste tu contraseña, pedile ayuda a tu Gerente."),
            texto);
    }

    /// <summary>Al empleado: su solicitud fue rechazada.</summary>
    public static CorreoArmado SolicitudRechazada(string nombre, string nombreGerente)
    {
        const string asunto = "Tu solicitud de acceso a AgroDigital";

        var cuerpo = $$"""
            <h1 style="margin:0 0 14px;font-size:21px;color:#0a4327;">¡Hola, {{Html(nombre)}}!</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              Te contamos que <strong>{{Html(nombreGerente)}}</strong> no aprobó tu solicitud para sumarte a su grupo en AgroDigital.
            </p>
            <p style="margin:0;font-size:15px;line-height:1.55;">
              Si creés que se trata de un error, comunicate directamente con {{Html(nombreGerente)}}:
              puede enviarte una nueva invitación cuando lo necesites.
            </p>
            """;

        var texto = $"""
            ¡Hola, {nombre}!

            Te contamos que {nombreGerente} no aprobó tu solicitud para sumarte a su grupo en AgroDigital.
            Si creés que se trata de un error, comunicate directamente con {nombreGerente}:
            puede enviarte una nueva invitación cuando lo necesites.

            Este es un mensaje automático, no respondas a esta dirección.
            """;

        return new CorreoArmado(
            asunto,
            Envolver(cuerpo, "Recibís este aviso porque enviaste una solicitud de acceso a AgroDigital."),
            texto);
    }

    // =====================================================================
    // Piezas comunes
    // =====================================================================

    private static string Html(string valor) => WebUtility.HtmlEncode(valor);

    private static string TextoVencimiento(DateTime? vencimientoUtc)
    {
        if (vencimientoUtc is not { } fecha) return "El enlace es de un solo uso.";
        var local = DateTime.SpecifyKind(fecha, DateTimeKind.Utc).ToLocalTime();
        return $"Es de un solo uso y vence el {local.ToString("dd/MM/yyyy 'a las' HH:mm", EsAr)} hs.";
    }

    private static string Boton(string texto, string enlace) => $$"""
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#18883b;border-radius:10px;">
              <a href="{{Html(enlace)}}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">{{Html(texto)}}</a>
            </td>
          </tr>
        </table>
        """;

    private static string PieEnlace(string textoVence, string enlace) => $$"""
        <p style="margin:22px 0 6px;font-size:13px;color:#546359;">{{Html(textoVence)}}</p>
        <p style="margin:0 0 6px;font-size:13px;color:#546359;">Si el botón no funciona, copiá este enlace en tu navegador:</p>
        <p style="margin:0;font-size:12px;word-break:break-all;"><a href="{{Html(enlace)}}" style="color:#18883b;">{{Html(enlace)}}</a></p>
        """;

    private static string Envolver(string cuerpo, string aviso) => $$"""
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
        {{cuerpo}}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 28px;background:#f6f8f5;border-top:1px solid #dfe8e1;font-size:12px;color:#546359;line-height:1.5;">
                      {{Html(aviso)}}
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
}
