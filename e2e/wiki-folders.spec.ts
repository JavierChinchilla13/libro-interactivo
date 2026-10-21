import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

async function ok(response: Awaited<ReturnType<APIRequestContext['post']>>, status = 201) {
  expect(response.status(), await response.text()).toBe(status);
  return (await response.json()) as { id: string };
}

test.describe('wiki: lugares en carpetas (celular y escritorio)', () => {
  test('cada tipo es una carpeta; se abre con teclado y Esc la cierra', async ({
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const admin = await playwright.request.newContext({ baseURL });
    await admin.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    const cover = {
      provider: 'cloudinary',
      publicId: 'libro/e2e',
      url: 'https://res.cloudinary.com/demo/image/upload/libro/e2e',
      width: 100,
      height: 100,
      alt: 'Portada',
    };
    // Orden 1: no es el libro destacado de la portada (el de mayor orden), así no afecta a otras pruebas.
    const book = await ok(
      await admin.post('/api/admin/books', {
        data: {
          slug: `carpetas-${stamp}`,
          title: `Libro de carpetas ${stamp}`,
          synopsis: '',
          order: 1,
          status: 'published',
          cover,
        },
      }),
    );
    const editable = await (await admin.get(`/api/admin/books/${book.id}`)).json();
    const { id, createdAt, updatedAt, ...input } = editable;
    void id;
    void createdAt;
    void updatedAt;
    const save = (status: string) =>
      admin.put(`/api/admin/books/${book.id}`, {
        data: {
          ...input,
          status,
          wikiSections: [{ kind: 'place', title: 'Lugares', order: 1, enabled: true }],
        },
      });
    try {
      expect((await save('published')).status()).toBe(200);
      const place = async (slug: string, name: string, group: string) =>
        ok(
          await admin.post('/api/admin/wiki', {
            data: { bookId: book.id, kind: 'place', slug, name, group, status: 'published' },
          }),
        );
      await place('sala', 'Sala de pruebas', 'Laboratorio');
      await place('pasillo', 'Pasillo norte', 'Laboratorio');
      await place('plaza', 'Plaza vieja', 'Ciudad');

      const context = await browser.newContext();
      await context.addInitScript(
        (value) => localStorage.setItem('libro_selected_book', value),
        book.id,
      );
      const page = await context.newPage();
      await page.goto('/wiki/lugares');
      const laboratorio = page.getByRole('button', { name: /Laboratorio/ });
      const ciudad = page.getByRole('button', { name: /Ciudad/ });
      await expect(laboratorio).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('link', { name: /Sala de pruebas/ })).toBeVisible();
      // La hoja abre con un fundido corto: se espera a que termine para la captura.
      await expect(page.locator('.glass-folder-sheet')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: process.env['FOLDERS_SHOT'] ?? 'test-results/folders.png' });

      // Con teclado: foco en la carpeta, Enter la abre y cierra la anterior.
      await ciudad.focus();
      await page.keyboard.press('Enter');
      await expect(ciudad).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('link', { name: /Plaza vieja/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Sala de pruebas/ })).toHaveCount(0);

      await page.getByRole('link', { name: /Plaza vieja/ }).focus();
      await page.keyboard.press('Escape');
      await expect(ciudad).toHaveAttribute('aria-expanded', 'false');
      await expect(ciudad).toBeFocused();
    } finally {
      await save('archived');
    }
  });
});
