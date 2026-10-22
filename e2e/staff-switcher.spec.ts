import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

test.describe('selector de zona para administradoras y editoras (celular y escritorio)', () => {
  test('aparece en el mismo sitio de las tres cabeceras, marca la zona y lleva a cada una', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio del panel' })).toBeVisible();

    // Solo se cuenta el selector que se ve (en el panel hay dos, uno por tamaño de pantalla).
    const visible = () => page.locator('nav[aria-label="Cambiar de zona"]:visible');
    const active = async () =>
      visible()
        .getByRole('link', { name: /.+/ })
        .evaluateAll((links) =>
          links
            .filter((link) => link.getAttribute('aria-current') === 'page')
            .map((l) => l.textContent),
        );

    // Administración
    await expect(visible()).toHaveCount(1);
    await expect.poll(active).toEqual(['Admin']);
    // La barra lateral y la cabecera ya no repiten «Ver sitio» ni «Mi panel» fuera del selector.
    await expect(page.getByRole('link', { name: 'Ver sitio' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Mi panel' })).toHaveCount(1);

    // En el celular el menú lateral está plegado; el selector está a la vista en la cabecera.
    // La bienvenida es un ajuste global de la base: se espera la respuesta que dice si toca y, solo entonces, se cierra.
    const welcome = page.waitForResponse(
      (response) =>
        response.url().includes('/api/me/welcome') && response.request().method() === 'GET',
    );
    await visible().getByRole('link', { name: 'Mi panel' }).click();
    const { show } = (await (await welcome).json()) as { show: boolean };
    if (show) await page.getByRole('button', { name: '¡A la aventura!' }).click();
    await expect(page).toHaveURL(/\/panel$/);
    await expect(visible()).toHaveCount(1);
    await expect.poll(active).toEqual(['Mi panel']);

    await visible().getByRole('link', { name: 'Ver sitio' }).click();
    await expect(page).toHaveURL(/\/$/);
    if (isMobile) await page.getByRole('button', { name: 'Menú' }).click();
    await expect(visible()).toHaveCount(1);
    await expect.poll(active).toEqual(['Ver sitio']);

    await visible().getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('una lectora no lo ve', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav[aria-label="Cambiar de zona"]')).toHaveCount(0);
  });
});
