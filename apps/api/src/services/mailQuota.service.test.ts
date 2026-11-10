import { describe, expect, it } from 'vitest';
import { MemoryMailProvider } from '../providers/mail/MailProvider.js';
import { createTestClock } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';
import {
  CountingMailProvider,
  computeQuota,
  createMailQuota,
  daysAfterToday,
  estimateDays,
  nextUtcMidnight,
  nextUtcMonth,
  utcDay,
} from './mailQuota.service.js';

useTestDb();

const FREE = { dailyLimit: 100, monthlyLimit: 3000, reserve: 20 };
const usage = (transactional = 0, notifications = 0, monthBeforeToday = 0) => ({
  today: { transactional, notifications },
  monthBeforeToday,
});

describe('días UTC', () => {
  it('el día y sus cortes son UTC (como el cupo de Resend)', () => {
    const lateInCostaRica = new Date('2026-11-09T23:30:00-06:00'); // ya es 10 de noviembre en UTC
    expect(utcDay(lateInCostaRica)).toBe('2026-11-10');
    expect(nextUtcMidnight(lateInCostaRica).toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(nextUtcMonth(new Date('2026-12-31T12:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
    expect(daysAfterToday(new Date('2026-11-09T12:00:00Z'))).toBe(21);
    expect(daysAfterToday(new Date('2026-11-30T12:00:00Z'))).toBe(0);
  });
});

describe('computeQuota', () => {
  const day30 = new Date('2026-11-30T12:00:00Z'); // último día: sin reserva de días que vienen

  it('al empezar el día: 100 − 20 de reserva = 80 para avisos', () => {
    expect(computeQuota(FREE, usage(), day30)).toMatchObject({ todayLeft: 80 });
  });

  it('los transaccionales dentro de la reserva no restan; los que pasan de la reserva sí', () => {
    expect(computeQuota(FREE, usage(15), day30).todayLeft).toBe(80);
    expect(computeQuota(FREE, usage(30), day30).todayLeft).toBe(70);
    expect(computeQuota(FREE, usage(0, 50), day30).todayLeft).toBe(30);
    expect(computeQuota(FREE, usage(0, 90), day30).todayLeft).toBe(0);
  });

  it('el mes reserva 20 por cada día que queda (P4) y el día nunca pasa de lo que queda del mes', () => {
    const day9 = new Date('2026-11-09T12:00:00Z'); // quedan 21 días después de hoy → 420 de reserva
    const quota = computeQuota(FREE, usage(0, 0, 2500), day9);
    // 3000 − 2500 − 20 (hoy) − 420 = 60
    expect(quota.monthLeft).toBe(60);
    expect(quota.todayLeft).toBe(60);
    expect(computeQuota(FREE, usage(0, 0, 3000), day9)).toMatchObject({
      todayLeft: 0,
      monthLeft: 0,
    });
  });

  it('estimateDays: hoy si alcanza; si no, hoy más los días que hagan falta', () => {
    const quota = computeQuota(FREE, usage(), day30);
    expect(estimateDays(quota, 0)).toBe(0);
    expect(estimateDays(quota, 80)).toBe(1);
    expect(estimateDays(quota, 81)).toBe(2);
    expect(estimateDays(quota, 300)).toBe(4); // 80 hoy + 80 + 80 + 60
    expect(estimateDays({ ...quota, todayLeft: 0 }, 160)).toBe(2);
  });
});

describe('contador en la base y CountingMailProvider', () => {
  it('cuenta los envíos sueltos como transaccionales y los lotes como avisos, por día UTC', async () => {
    const clock = createTestClock(new Date('2026-11-09T12:00:00Z'));
    const quota = createMailQuota({ config: FREE, clock });
    const inner = new MemoryMailProvider();
    const mail = new CountingMailProvider(inner, quota);
    await mail.send({ to: 'a@ejemplo.com', subject: 's', html: 'h', text: 't' });
    await mail.sendBatch(
      ['b', 'c', 'd'].map((n) => ({ to: `${n}@ejemplo.com`, subject: 's', html: 'h', text: 't' })),
    );
    expect(await quota.usage()).toEqual({
      today: { transactional: 1, notifications: 3 },
      monthBeforeToday: 0,
    });
    clock.advance(86_400_000);
    await mail.send({ to: 'e@ejemplo.com', subject: 's', html: 'h', text: 't' });
    expect(await quota.usage()).toEqual({
      today: { transactional: 1, notifications: 0 },
      monthBeforeToday: 4,
    });
    expect(inner.sent).toHaveLength(5);
  });

  it('un envío que falla no cuenta', async () => {
    const clock = createTestClock(new Date('2026-11-09T12:00:00Z'));
    const quota = createMailQuota({ config: FREE, clock });
    const broken = {
      send: async () => {
        throw new Error('caído');
      },
    };
    await expect(
      new CountingMailProvider(broken, quota).send({
        to: 'a@x.co',
        subject: 's',
        html: 'h',
        text: 't',
      }),
    ).rejects.toThrow('caído');
    expect((await quota.usage()).today.transactional).toBe(0);
  });
});
