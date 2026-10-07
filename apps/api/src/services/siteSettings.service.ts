import {
  imageRefSchema,
  type AuthorSettings,
  type PublicSiteResponse,
  type SiteSettingsResponse,
  type SocialLink,
  type UniverseSettings,
  type UpdateSiteSettingsRequest,
  type WelcomeSettings,
} from '@libro/shared';
import { AppError } from '../lib/errors.js';
import { assertCloudinaryUrls } from '../lib/images.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { SiteSettings } from '../models/SiteSettings.js';
import type { Actor } from './progress.service.js';

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

/** Texto por defecto de lo que aún no se puede abrir (la autora lo cambia en el panel). */
export const DEFAULT_LOCK_MESSAGE = 'Bloqueado: avanza en tu lectura';

export async function loadSettings() {
  return SiteSettings.findOneAndUpdate(
    { key: 'site' },
    { $setOnInsert: { key: 'site' } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
}
type Loaded = Awaited<ReturnType<typeof loadSettings>>;

export function toWelcome(settings: Loaded): WelcomeSettings {
  const welcome = settings?.welcome;
  return {
    enabled: welcome?.enabled ?? false,
    ...(welcome?.title ? { title: welcome.title } : {}),
    bodyHtml: welcome?.bodyHtml ?? '',
    showMode: welcome?.showMode ?? 'every_login',
  };
}

function toUniverse(settings: Loaded): UniverseSettings {
  return {
    ...(settings?.universe?.headline ? { headline: settings.universe.headline } : {}),
    introHtml: settings?.universe?.introHtml ?? '',
  };
}

function toAuthor(settings: Loaded): AuthorSettings {
  const author = settings?.author;
  const photo = imageRefSchema.safeParse(author?.photo);
  return {
    ...(author?.name ? { name: author.name } : {}),
    bioHtml: author?.bioHtml ?? '',
    ...(photo.success ? { photo: photo.data } : {}),
    ...(author?.publicEmail ? { publicEmail: author.publicEmail } : {}),
  };
}

function toSocial(settings: Loaded): SocialLink[] {
  return (settings?.social ?? []).map((link) => ({ label: link.label, url: link.url }));
}

/**
 * Ajustes del sitio que edita la autora: bienvenida, presentación del universo, autora, redes y el texto de
 * «bloqueado». Todo el HTML se sanea al guardar. Lo público sale por `getPublic` (sin bienvenida ni correo privado).
 */
export function createSiteSettingsService() {
  async function getSettings(): Promise<SiteSettingsResponse> {
    const settings = await loadSettings();
    return {
      welcome: toWelcome(settings),
      universe: toUniverse(settings),
      author: toAuthor(settings),
      social: toSocial(settings),
      lock: settings?.lock?.message ? { message: settings.lock.message } : {},
    };
  }

  async function updateSettings(
    actor: Actor,
    request: UpdateSiteSettingsRequest,
  ): Promise<SiteSettingsResponse> {
    const set: Record<string, unknown> = { updatedBy: actor.userId };
    const unset: Record<string, 1> = {};
    /** Un texto opcional: con valor se guarda; vacío se quita. */
    const optional = (path: string, value: string | undefined) => {
      if (value) set[path] = value;
      else unset[path] = 1;
    };

    const { welcome, universe, author, social, lock } = request;

    if (welcome) {
      const bodyHtml = sanitizeRichHtml(welcome.bodyHtml);
      if (welcome.enabled && bodyHtml === '') {
        throw new AppError('VALIDATION', 'Escribe el mensaje antes de activarlo');
      }
      set['welcome.enabled'] = welcome.enabled;
      set['welcome.bodyHtml'] = bodyHtml;
      set['welcome.showMode'] = welcome.showMode;
      optional('welcome.title', welcome.title);
    }
    if (universe) {
      set['universe.introHtml'] = sanitizeRichHtml(universe.introHtml);
      optional('universe.headline', universe.headline);
    }
    if (author) {
      assertCloudinaryUrls([author.photo?.url]);
      set['author.bioHtml'] = sanitizeRichHtml(author.bioHtml);
      optional('author.name', author.name);
      optional('author.publicEmail', author.publicEmail);
      if (author.photo) set['author.photo'] = author.photo;
      else unset['author.photo'] = 1;
    }
    if (social) set['social'] = social;
    if (lock) optional('lock.message', lock.message);

    await SiteSettings.updateOne(
      { key: 'site' },
      { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      { upsert: true },
    );
    return getSettings();
  }

  /** Lo que ve cualquier visitante. Nada de la bienvenida ni del correo donde llegan los mensajes. */
  async function getPublic(): Promise<PublicSiteResponse> {
    const settings = await loadSettings();
    return {
      universe: toUniverse(settings),
      author: toAuthor(settings),
      social: toSocial(settings),
      lockMessage: settings?.lock?.message || DEFAULT_LOCK_MESSAGE,
    };
  }

  return { getSettings, updateSettings, getPublic };
}

export type SiteSettingsService = ReturnType<typeof createSiteSettingsService>;
