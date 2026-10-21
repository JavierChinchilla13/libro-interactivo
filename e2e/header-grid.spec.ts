import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const demo = (publicId: string) => ({
  provider: 'cloudinary',
  publicId,
  url: `https://res.cloudinary.com/demo/image/upload/${publicId}`,
  width: 800,
  height: 1000,
  alt: `Imagen ${publicId}`,
});

test.describe('rejilla inclinada del encabezado', () => {
  test('con 5 imágenes aparece bajo el titular y al quitarlas quedan marcadores de color', async ({
    page,
    browser,
    playwright,
    baseURL,
    isMobile,
  }) => {
    // El ajuste es global de la base: un solo proyecto lo modifica a la vez (el otro correría en paralelo).
    test.skip(isMobile, 'Ajuste global de la base: corre solo en escritorio.');
    const admin = await playwright.request.newContext({ baseURL });
    await admin.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    const current = (await (await admin.get('/api/admin/site-settings')).json()) as {
      universe: { introHtml: string; headline?: string };
    };
    const save = (headerImages: unknown[]) =>
      admin.patch('/api/admin/site-settings', {
        data: { universe: { ...current.universe, headerImages } },
      });
    try {
      const ids = ['sample', 'cld-sample', 'cld-sample-2', 'cld-sample-3', 'cld-sample-4'];
      expect((await save(ids.map(demo))).status()).toBe(200);
      await page.goto('/');
      const grid = page.getByRole('region', { name: 'Imágenes del universo' });
      await expect(grid).toBeVisible();
      await expect(grid.getByRole('img')).toHaveCount(5);
      await grid.scrollIntoViewIfNeeded();
      // La captura es solo de apoyo para revisar a ojo: se toma cuando la página terminó de cargar.
      await page.waitForLoadState('load');
      await page.screenshot({ path: process.env['GRID_SHOT'] ?? 'test-results/grid.png' });
      // El titular sigue siendo lo primero de la página.
      const heading = page.getByRole('heading', { level: 1 });
      const [h, g] = await Promise.all([heading.boundingBox(), grid.boundingBox()]);
      expect(h && g && h.y < g.y).toBe(true);
    } finally {
      expect((await save([])).status()).toBe(200);
    }
    // `GET /api/site` se guarda 60 s en la caché del navegador: se mira desde un contexto nuevo (sin esa caché).
    const freshContext = await browser.newContext();
    try {
      const fresh = await freshContext.newPage();
      await fresh.goto(`${baseURL}/`);
      // Sin imágenes propias: en desarrollo quedan los marcadores de color (la rejilla sin ninguna imagen). En el
      // sitio publicado no se pinta nada; esta suite corre contra el servidor de desarrollo.
      const empty = fresh.getByRole('region', { name: 'Imágenes del universo' });
      await expect(empty).toBeVisible();
      await expect(empty.getByRole('img')).toHaveCount(0);
    } finally {
      await freshContext.close();
      await admin.dispose();
    }
  });
});
