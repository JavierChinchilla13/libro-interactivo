import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';
import { seedPublishedQuiz } from './seed';

async function adminApi(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  expect(login.status()).toBe(200);
  return request;
}

test.describe('landing pública', () => {
  test('el visitante ve el libro, la wiki bloqueada, las experiencias, cómo comprar y puede escribir a la autora', async ({
    page,
    request,
    isMobile,
  }) => {
    // El libro destacado es global (el publicado más reciente): dos proyectos a la vez se pisarían. El ancho de
    // móvil de la landing con contenido lo cubre `home.spec.ts`.
    test.skip(isMobile, 'Siembra datos globales: solo en escritorio.');
    const stamp = Date.now();
    const api = await adminApi(request);
    // La base E2E conserva los libros de corridas anteriores: el orden crece con el tiempo para ser siempre el «más reciente».
    const { bookId, bookTitle, quizId } = await seedPublishedQuiz(api, stamp, {
      bookOrder: Math.floor(stamp / 1000),
    });
    const current = await (await api.get(`/api/admin/books/${bookId}`)).json();
    const { id, createdAt, updatedAt, ...editable } = current;
    void id;
    void createdAt;
    void updatedAt;
    const saved = await api.put(`/api/admin/books/${bookId}`, {
      data: {
        ...editable,
        genres: ['Distopía'],
        minAge: 16,
        contentWarning: '<p>[PLACEHOLDER] Contenido sensible</p>',
        purchaseLinks: [
          {
            region: 'CR',
            kind: 'whatsapp',
            label: 'Escribir por WhatsApp',
            url: 'https://wa.me/506',
          },
          {
            region: 'INTL',
            kind: 'amazon',
            label: 'Comprar en Amazon',
            url: 'https://amazon.com/x',
          },
        ],
        wikiSections: [
          {
            kind: 'character',
            title: 'Personajes',
            order: 1,
            enabled: true,
            unlockAfter: { kind: 'quiz', refId: quizId },
            lockedMessage: 'Se habilita al avanzar en tu lectura',
          },
          { kind: 'term', title: 'Glosario', order: 2, enabled: true },
        ],
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);

    await page.goto('/');
    await expect(page.getByRole('region', { name: bookTitle })).toBeVisible();
    await expect(page.getByLabel('Advertencia de contenido sensible')).toContainText('16 años');

    const wiki = page.getByRole('region', { name: 'Wiki del universo' });
    await expect(wiki.getByRole('listitem').filter({ hasText: 'Personajes' })).toContainText(
      'Se habilita al avanzar en tu lectura',
    );
    await expect(wiki.getByRole('listitem').filter({ hasText: 'Glosario' })).toContainText(
      'Abierto para todos',
    );
    // Solo el tipo y la posición, nunca el título del quiz ni su contenido.
    const experiences = page.getByRole('region', { name: /experiencia inmersiva/ });
    await expect(experiences.getByText('Quiz 1', { exact: true })).toBeVisible();
    await expect(experiences.getByText('Quiz con código')).toHaveCount(0);
    await expect(page.getByText('¿Cuál?')).toHaveCount(0);

    const buy = page.getByRole('region', { name: 'Cómo comprar el libro' });
    await expect(buy.getByRole('link', { name: 'Comprar en Amazon' })).toHaveAttribute(
      'href',
      'https://amazon.com/x',
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    // «Ver el libro» lleva a su página (mínima) y «Volver al inicio» regresa.
    await page
      .getByRole('region', { name: bookTitle })
      .getByRole('link', { name: 'Ver el libro' })
      .click();
    await expect(page).toHaveURL(/\/libros\/libro-qr-\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: bookTitle })).toBeVisible();
    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page).toHaveURL(/\/$/);

    // Contacto: la portada no lleva el formulario, solo la invitación; el servidor responde 202 y la pantalla confirma.
    const author = page.getByRole('region', { name: 'Conoce a la autora' });
    await expect(author.getByLabel(/Nombre completo/)).toHaveCount(0);
    await author.getByRole('link', { name: 'Escríbele a la autora' }).click();
    await expect(page).toHaveURL(/\/contacto$/);
    await page.getByLabel(/Nombre completo/).fill('Lectora E2E');
    await page.getByLabel(/Correo electrónico/).fill('lectora-e2e@ejemplo.com');
    await page.getByLabel(/^Mensaje/).fill('Hola, este es un mensaje de prueba E2E.');
    const sent = page.waitForResponse((r) => r.url().endsWith('/api/contact'));
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    expect((await sent).status()).toBe(202);
    await expect(page.getByText('Gracias, recibimos tu mensaje.')).toBeVisible();
  });
});
