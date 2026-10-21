import { describe, expect, it } from 'vitest';
import { describeRemaining, releaseTarget, remainingParts } from './countdown';

describe('releaseTarget', () => {
  it('una fecha sola es la medianoche de Costa Rica (UTC−6)', () => {
    expect(releaseTarget('2027-03-20')?.toISOString()).toBe('2027-03-20T06:00:00.000Z');
  });

  it('con hora se respeta tal cual, y lo inválido o vacío no da fecha', () => {
    expect(releaseTarget('2027-03-20T22:00:00.000Z')?.toISOString()).toBe(
      '2027-03-20T22:00:00.000Z',
    );
    expect(releaseTarget(undefined)).toBeUndefined();
    expect(releaseTarget('no-es-fecha')).toBeUndefined();
  });
});

describe('remainingParts', () => {
  const target = new Date('2027-01-10T06:00:00.000Z');

  it('descompone en días, horas, minutos y segundos', () => {
    const now = target.getTime() - ((3 * 24 + 4) * 3600 + 12 * 60 + 5) * 1000;
    expect(remainingParts(now, target)).toEqual({
      done: false,
      days: 3,
      hours: 4,
      minutes: 12,
      seconds: 5,
    });
  });

  it('en la fecha exacta y después queda en cero y terminado (nunca negativo)', () => {
    expect(remainingParts(target.getTime(), target)).toMatchObject({
      done: true,
      days: 0,
      seconds: 0,
    });
    expect(remainingParts(target.getTime() + 5000, target).done).toBe(true);
  });

  it('un segundo antes todavía no termina', () => {
    expect(remainingParts(target.getTime() - 1000, target)).toMatchObject({
      done: false,
      seconds: 1,
    });
  });
});

describe('describeRemaining', () => {
  it('habla en singular y plural y omite lo que sobra', () => {
    expect(describeRemaining({ done: false, days: 1, hours: 1, minutes: 1, seconds: 0 })).toBe(
      'Faltan 1 día, 1 hora, 1 minuto.',
    );
    expect(describeRemaining({ done: false, days: 0, hours: 0, minutes: 5, seconds: 0 })).toBe(
      'Faltan 5 minutos.',
    );
    expect(describeRemaining({ done: false, days: 0, hours: 2, minutes: 0, seconds: 0 })).toBe(
      'Faltan 2 horas, 0 minutos.',
    );
  });
});
