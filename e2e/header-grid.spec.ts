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
  test('con 5 imágenes aparece bajo el titular y al quitarlas desaparece', async ({
    page,
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
      await page.waitForTimeout(1500);
      await page.screenshot({ path: process.env['GRID_SHOT'] ?? 'test-results/grid.png' });
      // El titular sigue siendo lo primero de la página.
      const heading = page.getByRole('heading', { level: 1 });
      const [h, g] = await Promise.all([heading.boundingBox(), grid.boundingBox()]);
      expect(h && g && h.y < g.y).toBe(true);
    } finally {
      expect((await save([])).status()).toBe(200);
    }
    await page.reload();
    await expect(page.getByRole('region', { name: 'Imágenes del universo' })).toHaveCount(0);
  });
});
