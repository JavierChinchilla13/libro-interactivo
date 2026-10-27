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

  test('la administradora tiene el mismo menú en la administración: Ver sitio, Mi panel, Admin, Ajustes y Salir a 1920 px', async ({
    page,
  }) => {
    const login = await page.request.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    await page.request.post('/api/me/welcome-seen');
    for (const [path, current] of [
      ['/admin', 'Admin'],
      ['/panel', 'Mi panel'],
    ] as const) {
      await page.setViewportSize({ width: 1920, height: 900 });
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Cambiar de zona' })).toHaveCount(0);
      await page.getByRole('button', { name: E2E_ADMIN.name }).click();
      await expect(page.getByText('Administradora')).toBeVisible();
      await expect(page.getByRole('menuitem')).toHaveText([
        'Ver sitio',
        'Mi panel',
        'Admin',
        'Ajustes',
        'Salir',
      ]);
      await expect(page.getByRole('menuitem', { name: current })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.keyboard.press('Escape');
    }
    await page.goto('/admin');
    await page.getByRole('button', { name: E2E_ADMIN.name }).click();
    await page.getByRole('menuitem', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test('una lectora (USER) no ve las tres zonas a 1920 px', async ({ page }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const register = await page.request.post('/api/auth/register', {
      data: { name: 'Lectora Zonas', email: `zonas-${stamp}@ejemplo.com`, password: PASSWORD },
    });
    expect(register.status(), await register.text()).toBe(201);
    await page.request.post('/api/me/welcome-seen');
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto('/panel');
    await page.getByRole('button', { name: 'Lectora Zonas' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Ajustes', 'Salir']);
    await expect(page.getByRole('menuitem', { name: 'Admin' })).toHaveCount(0);
  });

  const NAMES = [
    'Maximiliano-Bartholomew-Wiśniewska-Kowalczyk Pérez',
    '🌙✨ Luna de la Vega',
    'Jo',
    'Alejandra Montserrat-Wiśniewska de la Vega y Fernández 🌙',
  ];
  for (const name of NAMES) {
    test(`a 375 px la barra no se rompe con «${name.slice(0, 24)}…»: primer nombre corto y a 340 px solo el avatar`, async ({
      page,
    }) => {
      const stamp = `${Date.now()}-${test.info().project.name}-${name.length}`;
      const register = await page.request.post('/api/auth/register', {
        data: { name, email: `barra-${stamp}@ejemplo.com`, password: PASSWORD },
      });
      expect(register.status(), await register.text()).toBe(201);
      await page.request.post('/api/me/welcome-seen');

      for (const [width, showsFirst] of [
        [375, true],
        [340, false],
      ] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/panel');
        const trigger = page.getByRole('button', { name });
        await expect(trigger).toBeVisible();
        const first = trigger.locator('.user-menu-first');
        if (showsFirst) {
          await expect(first).toBeVisible();
          await expect(first).not.toHaveText('');
        } else {
          await expect(first).toBeHidden();
        }
        const geometry = await page.evaluate(() => {
          const rect = (selector: string) =>
            document.querySelector(selector)?.getBoundingClientRect().toJSON() as DOMRect;
          return {
            pill: rect('.site-header .nav-pill'),
            brand: rect('.site-header .nav-pill a'),
            trigger: rect('.user-menu-trigger'),
            scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        expect(geometry.scroll).toBeLessThanOrEqual(0);
        expect(geometry.trigger.right).toBeLessThanOrEqual(geometry.pill.right + 0.5);
        expect(geometry.trigger.left).toBeGreaterThanOrEqual(geometry.brand.right - 0.5);
        expect(geometry.trigger.height).toBeGreaterThanOrEqual(44);
        expect(geometry.pill.height).toBeLessThan(90);
      }
    });
  }
});
