import { CONTACT_MIN_FILL_MS, type ContactRequest } from '@libro/shared';
import type { BackgroundTasks } from '../lib/background.js';
import { addDays, type Clock } from '../lib/clock.js';
import { hashIp } from '../lib/crypto.js';
import { removeNullBytes } from '../lib/html.js';
import type { Logger } from '../lib/logger.js';
import { ContactMessage } from '../models/ContactMessage.js';
import type { MailProvider } from '../providers/mail/MailProvider.js';
import type { RequestMeta } from './auth.service.js';
import { contactMessageEmail } from './email.templates.js';
import { getContactSettings } from './siteSettings.service.js';

const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60_000;

export interface ContactServiceOptions {
  mail: MailProvider;
  tasks: BackgroundTasks;
  clock: Clock;
  logger: Logger;
  /** Destinatario de respaldo hasta que se configure en el panel. */
  fallbackRecipient: string | undefined;
  ipSecret: string;
}

/** ¿Parece un bot? Campo trampa lleno, o formulario enviado demasiado rápido / con hora imposible. */
export function looksLikeBot(input: ContactRequest, now: Date): boolean {
  if (input.website.trim() !== '') return true;
  const elapsed = now.getTime() - input.startedAt;
  return elapsed < CONTACT_MIN_FILL_MS || elapsed > MAX_FORM_AGE_MS || elapsed < -CLOCK_SKEW_MS;
}

export function createContactService(options: ContactServiceOptions) {
  const { mail, tasks, clock, logger, fallbackRecipient, ipSecret } = options;

  return {
    /**
     * Recibe un mensaje del formulario. Si parece un bot se descarta en silencio (el bot cree que
     * funcionó). Si no, se guarda (si está activado) y se envía por correo a la autora en segundo plano.
     */
    async submit(input: ContactRequest, meta: RequestMeta): Promise<void> {
      const now = clock();
      if (looksLikeBot(input, now)) return;

      const settings = await getContactSettings(fallbackRecipient);
      const recipient = settings.recipientEmail;
      if (!recipient) {
        logger.error(
          'Mensaje de contacto recibido pero no hay destinatario configurado (CONTACT_RECIPIENT_EMAIL)',
        );
      }

      // Sin destinatario no se puede perder el mensaje: se guarda aunque el guardado esté desactivado.
      const stored =
        settings.storeMessages || !recipient
          ? await ContactMessage.create({
              name: input.name,
              email: input.email,
              message: removeNullBytes(input.message),
              ipHash: meta.ip ? hashIp(meta.ip, ipSecret) : undefined,
              userAgent: meta.userAgent?.slice(0, 200),
              expiresAt: addDays(now, settings.retentionDays),
            })
          : null;

      if (!recipient) return;
      tasks.run('contact-email', async () => {
        await mail.send({
          to: recipient,
          replyTo: input.email,
          ...contactMessageEmail({
            name: input.name,
            email: input.email,
            message: input.message,
            receivedAt: now,
          }),
        });
        if (stored)
          await ContactMessage.updateOne({ _id: stored._id }, { $set: { emailSent: true } });
      });
    },
  };
}

export type ContactService = ReturnType<typeof createContactService>;
