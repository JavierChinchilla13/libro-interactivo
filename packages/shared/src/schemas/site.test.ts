import { describe, expect, it } from 'vitest';
import { httpUrlSchema } from './common.js';
import { socialLinkSchema, updateSiteSettingsRequestSchema } from './site.js';

describe('enlaces externos', () => {
  it('aceptan solo http(s)', () => {
    expect(httpUrlSchema.safeParse('https://ejemplo.com/a').success).toBe(true);
    expect(httpUrlSchema.safeParse('HTTP://ejemplo.com').success).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://x.com',
      'mailto:a@b.co',
      'x',
    ]) {
      expect(httpUrlSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('una red social necesita nombre y enlace válido', () => {
    expect(socialLinkSchema.safeParse({ label: 'Instagram', url: 'https://i.co/x' }).success).toBe(
      true,
    );
    expect(socialLinkSchema.safeParse({ label: ' ', url: 'https://i.co/x' }).success).toBe(false);
    expect(socialLinkSchema.safeParse({ label: 'X', url: 'javascript:1' }).success).toBe(false);
  });
});

describe('ajustes del sitio (panel)', () => {
  it('exige al menos una sección y acepta cualquiera por separado', () => {
    expect(updateSiteSettingsRequestSchema.safeParse({}).success).toBe(false);
    expect(updateSiteSettingsRequestSchema.safeParse({ lock: {} }).success).toBe(true);
    expect(
      updateSiteSettingsRequestSchema.safeParse({ universe: { introHtml: '<p>x</p>' } }).success,
    ).toBe(true);
  });

  it('limita las redes a 8 y valida el correo público de la autora', () => {
    const link = { label: 'Red', url: 'https://ejemplo.com' };
    expect(
      updateSiteSettingsRequestSchema.safeParse({ social: Array.from({ length: 9 }, () => link) })
        .success,
    ).toBe(false);
    expect(
      updateSiteSettingsRequestSchema.safeParse({ author: { bioHtml: '', publicEmail: 'no' } })
        .success,
    ).toBe(false);
  });
});
