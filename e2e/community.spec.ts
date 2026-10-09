import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const image = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/${name}.png`,
  width: 600,
  height: 600,
  alt: `Dibujo ${name}`,
});

/** Las reseñas de corridas anteriores se ocultan: la landing solo muestra las primeras por orden. */
async function hidePreviousE2eReviews(api: APIRequestContext) {
  const { reviews } = await (await api.get('/api/admin/reviews')).json();
  for (const review of reviews as {
    id: string;
    text: string;
    authorName: string;
    order: number;
  }[]) {
    if (!review.authorName.startsWith('Lector E2E')) continue;
    await api.put(`/api/admin/reviews/${review.id}`, {
      data: {
        text: review.text,
        authorName: review.authorName,
        order: review.order,
        status: 'hidden',
      },
    });
  }
}

test.describe('fan arts y reseñas (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'Flujo de administración de escritorio.');

  test('la autora carga una reseña en el panel y un fan art; el público solo ve lo publicado y con permiso', async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const api = await playwright.request.newContext({ baseURL });
    expect(
      (
        await api.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    await hidePreviousE2eReviews(api);

    // Fan arts por API (subir imágenes necesita Cloudinary): uno visible y tres que NO deben verse.
    const art = (artistName: string, over: object) =>
      api.post('/api/admin/fan-arts', {
        data: { image: image(artistName), artistName, order: 1, ...over },
      });
    const visible = await art(`Artista Visible ${stamp}`, {
      title: `Dibujo ${stamp}`,
      artistLink: 'https://ejemplo.com/artista',
      permissionConfirmed: true,
      status: 'published',
    });
    expect(visible.status(), await visible.text()).toBe(201);
    expect(
      (
        await art(`Sin Permiso ${stamp}`, { permissionConfirmed: false, status: 'published' })
      ).status(),
    ).toBe(400);
    expect(
      (await art(`Borrador ${stamp}`, { permissionConfirmed: true, status: 'draft' })).status(),
    ).toBe(201);
    expect(
      (await art(`Archivado ${stamp}`, { permissionConfirmed: true, status: 'archived' })).status(),
    ).toBe(201);
    // Una reseña oculta por API.
    expect(
      (
        await api.post('/api/admin/reviews', {
          data: {
            text: `Reseña oculta ${stamp}`,
            authorName: `Lector E2E Oculto ${stamp}`,
            status: 'hidden',
          },
        })
      ).status(),
    ).toBe(201);

    // La autora escribe una reseña desde el panel.
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio del panel' })).toBeVisible();
    await page.getByRole('link', { name: 'Reseñas' }).click();
    await page.getByRole('link', { name: '+ Nueva reseña' }).click();
    await page.getByLabel(/^Reseña/).fill(`Una historia que no suelto ${stamp} <b>negrita</b>`);
    await page.getByLabel(/Nombre del lector/).fill(`Lector E2E ${stamp}`);
    await page.getByLabel('Dónde se publicó (opcional)').fill('Goodreads');
    await page.getByLabel('Calificación (opcional)').selectOption('5');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByText('Cambios guardados')).toBeVisible();

    // El panel de fan arts la lista con el permiso confirmado.
    await page.getByRole('link', { name: 'Fan arts' }).first().click();
    await expect(
      page.getByRole('row', {
        name: new RegExp(`Dibujo ${stamp}.*Artista Visible ${stamp}.*Confirmado.*Publicado`),
      }),
    ).toBeVisible();

    // El visitante: ve la reseña (como texto, sin interpretar el HTML) y no la oculta.
    const visitor = await browser.newContext();
    const view = await visitor.newPage();
    await view.goto(`${baseURL}/`);
    const reviews = view.getByRole('region', { name: 'Reseñas de lectores' });
    await expect(
      reviews.getByText(new RegExp(`Una historia que no suelto ${stamp} <b>negrita</b>`)),
    ).toBeVisible();
    await expect(reviews.getByText(`Lector E2E ${stamp}`, { exact: false })).toBeVisible();
    await expect(reviews.getByRole('img', { name: '5 de 5 estrellas' })).toBeVisible();
    await expect(view.getByText(`Reseña oculta ${stamp}`)).toHaveCount(0);
    await expect(reviews.locator('b')).toHaveCount(0);

    // La galería: solo el publicado con permiso, y se amplía con el crédito del artista.
    await view.goto(`${baseURL}/fan-arts`);
    await expect(view.getByRole('button', { name: new RegExp(`Dibujo ${stamp}`) })).toBeVisible();
    for (const hidden of ['Sin Permiso', 'Borrador', 'Archivado']) {
      await expect(
        view.getByRole('button', { name: new RegExp(`${hidden} ${stamp}`) }),
      ).toHaveCount(0);
    }
    await view.getByRole('button', { name: new RegExp(`Dibujo ${stamp}`) }).click();
    const dialog = view.getByRole('dialog', { name: 'Foto ampliada' });
    await expect(
      dialog.getByRole('link', { name: new RegExp(`Artista Visible ${stamp}`) }),
    ).toHaveAttribute('href', 'https://ejemplo.com/artista');
    await expect(dialog.getByText(/publicado con su permiso/)).toBeVisible();
    await view.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Por la API pública tampoco sale nada privado.
    const raw = await (await view.request.get('/api/fan-arts')).text();
    expect(raw).not.toMatch(
      /permissionNote|permissionConfirmed|createdBy|Sin Permiso|Borrador|Archivado/,
    );
    await visitor.close();
    await api.dispose();
  });
});
