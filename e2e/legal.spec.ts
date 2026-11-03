import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const PAGES = [
  { path: '/privacidad', title: 'Política de privacidad' },
  { path: '/terminos', title: 'Términos de uso' },
  { path: '/cookies', title: 'Política de cookies' },
] as const;

test.describe('páginas legales', () => {
  for (const { path, title } of PAGES) {
    test(`${path} carga con un solo titular y el cartel de borrador`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByText('Borrador pendiente de revisión legal')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }

  test('el índice de la privacidad lleva al apartado y la sección queda a la vista', async ({
    page,
  }) => {
    await page.goto('/privacidad');
    // En el celular el índice está plegado: se abre; en escritorio ya está abierto.
    const toggle = page.getByText('En esta página', { exact: true });
    const link = page.getByRole('link', { name: /Datos que vienen de Google/ });
    if (!(await link.isVisible())) await toggle.click();
    await link.click();
    await expect(page).toHaveURL(/#google$/);
    await expect(
      page.getByRole('heading', { name: /Datos que vienen de Google/ }),
    ).toBeInViewport();
  });

  test('el pie lleva a cada una', async ({ page }) => {
    await page.goto('/');
    const legal = page.getByRole('navigation', { name: 'Legal' });
    await legal.getByRole('link', { name: 'Privacidad' }).click();
    await expect(page).toHaveURL(/\/privacidad$/);
    await page
      .getByRole('navigation', { name: 'Textos legales' })
      .getByRole('link', { name: 'Términos' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Términos de uso');
  });
});

test.describe('titular de los textos legales', () => {
  test('la administradora escribe el nombre legal en el panel y lo muestran la privacidad y los términos', async ({
    page,
    browser,
  }) => {
    // Cambia un ajuste compartido del sitio: corre en un solo proyecto para no pisarse con el otro en paralelo.
    test.skip(test.info().project.name !== 'escritorio', 'ajuste compartido: solo en escritorio');
    // Un nombre evidentemente inventado: el real se escribe en el panel de producción, nunca en el código.
    const owner = 'Titular Inventada de Prueba';
    await page.goto('/admin/ajustes');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const field = page.getByLabel('Nombre legal de la titular');
    await field.fill(owner);
    // Se espera la respuesta del guardado (el texto «guardado» de la barra ya estaba antes de editar).
    const saved = page.waitForResponse(
      (res) => res.url().endsWith('/api/admin/site-settings') && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await saved).status()).toBe(200);

    // `/api/site` se guarda un minuto en el navegador (`max-age=60`): una visita nueva (sin caché) lo ve al momento.
    const baseURL = test.info().project.use.baseURL;
    const visitor = await browser.newContext({ baseURL });
    const view = await visitor.newPage();
    for (const path of ['/privacidad', '/terminos']) {
      await view.goto(path);
      await expect(view.getByText(owner).first()).toBeVisible();
      await expect(view.getByText('[PLACEHOLDER: nombre legal de la titular]')).toHaveCount(0);
      await expect(view.getByText(/Vigente\s+desde el/)).toContainText('3 de noviembre de 2026');
    }
    await visitor.close();

    // Se deja vacío otra vez: las páginas vuelven a mostrar el dato pendiente.
    await page.goto('/admin/ajustes');
    await field.fill('');
    const cleared = page.waitForResponse(
      (res) => res.url().endsWith('/api/admin/site-settings') && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await cleared).status()).toBe(200);
    const later = await browser.newContext({ baseURL });
    const again = await later.newPage();
    await again.goto('/terminos');
    await expect(again.getByText('[PLACEHOLDER: nombre legal de la titular]')).toBeVisible();
    await later.close();
  });
});

test.describe('aviso de cookies', () => {
  // Sin el «ya lo vi» que las demás pruebas traen de fábrica: es la primera visita.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sale una vez, enlaza a la política y no vuelve tras cerrarlo', async ({ page }) => {
    await page.goto('/contacto');
    const notice = page.getByRole('region', { name: 'Aviso de cookies' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('solo cookies necesarias');
    await notice.getByRole('button', { name: 'Entendido' }).click();
    await expect(notice).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Contacto' })).toBeVisible();
    await expect(notice).toBeHidden();
  });

  test('«Política de cookies» abre la política de cookies', async ({ page }) => {
    await page.goto('/contacto');
    await page
      .getByRole('region', { name: 'Aviso de cookies' })
      .getByRole('link', { name: 'Política de cookies' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Política de cookies');
  });
});

test.describe('sitio sin abrir al público', () => {
  test('pide no indexarse: meta robots y robots.txt que bloquea todo', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    const robots = await page.request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/^Disallow: \/$/m);
  });

  test('el API responde con X-Robots-Tag: noindex', async ({ page }) => {
    const health = await page.request.get('/api/health');
    expect(health.headers()['x-robots-tag']).toBe('noindex');
  });
});
