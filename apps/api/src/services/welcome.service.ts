import type {
  SiteSettingsResponse,
  UpdateSiteSettingsRequest,
  WelcomeResponse,
  WelcomeSettings,
} from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { User } from '../models/User.js';
import type { Actor } from './progress.service.js';

async function loadSettings() {
  return SiteSettings.findOneAndUpdate(
    { key: 'site' },
    { $setOnInsert: { key: 'site' } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
}

function toWelcome(settings: Awaited<ReturnType<typeof loadSettings>>): WelcomeSettings {
  const welcome = settings?.welcome;
  return {
    enabled: welcome?.enabled ?? false,
    ...(welcome?.title ? { title: welcome.title } : {}),
    bodyHtml: welcome?.bodyHtml ?? '',
    showMode: welcome?.showMode ?? 'every_login',
  };
}

/**
 * Mensaje de bienvenida (el «pacto» con el lector). Lo escribe la autora en el panel; el servidor decide cuándo se
 * muestra: siempre que inicia sesión (`every_login`: si no lo vio desde su último ingreso) o solo la primera vez.
 */
export function createWelcomeService(deps: { clock: Clock }) {
  async function getSettings(): Promise<SiteSettingsResponse> {
    return { welcome: toWelcome(await loadSettings()) };
  }

  async function updateSettings(
    actor: Actor,
    request: UpdateSiteSettingsRequest,
  ): Promise<SiteSettingsResponse> {
    const { welcome } = request;
    const bodyHtml = sanitizeRichHtml(welcome.bodyHtml);
    if (welcome.enabled && bodyHtml === '') {
      throw new AppError('VALIDATION', 'Escribe el mensaje antes de activarlo');
    }
    await SiteSettings.updateOne(
      { key: 'site' },
      {
        $set: {
          'welcome.enabled': welcome.enabled,
          'welcome.bodyHtml': bodyHtml,
          'welcome.showMode': welcome.showMode,
          ...(welcome.title ? { 'welcome.title': welcome.title } : {}),
          updatedBy: actor.userId,
        },
        ...(welcome.title ? {} : { $unset: { 'welcome.title': 1 } }),
      },
      { upsert: true },
    );
    return getSettings();
  }

  /** ¿Debe verlo ahora esta persona? Sin contenido o desactivado ⇒ nunca. */
  async function forUser(userId: string): Promise<WelcomeResponse> {
    const [settings, user] = await Promise.all([
      loadSettings(),
      User.findById(userId).select('welcomeSeenAt lastLoginAt').lean(),
    ]);
    const welcome = toWelcome(settings);
    if (!user || !welcome.enabled || welcome.bodyHtml === '') return { show: false };
    const seen = user.welcomeSeenAt ?? undefined;
    const lastLogin = user.lastLoginAt ?? undefined;
    const show =
      !seen || (welcome.showMode === 'every_login' && lastLogin !== undefined && seen < lastLogin);
    return show
      ? {
          show: true,
          ...(welcome.title ? { title: welcome.title } : {}),
          bodyHtml: welcome.bodyHtml,
        }
      : { show: false };
  }

  async function markSeen(userId: string): Promise<void> {
    await User.updateOne({ _id: userId }, { $set: { welcomeSeenAt: deps.clock() } });
  }

  return { getSettings, updateSettings, forUser, markSeen };
}

export type WelcomeService = ReturnType<typeof createWelcomeService>;
