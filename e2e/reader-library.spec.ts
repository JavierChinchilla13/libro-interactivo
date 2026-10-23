import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const PASSWORD = 'Nube-Azul-Cuatro-87';
const cover = {
  provider: 'cloudinary',
  publicId: 'libro/e2e',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/e2e',
  width: 100,
  height: 100,
  alt: 'Portada',
};

async function created(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string };
}

test.describe('«Tus libros» del panel (celular y escritorio)', () => {
  test('el libro sin abrir sale bloqueado, el «próximamente» solo si la autora lo enciende, y borrador no aparece', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const admin = await playwright.request.newContext({ baseURL });
    expect(
      (
        await admin.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    const book = async (suffix: string, over: Record<string, unknown>) =>
      created(
        await admin.post('/api/admin/books', {
          data: {
            slug: `tus-libros-${suffix}-${stamp}`,
            title: `Tus libros ${suffix} ${stamp}`,
            synopsis: '',
            cover,
            ...over,
          },
        }),
      );
    const blocked = await book('cerrado', { order: 1, status: 'published' });
    const quiz = await created(
      await admin.post('/api/admin/quizzes', {
        data: { bookId: blocked.id, slug: 'quiz-1', order: 1, title: `Quiz cerrado ${stamp}` },
      }),
    );
    await admin.put(`/api/admin/quizzes/${quiz.id}/draft`, {
      data: {
        title: `Quiz cerrado ${stamp}`,
        instructionsHtml: '',
        settings: { allowRetake: true, showBreakdown: false },
        stages: [
          {
            id: 'etapa-1',
            order: 1,
            producesFinal: true,
            questions: [
              {
                id: 'p1',
                text: '¿Cuál?',
                answers: [
                  { id: 'p1a', text: 'A', resultKey: 'r1' },
                  { id: 'p1b', text: 'B', resultKey: 'r2' },
                ],
              },
            ],
          },
        ],
        results: [
          { key: 'r1', stageId: 'etapa-1', title: 'Resultado A' },
          { key: 'r2', stageId: 'etapa-1', title: 'Resultado B' },
        ],
      },
    });
    expect((await admin.post(`/api/admin/quizzes/${quiz.id}/publish`)).status()).toBe(201);
    await book('visible', {
      order: 2,
      status: 'upcoming',
      releaseDate: '2099-01-01',
      showInReaderPanel: true,
    });
    await book('oculto', { order: 3, status: 'upcoming', showInReaderPanel: false });
    await book('borrador', { order: 4, status: 'draft', showInReaderPanel: true });

    // La lectora se registra por API y entra por la interfaz.
    const email = `tus-libros-${stamp}@ejemplo.com`;
    const reader = await playwright.request.newContext({ baseURL });
    expect(
      (
        await reader.post('/api/auth/register', {
          data: { name: 'Lectora Libros', email, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    const welcome = page.waitForResponse(
      (response) =>
        response.url().includes('/api/me/welcome') && response.request().method() === 'GET',
    );
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const { show } = (await (await welcome).json()) as { show: boolean };
    await expect(page.getByRole('heading', { name: 'Hola, Lectora Libros' })).toBeVisible();
    if (show) await page.getByRole('button', { name: '¡A la aventura!' }).click();

    // Bloqueado: portada y título, el candado y la indicación del QR; sin enlaces.
    const closed = page.getByRole('article', { name: `Tus libros cerrado ${stamp}` });
    await expect(closed).toHaveAttribute('data-access', 'locked');
    await expect(closed.getByText('Escanea el QR del primer quiz para abrirlo')).toBeVisible();
    await expect(closed.getByRole('link')).toHaveCount(0);
    // «Próximamente» encendido: con cuenta atrás. Apagado y borrador: no aparecen.
    const soon = page.getByRole('article', { name: `Tus libros visible ${stamp}` });
    await expect(soon).toHaveAttribute('data-access', 'upcoming');
    await expect(soon.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('article', { name: `Tus libros oculto ${stamp}` })).toHaveCount(0);
    await expect(page.getByRole('article', { name: `Tus libros borrador ${stamp}` })).toHaveCount(
      0,
    );

    // La página del libro bloqueado solo enseña lo público (nada del quiz) y su quiz responde 403.
    await page.goto(`/panel/libros/tus-libros-cerrado-${stamp}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`cerrado ${stamp}`);
    await expect(page.getByText('Escanea el QR del primer quiz para abrirlo')).toBeVisible();
    await expect(page.getByText(`Quiz cerrado ${stamp}`)).toHaveCount(0);
    const direct = await page.request.get(`/api/quizzes/${quiz.id}`);
    expect(direct.status()).toBe(403);
    // Un libro «próximamente» apagado no tiene página para la lectora.
    await page.goto(`/panel/libros/tus-libros-oculto-${stamp}`);
    await expect(page.getByText('Página no encontrada')).toBeVisible();
  });
});
