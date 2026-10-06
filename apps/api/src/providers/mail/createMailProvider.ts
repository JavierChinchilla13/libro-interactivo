import type { Env } from '../../config/env.js';
import type { Logger } from '../../lib/logger.js';
import { MemoryMailProvider, type MailProvider } from './MailProvider.js';
import { ResendMailProvider } from './ResendMailProvider.js';
import { createGmailProvider } from './SmtpMailProvider.js';

type MailEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'MAIL_PROVIDER'
  | 'MAIL_FROM'
  | 'GMAIL_USER'
  | 'GMAIL_APP_PASSWORD'
  | 'RESEND_API_KEY'
>;

/** Elige el adaptador de correo según MAIL_PROVIDER (la validación del entorno ya garantizó los datos). */
export function createMailProvider(env: MailEnv, logger?: Logger): MailProvider {
  switch (env.MAIL_PROVIDER) {
    case 'resend':
      return new ResendMailProvider({
        apiKey: env.RESEND_API_KEY ?? '',
        from: env.MAIL_FROM ?? '',
      });
    case 'gmail':
      return createGmailProvider({
        user: env.GMAIL_USER ?? '',
        appPassword: env.GMAIL_APP_PASSWORD ?? '',
        from: env.MAIL_FROM,
      });
    case 'memory':
      return new MemoryMailProvider({
        // Solo en desarrollo: muestra en la consola lo que se "enviaría" (incluye enlaces de recuperación).
        onSend:
          env.NODE_ENV === 'development' && logger
            ? (message) => {
                logger.info(
                  { to: message.to, subject: message.subject },
                  `[correo simulado]\n${message.text}`,
                );
              }
            : undefined,
      });
  }
}
