import { publicSiteResponseSchema, siteSettingsResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SiteSettings } from '../models/SiteSettings.js';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

/** Un nombre evidentemente inventado: el nombre real de la titular nunca se escribe en el repositorio. */
const FAKE_OWNER = 'Titular Inventada de Prueba';

describe('nombre legal de la titular (legalOwnerName)', () => {
  it('sin escribir, ni el panel ni el sitio público lo traen', async () => {
    const { admin, app } = await staffWorld();
    const panel = siteSettingsResponseSchema.parse(
      (await admin.get('/api/admin/site-settings').expect(200)).body,
    );
    expect(panel.legalOwnerName).toBeUndefined();
    const site = publicSiteResponseSchema.parse(
      (await request(app).get('/api/site').expect(200)).body,
    );
    expect(site.legalOwnerName).toBeUndefined();
  });

  it('un administrador lo escribe; sale en el sitio público y se puede quitar dejándolo vacío', async () => {
    const { admin, app } = await staffWorld();
    const saved = siteSettingsResponseSchema.parse(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ legalOwnerName: `  ${FAKE_OWNER}  ` })
          .expect(200)
      ).body,
    );
    expect(saved.legalOwnerName).toBe(FAKE_OWNER);
    const site = publicSiteResponseSchema.parse(
      (await request(app).get('/api/site').expect(200)).body,
    );
    expect(site.legalOwnerName).toBe(FAKE_OWNER);

    // Guardar otra sección no lo toca.
    await admin
      .patch('/api/admin/site-settings')
      .send({ lock: { message: 'Aún no' } })
      .expect(200);
    expect((await SiteSettings.findOne({ key: 'site' }).lean())?.legalOwnerName).toBe(FAKE_OWNER);

    const cleared = siteSettingsResponseSchema.parse(
      (await admin.patch('/api/admin/site-settings').send({ legalOwnerName: '' }).expect(200)).body,
    );
    expect(cleared.legalOwnerName).toBeUndefined();
    const after = publicSiteResponseSchema.parse(
      (await request(app).get('/api/site').expect(200)).body,
    );
    expect(after.legalOwnerName).toBeUndefined();
  });

  it('un editor no lo puede cambiar (403) y un lector no entra al panel', async () => {
    const { editor, reader } = await staffWorld();
    expect(
      (await editor.patch('/api/admin/site-settings').send({ legalOwnerName: FAKE_OWNER })).status,
    ).toBe(403);
    expect((await SiteSettings.findOne({ key: 'site' }).lean())?.legalOwnerName).toBeUndefined();
    expect(
      (await reader.patch('/api/admin/site-settings').send({ legalOwnerName: FAKE_OWNER })).status,
    ).toBe(403);
  });

  it('valida el largo y el tipo', async () => {
    const { admin } = await staffWorld();
    expect(
      (await admin.patch('/api/admin/site-settings').send({ legalOwnerName: 'x'.repeat(161) }))
        .status,
    ).toBe(400);
    expect(
      (await admin.patch('/api/admin/site-settings').send({ legalOwnerName: 42 })).status,
    ).toBe(400);
  });
});
