import type { WelcomeResponse } from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { User } from '../models/User.js';
import { loadSettings, toWelcome } from './siteSettings.service.js';

/**
 * Mensaje de bienvenida (el «pacto» con el lector). Lo escribe la autora en el panel; el servidor decide cuándo se
 * muestra: siempre que inicia sesión (`every_login`: si no lo vio desde su último ingreso) o solo la primera vez.
 */
export function createWelcomeService(deps: { clock: Clock }) {
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

  return { forUser, markSeen };
}

export type WelcomeService = ReturnType<typeof createWelcomeService>;
