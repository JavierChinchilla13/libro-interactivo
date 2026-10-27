import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

test.describe('selector de zona para administradoras y editoras (celular y escritorio)', () => {
  test('las tres zonas están en el menú de usuario de las tres cabeceras, marcan la zona y llevan a cada una', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(
      page.getByRole('heading', { name: /^Buen(os|as) (días|tardes|noches)/ }),
    ).toBeVisible();

    // Por debajo de 1536 px el selector de zonas vive dentro del menú de usuario (abierto, cierra al elegir).
    const trigger = () => page.getByRole('button', { name: E2E_ADMIN.name });
    const openMenu = async () => {
      if (!(await trigger().isVisible())) await page.getByRole('button', { name: 'Menú' }).click();
      await trigger().click();
    };
    const zone = (name: string) => page.getByRole('menuitem', { name });
    const active = async () =>
      page
        .getByRole('menuitem')
        .evaluateAll((items) =>
          items
            .filter((item) => item.getAttribute('aria-current') === 'page')
            .map((item) => item.textContent),
        );

    // Administración
    await openMenu();
    await expect.poll(active).toEqual(['Admin']);
    // La barra lateral y la cabecera ya no repiten «Ver sitio» ni «Mi panel» fuera del menú.
    await expect(page.getByRole('menuitem', { name: 'Ver sitio' })).toHaveCount(1);
    await expect(page.getByRole('menuitem', { name: 'Mi panel' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Ver sitio' })).toHaveCount(0);

    // La bienvenida es un ajuste global de la base: se espera la respuesta que dice si toca y, solo entonces, se cierra.
    const welcome = page.waitForResponse(
      (response) =>
        response.url().includes('/api/me/welcome') && response.request().method() === 'GET',
    );
    await zone('Mi panel').click();
    const { show } = (await (await welcome).json()) as { show: boolean };
    if (show) await page.getByRole('button', { name: '¡A la aventura!' }).click();
    await expect(page).toHaveURL(/\/panel$/);
    await openMenu();
    await expect.poll(active).toEqual(['Mi panel']);

    await zone('Ver sitio').click();
    await expect(page).toHaveURL(/\/$/);
    if (isMobile) await page.getByRole('button', { name: 'Menú' }).click();
    await openMenu();
    await expect.poll(active).toEqual(['Ver sitio']);

    await zone('Admin').click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('una lectora no lo ve', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav[aria-label="Cambiar de zona"]')).toHaveCount(0);
  });
});
