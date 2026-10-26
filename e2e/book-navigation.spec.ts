import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';
import { seedPublishedQuiz } from './seed';

test.describe('navegación dentro de un libro (celular y escritorio)', () => {
  test('migas, subnavegador y barra: Resumen → Resultados → Extras sin volver al panel, cambio de libro y vuelta a «Tus libros»', async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(90_000);
    const stamp = Date.now() * 100 + (isMobile ? 10 : 0);
    const login = await page.request.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    expect(login.status()).toBe(200);
    await page.request.post('/api/me/welcome-seen');
    const first = await seedPublishedQuiz(page.request, stamp);
    const second = await seedPublishedQuiz(page.request, stamp + 1, { bookOrder: 2 });

    // La bienvenida es un ajuste global de la base: si toca, se cierra antes de seguir.
    const welcome = page.waitForResponse(
      (response) =>
        response.url().includes('/api/me/welcome') && response.request().method() === 'GET',
    );
    await page.goto(`/panel/libros/libro-qr-${stamp}`);
    const { show } = (await (await welcome).json()) as { show: boolean };
    if (show) await page.getByRole('button', { name: '¡A la aventura!' }).click();
    await expect(page.getByRole('heading', { level: 1, name: first.bookTitle })).toBeVisible();
    const crumbs = page.getByRole('navigation', { name: 'Migas' });
    await expect(crumbs.getByRole('link', { name: 'Tus libros' })).toBeVisible();
    const sections = page.getByRole('navigation', { name: `Secciones de ${first.bookTitle}` });
    await expect(sections.getByRole('link', { name: 'Resumen' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Resultados y Extras del libro, sin pasar por el panel general.
    await sections.getByRole('link', { name: 'Resultados' }).click();
    await expect(page).toHaveURL(new RegExp(`/panel/libros/libro-qr-${stamp}/resultados$`));
    await expect(
      page.getByRole('heading', { level: 1, name: `Tus resultados en ${first.bookTitle}` }),
    ).toBeVisible();
    await sections.getByRole('link', { name: 'Extras' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `Capítulos extra de ${first.bookTitle}` }),
    ).toBeVisible();

    // La barra: dentro del libro no hay «Resultados» ni «Extras» generales, solo volver.
    if (isMobile) {
      const bottom = page.getByRole('navigation', { name: 'Panel (móvil)' });
      await expect(bottom.getByRole('link')).toHaveText([
        '‹ Tus libros',
        'Resumen',
        'Resultados',
        'Extras',
      ]);
      await expect(bottom.getByRole('link', { name: 'Extras' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    } else {
      const top = page.getByRole('navigation', { name: 'Panel', exact: true });
      await expect(top.getByRole('link')).toHaveText(['‹ Tus libros']);
    }

    // Cambiar de libro conserva la sección y actualiza todo.
    await page
      .getByRole('combobox', { name: 'Cambiar de libro' })
      .selectOption(`libro-qr-${stamp + 1}`);
    await expect(
      page.getByRole('heading', { level: 1, name: `Capítulos extra de ${second.bookTitle}` }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/panel/libros/libro-qr-${stamp + 1}/extras$`));

    // Volver a «Tus libros» desde las migas.
    await page
      .getByRole('navigation', { name: 'Migas' })
      .getByRole('link', { name: 'Tus libros' })
      .click();
    await expect(page).toHaveURL(/\/panel$/);
  });
});
