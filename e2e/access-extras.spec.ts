import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';
import { seedPublishedQuiz } from './seed';

/** Mismo valor por defecto de desarrollo que usa el API en las pruebas (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;

async function login(page: Page) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(E2E_ADMIN.email);
  await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio del panel' })).toBeVisible();
}

test.describe('códigos QR y capítulos extra', () => {
  test.skip(({ isMobile }) => isMobile, 'Flujos de administración de escritorio.');

  test('un código inválido muestra siempre el mensaje genérico (sin sesión)', async ({ page }) => {
    await page.goto('/u/codigo-inventado');
    await expect(page.getByText(/Este código no es válido/)).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Ingresar' })).toHaveCount(0);
  });

  test('la administradora crea, descarga y revoca un código', async ({ page }) => {
    const stamp = Date.now();
    await login(page);
    const { bookTitle } = await seedPublishedQuiz(page.request, stamp);

    await page.goto('/admin/qr'); // recarga: la lista de libros se sembró por API
    await expect(page.getByRole('link', { name: 'Códigos QR' })).toBeVisible();
    await page.getByLabel('Libro').selectOption({ label: bookTitle });
    await page.getByLabel('Quiz', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear código' }).click();

    const card = page.getByRole('article').filter({ hasText: 'Quiz con código' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Activo')).toBeVisible();
    const pdfLink = card.getByRole('link', { name: /Descargar PDF/ });
    const href = await pdfLink.getAttribute('href');
    expect(href).toMatch(/^\/api\/admin\/access-tokens\/[0-9a-f]{24}\/qr\.pdf$/);

    const pdf = await page.request.get(href ?? '');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    page.once('dialog', (dialog) => void dialog.accept());
    await card.getByRole('button', { name: 'Revocar' }).click();
    await expect(card.getByText('Revocado')).toBeVisible();
    await expect(card.getByRole('link', { name: /Descargar PDF/ })).toHaveCount(0);
  });

  test('flujo completo: el lector escanea el QR, se desbloquea en su cuenta y el quiz se abre', async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    await login(page);
    const { quizId, bookId } = await seedPublishedQuiz(page.request, stamp);
    const created = await (
      await page.request.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quizId } })
    ).json();
    const token = tokenFor(created.id);

    // Otra persona (contexto limpio): se registra y escanea el código.
    const reader = await browser.newContext();
    const readerPage = await reader.newPage();
    const register = await reader.request.post('/api/auth/register', {
      data: {
        name: 'Lectora E2E',
        email: `lectora-${stamp}@ejemplo.com`,
        password: 'Nube-Azul-Cuatro-87',
      },
    });
    expect(register.status()).toBe(201);

    // Antes del canje el servidor no entrega el quiz (el QR es obligatorio en producción; aquí se activa por entorno).
    await readerPage.goto(`/u/${token}`);
    await expect(readerPage.getByText('Quiz con código', { exact: true })).toBeVisible();
    await expect(readerPage.getByText('¡Desbloqueado!')).toBeVisible();

    // Escanear otra vez es inofensivo.
    await readerPage.reload();
    await expect(readerPage.getByText('Ya lo tenías desbloqueado')).toBeVisible();

    const quiz = await reader.request.get(`/api/quizzes/${quizId}`);
    expect(quiz.status()).toBe(200);
    // Los extras siguen bloqueados hasta completar el libro: ni siquiera se dice cuántos hay.
    const locked = await reader.request.get(`/api/extras?bookId=${bookId}`);
    expect(await locked.json()).toEqual({ locked: true });
    await reader.close();
  });

  test('crear un capítulo extra de texto, verlo en la lista y en la vista previa', async ({
    page,
  }) => {
    const stamp = Date.now();
    await login(page);
    const { bookTitle } = await seedPublishedQuiz(page.request, stamp);

    await page.goto('/admin/extras'); // recarga: la lista de libros se sembró por API
    await page.getByLabel('Libro').selectOption({ label: bookTitle });
    await page.getByRole('link', { name: '+ Nuevo extra' }).click();
    await page.getByRole('textbox', { name: /^Título/ }).fill('Extra E2E');
    await page.getByRole('textbox', { name: 'Texto del capítulo' }).fill('Texto secreto del extra');
    await page.getByLabel('Estado').selectOption('published');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();

    await page.getByRole('button', { name: 'Vista previa' }).click();
    await expect(page.getByText('Texto secreto del extra').last()).toBeVisible();
    await expect(page.getByText(/no cuenta como «visto»/)).toBeVisible();

    await page.getByRole('link', { name: '← Capítulos extra' }).click();
    await page.getByLabel('Libro').selectOption({ label: bookTitle });
    await expect(
      page.getByRole('row', { name: /Extra E2E.*Texto en pantalla.*Publicado/ }),
    ).toBeVisible();
  });
});
