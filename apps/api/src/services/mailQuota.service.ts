import type { MailQuota } from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import type { Logger } from '../lib/logger.js';
import { MailUsage } from '../models/MailUsage.js';
import {
  sendMany,
  type BatchOptions,
  type MailMessage,
  type MailProvider,
} from '../providers/mail/MailProvider.js';

export interface QuotaConfig {
  /** Correos al día del proveedor (día UTC). */
  dailyLimit: number;
  monthlyLimit: number;
  /** Correos al día que los avisos nunca usan (quedan para los transaccionales). */
  reserve: number;
}

export interface UsageSnapshot {
  today: { transactional: number; notifications: number };
  /** Correos de este mes **antes de hoy** (todos los tipos). */
  monthBeforeToday: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `AAAA-MM-DD` del día UTC (el de Resend: el cupo diario se reinicia a medianoche UTC). */
export function utcDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Primer instante del día UTC siguiente (cuando se reinicia el cupo diario). */
export function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

/** Primer instante del mes UTC siguiente (cuando se reinicia el cupo mensual). */
export function nextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

/** Días del mes UTC que quedan **después** de hoy. */
export function daysAfterToday(date: Date): number {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return lastDay - date.getUTCDate();
}

/**
 * Lo que les queda a los avisos, con prioridad para los transaccionales:
 * - **hoy:** el límite diario menos lo que ya usaron los avisos y menos la reserva (o lo que ya gastaron los
 *   transaccionales, si pasaron de la reserva);
 * - **este mes:** el límite mensual menos lo usado, menos la reserva de hoy y la de cada día que queda del mes (decisión
 *   P4: reserva diaria × días que quedan);
 * - lo disponible hoy nunca pasa de lo que queda del mes.
 */
export function computeQuota(config: QuotaConfig, usage: UsageSnapshot, now: Date): MailQuota {
  const transactionalToday = Math.max(config.reserve, usage.today.transactional);
  const daily = config.dailyLimit - transactionalToday - usage.today.notifications;
  const month =
    config.monthlyLimit -
    usage.monthBeforeToday -
    transactionalToday -
    usage.today.notifications -
    config.reserve * daysAfterToday(now);
  const monthLeft = Math.max(0, month);
  return {
    todayLeft: Math.max(0, Math.min(daily, monthLeft)),
    monthLeft,
    reserve: config.reserve,
    dailyLimit: config.dailyLimit,
    monthlyLimit: config.monthlyLimit,
  };
}

/**
 * Días de envío que tardaría un aviso a `recipients` personas: hoy (si queda cupo) más los días completos que hagan
 * falta, con lo que queda cada día después de la reserva. Es una estimación: no cuenta los transaccionales de más.
 */
export function estimateDays(quota: MailQuota, recipients: number): number {
  if (recipients === 0) return 0;
  if (quota.todayLeft >= recipients) return 1;
  const perDay = Math.max(1, quota.dailyLimit - quota.reserve);
  const rest = recipients - quota.todayLeft;
  return (quota.todayLeft > 0 ? 1 : 0) + Math.ceil(rest / perDay);
}

export function createMailQuota(deps: { config: QuotaConfig; clock: Clock }) {
  return {
    /** Suma `count` correos enviados de un tipo al día UTC de hoy (atómico). */
    async record(type: 'transactional' | 'notifications', count: number): Promise<void> {
      if (count <= 0) return;
      const now = deps.clock();
      await MailUsage.updateOne(
        { day: utcDay(now) },
        {
          $inc: { [type]: count },
          // Se borra pasados ~13 meses.
          $setOnInsert: { expireAt: new Date(now.getTime() + 400 * 86_400_000) },
        },
        { upsert: true },
      );
    },

    async usage(): Promise<UsageSnapshot> {
      const now = deps.clock();
      const today = utcDay(now);
      const monthStart = `${today.slice(0, 7)}-01`;
      const docs = await MailUsage.find({ day: { $gte: monthStart, $lte: today } }).lean();
      const todayDoc = docs.find((doc) => doc.day === today);
      return {
        today: {
          transactional: todayDoc?.transactional ?? 0,
          notifications: todayDoc?.notifications ?? 0,
        },
        monthBeforeToday: docs
          .filter((doc) => doc.day !== today)
          .reduce((sum, doc) => sum + doc.transactional + doc.notifications, 0),
      };
    },

    async quota(): Promise<MailQuota> {
      return computeQuota(deps.config, await this.usage(), deps.clock());
    },
  };
}

export type MailQuotaService = ReturnType<typeof createMailQuota>;

/**
 * Envoltorio de `MailProvider` que cuenta cada correo que el proveedor aceptó: los envíos sueltos son transaccionales
 * (recuperar contraseña, contacto, avisos de respaldo, confirmación de novedades) y los lotes son avisos. Contar nunca
 * hace fallar un envío: si el contador falla, se anota y el correo sale igual.
 */
export class CountingMailProvider implements MailProvider {
  constructor(
    private readonly inner: MailProvider,
    private readonly quota: MailQuotaService,
    private readonly logger?: Logger,
  ) {}

  private async count(type: 'transactional' | 'notifications', n: number) {
    try {
      await this.quota.record(type, n);
    } catch (error) {
      this.logger?.warn(
        { reason: error instanceof Error ? error.message : String(error) },
        'No se pudo anotar un correo en el contador del cupo',
      );
    }
  }

  async send(message: MailMessage): Promise<void> {
    await this.inner.send(message);
    await this.count('transactional', 1);
  }

  async sendBatch(messages: MailMessage[], options?: BatchOptions): Promise<void> {
    await sendMany(this.inner, messages, options);
    await this.count('notifications', messages.length);
  }
}
