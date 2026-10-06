export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Dirección a la que se responde (p. ej. el visitante que escribió por el formulario de contacto). */
  replyTo?: string;
}

/**
 * Proveedor de correo. Adaptadores: `memory` (desarrollo y pruebas), `gmail` (SMTP, solo en servicios
 * de Render de pago porque el plan gratuito bloquea SMTP) y `resend` (API HTTP). Se elige con MAIL_PROVIDER.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

/** Falla de entrega de un proveedor real. El mensaje nunca incluye claves ni el contenido del correo. */
export class MailDeliveryError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
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
}
