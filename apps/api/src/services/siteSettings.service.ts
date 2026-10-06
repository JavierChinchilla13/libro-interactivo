import { SiteSettings } from '../models/SiteSettings.js';

export interface ContactSettings {
  recipientEmail: string | undefined;
  storeMessages: boolean;
  retentionDays: number;
}

/**
 * Ajustes de contacto del sitio. El documento único se crea la primera vez que se necesita.
 * Hasta que el panel (fase 11) permita editarlo, el destinatario puede venir de CONTACT_RECIPIENT_EMAIL.
 */
export async function getContactSettings(
  fallbackRecipient: string | undefined,
): Promise<ContactSettings> {
  const settings = await SiteSettings.findOneAndUpdate(
    { key: 'site' },
    { $setOnInsert: { key: 'site' } },
    { upsert: true, returnDocument: 'after' },
  );
  const stored = settings.contact?.recipientEmail?.trim();
  return {
    recipientEmail: stored ? stored : fallbackRecipient,
    storeMessages: settings.contact?.storeMessages ?? true,
    retentionDays: settings.contact?.retentionDays ?? 365,
  };
}
