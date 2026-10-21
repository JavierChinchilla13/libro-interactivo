import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, scaleLimits } from './limits.js';

describe('scaleLimits', () => {
  it('con factor 1 no cambia nada', () => {
    expect(scaleLimits(DEFAULT_LIMITS, 1)).toBe(DEFAULT_LIMITS);
  });

  it('multiplica el tope y conserva la ventana de cada límite', () => {
    const scaled = scaleLimits(DEFAULT_LIMITS, 20);
    expect(scaled.login).toEqual({ windowMs: DEFAULT_LIMITS.login.windowMs, limit: 600 });
    expect(scaled.register.limit).toBe(DEFAULT_LIMITS.register.limit * 20);
  });
});
