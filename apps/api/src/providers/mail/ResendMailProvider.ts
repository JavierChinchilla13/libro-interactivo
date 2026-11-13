import {
  MailDeliveryError,
  type BatchOptions,
  type MailMessage,
  type MailProvider,
} from './MailProvider.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';

export interface ResendOptions {
  apiKey: string;
  /** Remitente con dominio verificado en Resend, p. ej. `Universo Memorias <avisos@midominio.com>`. */
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

  private payload(message: MailMessage) {
    return {
      from: message.from ?? this.options.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    };
  }

  private async post(url: string, body: unknown, extraHeaders: Record<string, string> = {}) {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MailDeliveryError(
        'resend',
        'No se pudo contactar con Resend (red o tiempo agotado)',
        undefined,
        'network',
      );
    }

    if (!response.ok) {
      // Resend explica el motivo (p. ej. "domain is not verified"); se recorta y no incluye datos nuestros.
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      let reason: MailDeliveryError['reason'];
      if (response.status === 429) {
        if (detail.includes('daily_quota_exceeded')) reason = 'daily_quota';
        else if (detail.includes('monthly_quota_exceeded')) reason = 'monthly_quota';
        else reason = 'rate_limit';
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new MailDeliveryError(
        'resend',
        `Resend rechazó el envío (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
        response.status,
        reason,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
  }

  async send(message: MailMessage): Promise<void> {
    await this.post(RESEND_ENDPOINT, this.payload(message));
  }

  /** `POST /emails/batch`: hasta 100 correos por petición, cada uno con su destinatario y sus cabeceras. */
  async sendBatch(messages: MailMessage[], options: BatchOptions = {}): Promise<void> {
    if (messages.length === 0) return;
    await this.post(
      RESEND_BATCH_ENDPOINT,
      messages.map((message) => this.payload(message)),
      options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {},
    );
  }
}
