export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Dirección a la que se responde (p. ej. el visitante que escribió por el formulario de contacto). */
  replyTo?: string;
  /** Remitente de este mensaje (los avisos de novedades usan el suyo); sin él, el del proveedor. */
  from?: string;
  /** Cabeceras propias (p. ej. `List-Unsubscribe` y `List-Unsubscribe-Post` de los avisos). */
  headers?: Record<string, string>;
}

export interface BatchOptions {
  /** Clave para que el proveedor no repita el lote si se reintenta (Resend la recuerda 24 h). */
  idempotencyKey?: string;
}

/**
 * Proveedor de correo. Adaptadores: `memory` (desarrollo y pruebas), `gmail` (SMTP, solo en servicios
 * de Render de pago porque el plan gratuito bloquea SMTP) y `resend` (API HTTP). Se elige con MAIL_PROVIDER.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
  /**
   * Varios correos en una sola petición (un destinatario por correo; nadie ve a los demás). Todo o nada: si falla, no
   * salió ninguno (salvo un error de red, que deja la duda: por eso la clave de idempotencia). Opcional: sin él se envía
   * uno por uno.
   */
  sendBatch?(messages: MailMessage[], options?: BatchOptions): Promise<void>;
}

/** Envía un lote con `sendBatch` si el proveedor lo tiene; si no, uno por uno. */
export async function sendMany(
  provider: MailProvider,
  messages: MailMessage[],
  options: BatchOptions = {},
): Promise<void> {
  if (messages.length === 0) return;
  if (provider.sendBatch) return provider.sendBatch(messages, options);
  for (const message of messages) await provider.send(message);
}

/** Falla de entrega de un proveedor real. El mensaje nunca incluye claves ni el contenido del correo. */
export class MailDeliveryError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
    /**
     * Por qué falló, cuando el proveedor lo dice: cupo del día o del mes agotado, demasiadas peticiones por segundo, o
     * un error de red (no se sabe si salió).
     */
    public readonly reason?: 'daily_quota' | 'monthly_quota' | 'rate_limit' | 'network',
    /** Segundos que pide esperar el proveedor (`retry-after`). */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

interface MemoryMailOptions {
  /** Se llama con cada correo "enviado" (en desarrollo sirve para ver el enlace de recuperación en la consola). */
  onSend?: (message: MailMessage) => void;
}

/** Adaptador en memoria: guarda los correos "enviados" sin mandarlos a nadie. */
export class MemoryMailProvider implements MailProvider {
  readonly sent: MailMessage[] = [];

  constructor(private readonly options: MemoryMailOptions = {}) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    this.options.onSend?.(message);
  }

  /** Lotes recibidos (con su clave), para las pruebas. */
  readonly batches: Array<{ size: number; idempotencyKey?: string | undefined }> = [];

  async sendBatch(messages: MailMessage[], options: BatchOptions = {}): Promise<void> {
    this.batches.push({ size: messages.length, idempotencyKey: options.idempotencyKey });
    for (const message of messages) await this.send(message);
  }
}
