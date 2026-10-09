import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const DAY = 86_400_000;

test.describe('actualizaciones (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'Flujo de administración de escritorio.');

  test('la autora crea un evento en el panel; el visitante lo ve en la lista, en el detalle y en la landing; lo no publicado no se ve', async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const title = `Feria E2E ${stamp}`;

    // Contenido que NO debe verse: un borrador y una programada (por API, como administradora).
    const api = await playwright.request.newContext({ baseURL });
    expect(
      (
        await api.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    const hidden = async (slug: string, over: object) =>
      expect(
        (
          await api.post('/api/admin/posts', {
            data: {
              slug,
              title: `Oculta ${slug}`,
              template: 'text',
              data: { bodyHtml: '<p>No debe verse</p>' },
              ...over,
            },
          })
        ).status(),
      ).toBe(201);
    await hidden(`borrador-${stamp}`, { status: 'draft' });
    await hidden(`programada-${stamp}`, {
      status: 'published',
      publishedAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });

    // La autora entra al panel y crea un evento con la plantilla «Evento».
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio del panel' })).toBeVisible();
    await page.getByRole('link', { name: 'Actualizaciones' }).click();
    await page.getByRole('link', { name: '+ Nueva actualización' }).click();
    await page.getByRole('button', { name: /Evento/ }).click();

    await page.getByRole('textbox', { name: /^Título/ }).fill(title);
    await page.getByLabel('Lugar').fill('Librería Central');
    await page.getByLabel('Inicia').fill('2027-03-20T16:00');
    await page.getByLabel('Dirección', { exact: true }).fill('Avenida 1, San José');
    await page.getByLabel('Enlace de más información').fill('https://ejemplo.com/feria');
    await page.getByLabel('Destacar en la página principal').check();
    // La vista previa ya muestra la plantilla con lo escrito.
    await expect(
      page
        .getByRole('heading', { name: 'Vista previa' })
        .locator('..')
        .getByText('Librería Central'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByText('Cambios guardados')).toBeVisible();

    // La lista del panel la muestra publicada y destacada.
    await page.goto('/admin/actualizaciones');
    await expect(
      page.getByRole('row', { name: new RegExp(`${title}.*Destacada.*Evento.*Publicada`) }),
    ).toBeVisible();

    // El visitante (sin sesión) la encuentra.
    const visitor = await browser.newContext();
    const view = await visitor.newPage();
    await view.goto(`${baseURL}/actualizaciones?tipo=eventos`);
    const card = view.getByRole('link', { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await expect(view.getByText(`Oculta borrador-${stamp}`)).toHaveCount(0);
    await expect(view.getByText(`Oculta programada-${stamp}`)).toHaveCount(0);
    await card.click();
    await expect(view.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(view.getByText(/20 de marzo de 2027/)).toBeVisible();
    await expect(view.getByText(/4:00/)).toBeVisible();
    await expect(view.getByText('Librería Central')).toBeVisible();
    await expect(view.getByRole('link', { name: 'Más información' })).toHaveAttribute(
      'href',
      'https://ejemplo.com/feria',
    );

    // Y aparece entre las destacadas de la página principal.
    await view.goto(`${baseURL}/`);
    const featured = view.getByRole('region', { name: 'Actualizaciones' });
    await expect(featured.getByRole('link', { name: new RegExp(title) })).toBeVisible();

    // Directo por la API: lo no publicado no existe para el público (mismo 404 que lo inexistente).
    const missing = await view.request.get(`/api/posts/no-existe-${stamp}`);
    for (const slug of [`borrador-${stamp}`, `programada-${stamp}`]) {
      const res = await view.request.get(`/api/posts/${slug}`);
      expect(res.status(), slug).toBe(404);
      expect(await res.text()).toBe(await missing.text());
    }
    await visitor.close();
    await api.dispose();
  });
});
