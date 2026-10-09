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
    // Solo el nombre del quiz, nunca su contenido.
    const experiences = page.getByRole('region', { name: /experiencia inmersiva/ });
    await expect(experiences.getByText('Quiz con código', { exact: true })).toBeVisible();
    await expect(page.getByText('¿Cuál?')).toHaveCount(0);

    const buy = page.getByRole('region', { name: 'Cómo comprar el libro' });
    await expect(buy.getByRole('link', { name: 'Comprar en Amazon' })).toHaveAttribute(
      'href',
      'https://amazon.com/x',
    );

    // Contacto: el servidor responde 202 y la pantalla confirma.
    const author = page.getByRole('region', { name: 'Conoce a la autora' });
    await author.getByLabel(/Nombre completo/).fill('Lectora E2E');
    await author.getByLabel(/Correo electrónico/).fill('lectora-e2e@ejemplo.com');
    await author.getByLabel(/^Mensaje/).fill('Hola, este es un mensaje de prueba E2E.');
    const sent = page.waitForResponse((r) => r.url().endsWith('/api/contact'));
    await author.getByRole('button', { name: 'Enviar mensaje' }).click();
    expect((await sent).status()).toBe(202);
    await expect(author.getByText('Gracias, recibimos tu mensaje.')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('la autora edita la portada en el panel y el visitante la ve', async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, 'Flujo de administración de escritorio.');
    const headline = `Frase E2E ${Date.now()}`;
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio del panel' })).toBeVisible();

    await page.getByRole('link', { name: 'Portada y autora' }).click();
    await page.getByLabel('Frase principal del sitio').fill(headline);
    // La base conserva lo guardado en corridas anteriores: se parte sin redes.
    const remove = page.getByRole('button', { name: /^Quitar/ });
    while ((await remove.count()) > 0) await remove.first().click();
    await page.getByRole('button', { name: '+ Agregar red' }).click();
    await page.getByLabel('Red 1').fill('Instagram E2E');
    await page.getByLabel('Enlace 1').fill('https://instagram.com/e2e');
    await page.getByRole('button', { name: 'Guardar' }).click();
    // El aviso no desaparece solo (el formulario no se recarga).
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText('Cambios guardados')).toBeVisible();

    const visitor = await browser.newContext();
    const view = await visitor.newPage();
    await view.goto(`${baseURL}/`);
    await expect(view.getByRole('heading', { level: 1, name: headline })).toBeVisible();
    await expect(
      view
        .getByRole('list', { name: 'Redes sociales' })
        .getByRole('link', { name: 'Instagram E2E' }),
    ).toHaveAttribute('href', 'https://instagram.com/e2e');
    await visitor.close();
  });
});
