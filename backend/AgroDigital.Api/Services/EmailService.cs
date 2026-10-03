using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace AgroDigital.Api.Services;

public sealed record ResultadoEnvioCorreo(bool Enviado, string? Error);

public interface IEmailService
{
    /// <summary>
    /// Envia un correo. Nunca lanza excepcion por fallas del servidor de correo:
    /// devuelve Enviado = false y el motivo, para que el alta no se caiga
    /// si el correo no sale.
    /// </summary>
    Task<ResultadoEnvioCorreo> EnviarAsync(
        string destinatario,
        string nombreDestinatario,
        string asunto,
        string html,
        string textoPlano,
        CancellationToken cancellationToken = default);
}

/// <summary>Envio por SMTP con MailKit (smtp4dev en desarrollo, cualquier proveedor SMTP en produccion).</summary>
public sealed class SmtpEmailService(IOptions<EmailSettings> options, ILogger<SmtpEmailService> logger) : IEmailService
{
    private const int TimeoutMs = 15000;
    private const int LargoMaximoError = 480;

    public async Task<ResultadoEnvioCorreo> EnviarAsync(
        string destinatario,
        string nombreDestinatario,
        string asunto,
        string html,
        string textoPlano,
        CancellationToken cancellationToken = default)
    {
        var config = options.Value;

        try
        {
            var mensaje = new MimeMessage();
            mensaje.From.Add(new MailboxAddress(config.RemitenteNombre, config.RemitenteCorreo));
            mensaje.To.Add(new MailboxAddress(nombreDestinatario, destinatario));
            mensaje.Subject = asunto;
            mensaje.Body = new BodyBuilder { HtmlBody = html, TextBody = textoPlano }.ToMessageBody();

            using var cliente = new SmtpClient { Timeout = TimeoutMs };
            var seguridad = config.UsarSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.None;

            await cliente.ConnectAsync(config.Host, config.Port, seguridad, cancellationToken);

            if (!string.IsNullOrWhiteSpace(config.Usuario))
            {
                await cliente.AuthenticateAsync(config.Usuario, config.Password ?? string.Empty, cancellationToken);
            }

            await cliente.SendAsync(mensaje, cancellationToken);
            await cliente.DisconnectAsync(true, cancellationToken);

            logger.LogInformation("Correo \"{Asunto}\" enviado a {Destinatario}.", asunto, destinatario);
            return new ResultadoEnvioCorreo(true, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "No se pudo enviar el correo \"{Asunto}\" a {Destinatario}.", asunto, destinatario);

            var motivo = ex.Message.Length > LargoMaximoError ? ex.Message[..LargoMaximoError] : ex.Message;
            return new ResultadoEnvioCorreo(false, motivo);
        }
    }
}
