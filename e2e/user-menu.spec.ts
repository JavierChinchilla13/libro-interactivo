import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const PASSWORD = 'Nube-Azul-Cuatro-87';
const LONG_NAME = 'Alejandra Montserrat-Wiśniewska de la Vega y Fernández 🌙';

test.describe('menú de usuario (celular y escritorio)', () => {
  test('la lectora ve su nombre, abre el menú, va a Ajustes y cierra sesión desde el menú', async ({
    page,
  }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const register = await page.request.post('/api/auth/register', {
      data: { name: LONG_NAME, email: `menu-${stamp}@ejemplo.com`, password: PASSWORD },
    });
    expect(register.status(), await register.text()).toBe(201);
    await page.request.post('/api/me/welcome-seen');

    await page.goto('/panel');
    const trigger = page.getByRole('button', { name: LONG_NAME });
    await expect(trigger).toBeVisible();
    // Ya no hay pestaña «Cuenta» ni un botón «Salir» suelto.
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(0);
    // La barra no se desborda con un nombre largo.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    await trigger.click();
    await expect(page.getByRole('menuitem', { name: 'Ajustes' })).toBeFocused();
    const box = await page.getByRole('menu').boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole('menuitem', { name: 'Ajustes' }).click();
    await expect(page).toHaveURL(/\/panel\/cuenta$/);
    await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible();

    await trigger.click();
    await page.getByRole('menuitem', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
    // La sesión se cerró de verdad: el panel ya no abre.
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('la administradora tiene el menú en la administración, con el selector de zona al lado', async ({
    page,
  }) => {
    const login = await page.request.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    await page.goto('/admin');
    await expect(page.getByRole('navigation', { name: 'Cambiar de zona' })).toBeVisible();
    await page.getByRole('button', { name: E2E_ADMIN.name }).click();
    await expect(page.getByText('Administradora')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});
