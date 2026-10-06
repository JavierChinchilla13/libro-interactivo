import { MailDeliveryError, type MailMessage, type MailProvider } from './MailProvider.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendOptions {
  apiKey: string;
  /** Remitente con dominio verificado en Resend, p. ej. `Libro Interactivo <avisos@midominio.com>`. */
  from: string;
  /** Inyectable para pruebas. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Envío por la API HTTP de Resend (funciona en Render gratis: no usa SMTP). */
export class ResendMailProvider implements MailProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ResendOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async send(message: MailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MailDeliveryError(
        'resend',
        'No se pudo contactar con Resend (red o tiempo agotado)',
      );
    }

    if (!response.ok) {
      // Resend explica el motivo (p. ej. "domain is not verified"); se recorta y no incluye datos nuestros.
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw new MailDeliveryError(
        'resend',
        `Resend rechazó el envío (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
        response.status,
      );
    }
  }
}
