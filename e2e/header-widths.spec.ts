import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const PASSWORD = 'Nube-Azul-Cuatro-87';
const LONG_NAME = 'Alejandra Montserrat-Wiśniewska de la Vega y Fernández 🌙';
const WIDTHS = [360, 375, 768, 900, 940, 1024, 1100, 1280, 1440, 1536, 1600, 1920];

/**
 * Mide la cabecera de la página: nada se parte, nada se desborda y nada se pisa. Un enlace «partido» es el que tiene su
 * texto en más de una línea (o menos ancho que su texto); el botón del menú de usuario acorta su nombre con «…» a
 * propósito, así que solo se comprueba que quepa en la píldora.
 */
async function measureHeader(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const scroll = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (scroll > 0) problems.push(`scroll horizontal de ${scroll}px`);
    const header = document.querySelector('header');
    if (!header) return ['no hay cabecera'];
    const visible = (element: Element) => element.getClientRects().length > 0;
    const controls = [...header.querySelectorAll<HTMLElement>('a, button')].filter(visible);
    for (const element of controls) {
      if (element.closest('.user-menu-trigger')) continue;
      const text = (element.textContent ?? '').trim();
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const lines = new Set(rects.map((rect) => Math.round(rect.top / 4))).size;
      if (lines > 1) problems.push(`«${text.slice(0, 24)}» se parte en ${lines} líneas`);
      if (element.scrollWidth > element.clientWidth + 1) {
        problems.push(`«${text.slice(0, 24)}» mide menos que su texto`);
      }
    }
    // Nada se pisa ni se sale de la pantalla.
    const boxes = controls
      .filter((element) => !element.closest('.nav-menu'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }));
    const label = (element: HTMLElement, size: number) =>
      (element.textContent ?? '').trim().slice(0, size);
    for (const [index, a] of boxes.entries()) {
      if (a.rect.right > window.innerWidth + 0.5 || a.rect.left < -0.5) {
        problems.push(`«${label(a.element, 20)}» se sale de la pantalla`);
      }
      for (const b of boxes.slice(index + 1)) {
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapX > 1 && overlapY > 1) {
          problems.push(`«${label(a.element, 14)}» pisa a «${label(b.element, 14)}»`);
        }
      }
    }
    const pill = document.querySelector('header .nav-pill');
    const trigger = document.querySelector('header .user-menu-trigger');
    if (pill && trigger) {
      if (trigger.getBoundingClientRect().right > pill.getBoundingClientRect().right + 0.5) {
        problems.push('el menú de usuario se sale de la píldora');
      }
    }
    return problems;
  });
}

test.describe('cabeceras a todos los anchos', () => {
  test.skip(({ isMobile }) => isMobile, 'Recorre los anchos por su cuenta; basta un proyecto.');
  test.setTimeout(240_000);

  test('sitio, panel y administración: sin partirse, sin desborde y sin pisarse, con administradora, nombre largo y sin sesión', async ({
    browser,
  }) => {
    const stamp = Date.now();
    const failures: string[] = [];

    const sessions = {
      admin: await browser.newContext(),
      largo: await browser.newContext(),
      anonimo: await browser.newContext(),
    };
    const adminLogin = await sessions.admin.request.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    expect(adminLogin.status()).toBe(200);
    const register = await sessions.largo.request.post('/api/auth/register', {
      data: { name: LONG_NAME, email: `anchos-${stamp}@ejemplo.com`, password: PASSWORD },
    });
    expect(register.status()).toBe(201);
    for (const context of [sessions.admin, sessions.largo]) {
      await context.request.post('/api/me/welcome-seen');
    }

    const plan: [keyof typeof sessions, string][] = [
      ['admin', '/'],
      ['admin', '/panel'],
      ['admin', '/admin'],
      ['largo', '/'],
      ['largo', '/panel'],
      ['anonimo', '/'],
    ];
    for (const [who, path] of plan) {
      const page = await sessions[who].newPage();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 700 });
        await page.goto(path);
        await page.locator('header').first().waitFor();
        // En el sitio, por debajo de 1280 px los enlaces y el menú de usuario viven tras el botón «Menú».
        const collapsed = path === '/' && width < 1280;
        if (who !== 'anonimo' && !collapsed) {
          await expect(page.locator('.user-menu-trigger')).toBeVisible();
        }
        // Deja que se asiente la tipografía y los cambios de ancho.
        await page.waitForTimeout(150);
        for (const problem of await measureHeader(page)) {
          failures.push(`${who} ${path} a ${width}px: ${problem}`);
        }
        if (collapsed) {
          await page.getByRole('button', { name: 'Menú' }).click();
          if (who !== 'anonimo') await expect(page.locator('.user-menu-trigger')).toBeVisible();
          for (const problem of await measureHeader(page)) {
            failures.push(`${who} ${path} a ${width}px (menú abierto): ${problem}`);
          }
        }
        if (who === 'admin' && path !== '/') {
          // Las zonas viven siempre dentro del menú de usuario, a cualquier ancho (sin selector suelto).
          await expect(page.getByRole('navigation', { name: 'Cambiar de zona' })).toHaveCount(0);
        }
      }
      await page.close();
    }
    for (const context of Object.values(sessions)) await context.close();
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('a anchos medios el selector de zonas está dentro del menú de usuario y la zona actual queda marcada', async ({
    page,
  }) => {
    const login = await page.request.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    await page.setViewportSize({ width: 940, height: 700 });
    await page.goto('/admin');
    await page.getByRole('button', { name: E2E_ADMIN.name }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'Ver sitio',
      'Mi panel',
      'Admin',
      'Ajustes',
      'Salir',
    ]);
    await expect(page.getByRole('menuitem', { name: 'Admin' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('menuitem', { name: 'Mi panel' }).click();
    await expect(page).toHaveURL(/\/panel$/);
  });
});
