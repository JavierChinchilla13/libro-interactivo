import { expect, test } from '@playwright/test';

test.describe('portada (humo)', () => {
  test('carga la home y muestra el título', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Libro Interactivo');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('consulta /api/health a través del proxy y muestra el estado del servidor', async ({
    page,
  }) => {
    const health = page.waitForResponse((r) => r.url().includes('/api/health'));
    await page.goto('/estado');
    expect((await health).status()).toBe(200);
    await expect(page.getByTestId('server-status')).toHaveText('en línea');
  });

  test('no genera desbordamiento horizontal en móvil', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
