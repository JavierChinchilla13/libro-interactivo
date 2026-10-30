import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

test.describe('visitantes anónimos', () => {
  test('no piden la sesión ni la renovación y no dejan errores 401 en la consola', async ({
    page,
  }) => {
    const unauthorized: string[] = [];
    const asked: string[] = [];
    const consoleErrors: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 401) unauthorized.push(response.url());
    });
    page.on('request', (request) => {
      if (/\/api\/(me|auth\/refresh)(\?|$|\/)/.test(request.url())) asked.push(request.url());
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    for (const path of ['/', '/contacto', '/wiki', '/privacidad', '/ingresar']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    }
    expect(unauthorized).toEqual([]);
    expect(asked).toEqual([]);
    expect(consoleErrors.filter((text) => /401|Unauthorized/i.test(text))).toEqual([]);
  });

  test('con sesión la cookie-pista existe y se borra al salir', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    const names = async () => (await page.context().cookies()).map((cookie) => cookie.name);
    expect(await names()).toContain('libro_s');
    // Es legible por la página y no lleva datos.
    const hint = (await page.context().cookies()).find((cookie) => cookie.name === 'libro_s');
    expect(hint).toMatchObject({ value: '1', httpOnly: false, path: '/' });
    // Con la pista, la aplicación sí pregunta por la sesión y la reconoce: entra a la administración sin pasar por el ingreso.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    await page.request.post('/api/auth/logout');
    expect(await names()).not.toContain('libro_s');
  });
});

test.describe('metadatos y 404', () => {
  test('la portada fija su título, su dirección canónica y las etiquetas sociales', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Universo Memorias');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://universomemorias.com/',
    );
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
      'content',
      /og-default\.png$/,
    );
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });

  test('una dirección que no existe muestra «no encontrada» y pide no indexarse', async ({
    page,
  }) => {
    await page.goto('/esto-no-existe');
    await expect(
      page
        .getByRole('heading', { level: 1, name: 'Página no encontrada' })
        .or(page.getByText('Página no encontrada').first()),
    ).toBeVisible();
    await expect(page).toHaveTitle('Página no encontrada · Universo Memorias');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test('el sitemap no se anuncia mientras la indexación esté apagada, y los iconos y el manifest existen', async ({
    page,
  }) => {
    expect((await page.request.get('/sitemap.xml')).status()).toBe(404);
    for (const path of [
      '/manifest.webmanifest',
      '/icon-192.png',
      '/icon-512.png',
      '/apple-touch-icon.png',
      '/og-default.png',
      '/404.html',
    ]) {
      expect((await page.request.get(path)).status(), path).toBe(200);
    }
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe('Universo Memorias');
  });
});
