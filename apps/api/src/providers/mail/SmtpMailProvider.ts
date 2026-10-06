import nodemailer, { type Transporter } from 'nodemailer';
import { MailDeliveryError, type MailMessage, type MailProvider } from './MailProvider.js';

export interface SmtpOptions {
  host: string;
  port: number;
  /** true = TLS directo (puerto 465); false = STARTTLS (587). */
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** Inyectable para pruebas (p. ej. `nodemailer.createTransport({ jsonTransport: true })`). */
  transport?: Transporter;
}

/**
 * Envío por SMTP con nodemailer. OJO: Render bloquea los puertos 25/465/587 en servicios gratuitos;
 * este adaptador solo funciona en un servicio de pago (o en local).
 */
export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.transporter =
      options.transport ??
      nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: { user: options.user, pass: options.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.options.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });
    } catch (error) {
      // Se conserva solo el código del error de SMTP (EAUTH, ETIMEDOUT…): nunca credenciales ni contenido.
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'ERROR';
      throw new MailDeliveryError('smtp', `Falló el envío por SMTP (${code})`);
    }
  }
}

/** Gmail con una cuenta exclusiva de la app y su contraseña de aplicación (requiere verificación en dos pasos). */
export function createGmailProvider(options: {
  user: string;
  appPassword: string;
  from?: string | undefined;
}): SmtpMailProvider {
  return new SmtpMailProvider({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: options.user,
    pass: options.appPassword,
    from: options.from ?? `Libro Interactivo <${options.user}>`,
  });
}
