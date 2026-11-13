import {
  CARDS_LABEL_DEFAULT,
  CARDS_LABEL_MAX,
  publicSiteResponseSchema,
  siteSettingsResponseSchema,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { plainText } from '../lib/text.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const publicLabel = async (app: Parameters<typeof request>[0]) =>
  publicSiteResponseSchema.parse((await request(app).get('/api/site').expect(200)).body).cardsLabel;

describe('nombre de la sección de cartas (cardsLabel)', () => {
  it('sin escribir, el panel y el sitio público traen «Hallazgos»', async () => {
    const { admin, app } = await staffWorld();
    expect(CARDS_LABEL_DEFAULT).toBe('Hallazgos');
    const panel = siteSettingsResponseSchema.parse(
      (await admin.get('/api/admin/site-settings').expect(200)).body,
    );
    expect(panel.cardsLabel).toBe('Hallazgos');
    expect(await publicLabel(app)).toBe('Hallazgos');
  });

  it('un administrador lo cambia; sale en el sitio público, guardar otra sección no lo toca y vacío vuelve al de siempre', async () => {
    const { admin, app } = await staffWorld();
    const saved = siteSettingsResponseSchema.parse(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ cardsLabel: '  Reliquias  ' })
          .expect(200)
      ).body,
    );
    expect(saved.cardsLabel).toBe('Reliquias');
    expect(await publicLabel(app)).toBe('Reliquias');

    await admin
      .patch('/api/admin/site-settings')
      .send({ lock: { message: 'Aún no' } })
      .expect(200);
    expect((await SiteSettings.findOne({ key: 'site' }).lean())?.cardsLabel).toBe('Reliquias');

    const cleared = siteSettingsResponseSchema.parse(
      (await admin.patch('/api/admin/site-settings').send({ cardsLabel: '' }).expect(200)).body,
    );
    expect(cleared.cardsLabel).toBe('Hallazgos');
    expect((await SiteSettings.findOne({ key: 'site' }).lean())?.cardsLabel).toBeUndefined();
    expect(await publicLabel(app)).toBe('Hallazgos');
  });

  it('se guarda como texto plano: el marcado, los scripts y los saltos de línea se quitan', async () => {
    const { admin, app } = await staffWorld();
    const attempts: Array<[string, string]> = [
      ['<b>Reliquias</b>', 'Reliquias'],
      ['<img src=x onerror=alert(1)>Tesoros', 'Tesoros'],
      ['<script>alert(1)</script>Joyas', 'Joyas'],
      ['Mis &lt;cosas&gt; &amp; más', 'Mis <cosas> & más'],
      ['Línea uno\nlínea\tdos', 'Línea uno línea dos'],
      ['  Muchos    espacios  ', 'Muchos espacios'],
      ['<style>body{display:none}</style>', ''],
    ];
    for (const [input, expected] of attempts) {
      const saved = siteSettingsResponseSchema.parse(
        (await admin.patch('/api/admin/site-settings').send({ cardsLabel: input }).expect(200))
          .body,
      );
      expect(saved.cardsLabel, input).toBe(expected || CARDS_LABEL_DEFAULT);
      expect(await publicLabel(app), input).toBe(expected || CARDS_LABEL_DEFAULT);
    }
    const stored = (await SiteSettings.findOne({ key: 'site' }).lean())?.cardsLabel;
    expect(stored ?? '').not.toMatch(/<script|<img|onerror|<style/i);
  });

  it('un editor no lo puede cambiar (403) y un lector no entra al panel', async () => {
    const { editor, reader } = await staffWorld();
    expect(
      (await editor.patch('/api/admin/site-settings').send({ cardsLabel: 'Reliquias' })).status,
    ).toBe(403);
    expect(
      (await reader.patch('/api/admin/site-settings').send({ cardsLabel: 'Reliquias' })).status,
    ).toBe(403);
    expect(await SiteSettings.countDocuments({ cardsLabel: { $exists: true } })).toBe(0);
  });

  it('valida el largo (máximo 40) y el tipo', async () => {
    const { admin } = await staffWorld();
    expect(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ cardsLabel: 'x'.repeat(CARDS_LABEL_MAX + 1) })
      ).status,
    ).toBe(400);
    expect((await admin.patch('/api/admin/site-settings').send({ cardsLabel: 7 })).status).toBe(
      400,
    );
    expect(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ cardsLabel: 'x'.repeat(CARDS_LABEL_MAX) })
      ).status,
    ).toBe(200);
  });
});

describe('plainText', () => {
  it('quita marcado, decodifica entidades y deja una sola línea', () => {
    expect(plainText('<p>Hola&nbsp;<em>mundo</em></p>')).toBe(
      'Hola mundo'.replace(' ', ' ').replace(/\s+/g, ' '),
    );
    expect(plainText('a\u0000b​c')).toBe('a b c');
    expect(plainText('')).toBe('');
  });
});
