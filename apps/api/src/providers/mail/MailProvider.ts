export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Proveedor de correo por API HTTP (Render gratuito bloquea SMTP). Adaptadores reales: fase 4. */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

/** Adaptador en memoria para pruebas y desarrollo: guarda los correos "enviados". */
export class MemoryMailProvider implements MailProvider {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}
