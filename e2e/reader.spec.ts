import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

/** Mismo valor por defecto de desarrollo que usa el API (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';

/** Prepara por API, como administradora: un libro con un quiz con secuencia de revelado, su QR y un extra de texto. */
async function seedBook(api: APIRequestContext, stamp: string) {
  const cover = {
    provider: 'cloudinary',
    publicId: 'libro/e2e',
    url: 'https://res.cloudinary.com/demo/image/upload/libro/e2e',
    width: 100,
    height: 100,
    alt: 'Portada',
  };
  const ok = async (response: Awaited<ReturnType<APIRequestContext['post']>>, status = 201) => {
    expect(response.status(), await response.text()).toBe(status);
    return (await response.json()) as { id: string };
  };

  const book = await ok(
    await api.post('/api/admin/books', {
      data: {
        slug: `libro-lector-${stamp}`,
        title: `Libro del lector ${stamp}`,
        synopsis: '',
        order: 1,
        status: 'published',
        cover,
      },
    }),
  );
  const quiz = await ok(
    await api.post('/api/admin/quizzes', {
      data: { bookId: book.id, slug: 'quiz-1', order: 1, title: `Quiz del lector ${stamp}` },
    }),
  );
  const answers = (id: string) => [
    { id: `${id}a`, text: 'Me quedo', resultKey: 'r1' },
    { id: `${id}b`, text: 'Me voy', resultKey: 'r2' },
  ];
  await api.put(`/api/admin/quizzes/${quiz.id}/draft`, {
    data: {
      title: `Quiz del lector ${stamp}`,
      instructionsHtml: '<p>Elige lo que más va contigo.</p>',
      settings: {
        allowRetake: true,
        showBreakdown: true,
        revealIntro: { lines: ['Decodificando tus respuestas…'], effect: 'decodificar' },
      },
      stages: [
        {
          id: 'etapa-1',
          order: 1,
          producesFinal: true,
          questions: [
            { id: 'p1', text: '¿Qué haces?', answers: answers('p1') },
            { id: 'p2', text: '¿Y después?', answers: answers('p2') },
          ],
        },
      ],
      results: [
        {
          key: 'r1',
          stageId: 'etapa-1',
          title: 'Eres de los que se quedan',
          facts: [{ label: 'Tu cápsula', value: 'Cápsula 7' }],
        },
        { key: 'r2', stageId: 'etapa-1', title: 'Eres de los que se van' },
      ],
    },
  });
  await ok(await api.post(`/api/admin/quizzes/${quiz.id}/publish`));
  const code = await ok(
    await api.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quiz.id } }),
  );
  await ok(
    await api.post('/api/admin/extras', {
      data: {
        bookId: book.id,
        slug: 'extra-1',
        title: `Extra del lector ${stamp}`,
        kind: 'text',
        bodyHtml: '<p>Contenido secreto del extra.</p>',
        status: 'published',
        order: 1,
      },
    }),
  );
  return {
    bookId: book.id,
    quizId: quiz.id,
    bookTitle: `Libro del lector ${stamp}`,
    quizTitle: `Quiz del lector ${stamp}`,
    token: tokenFor(code.id),
    extraTitle: `Extra del lector ${stamp}`,
  };
}

test.describe('experiencia del lector (celular y escritorio)', () => {
  test('registro → QR → quiz → resultado → extras, con mensaje de bienvenida', async ({
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = String(Date.now());
    const admin = await playwright.request.newContext({ baseURL });
    expect(
      (
        await admin.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    const seeded = await seedBook(admin, stamp);
    // La autora escribe el mensaje de bienvenida (queda activo en la base de pruebas: es un ajuste global).
    const welcomeSaved = await admin.patch('/api/admin/site-settings', {
      data: {
        welcome: {
          enabled: true,
          title: 'Bienvenida E2E',
          bodyHtml: '<p>Este es el pacto con quien lee.</p>',
          showMode: 'every_login',
        },
      },
    });
    expect(welcomeSaved.status()).toBe(200);

    const context = await browser.newContext(
      playwright.devices[test.info().project.name === 'movil' ? 'Pixel 7' : 'Desktop Chrome'],
    );
    // La base de pruebas tiene muchos libros: el lector trabaja con el suyo (lo mismo que hace el selector de libro).
    await context.addInitScript(
      (id) => localStorage.setItem('libro_selected_book', id),
      seeded.bookId,
    );
    const page = await context.newPage();

    // 1) Escanea el QR sin cuenta: ve qué desbloqueará y se le ofrece crear la cuenta.
    await page.goto(`/u/${seeded.token}`);
    await expect(page.getByRole('heading', { name: 'Desbloquear contenido' })).toBeVisible();
    await expect(page.getByText(seeded.quizTitle, { exact: true })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).click();

    // 2) Se registra (con medidor y reglas de contraseña) y VUELVE al QR, que se canjea solo.
    await page.getByLabel(/^Nombre/).fill('Lectora E2E');
    await page.getByLabel(/^Correo/).fill(`lectora-${stamp}@ejemplo.com`);
    await page.getByLabel(/^Contraseña/).fill('password123');
    await expect(page.getByTestId('password-meter')).toContainText('demasiado común');
    await page.getByLabel(/^Contraseña/).fill(PASSWORD);
    await expect(page.getByTestId('password-meter')).toContainText('muy buena');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('¡Desbloqueado!')).toBeVisible();

    // 3) Va a su panel: aparece el mensaje de bienvenida; el quiz está disponible.
    await page.getByRole('link', { name: 'Ir a mi panel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Bienvenida E2E' });
    await expect(dialog).toContainText('Este es el pacto con quien lee.');
    await dialog.getByRole('button', { name: '¡A la aventura!' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Hola, Lectora E2E' })).toBeVisible();
    await expect(page.getByText('Progreso: 0 de 1')).toBeVisible();
    // Los extras siguen cerrados y no revelan nada.
    await expect(page.getByText('Bloqueados')).toBeVisible();
    await expect(page.getByText(seeded.extraTitle)).toHaveCount(0);

    // 4) Hace el quiz: intro → preguntas (con «Atrás») → revelado → resultado con porcentajes y datos.
    await page.getByRole('link', { name: new RegExp(`Empezar\\s*${seeded.quizTitle}`) }).click();
    await expect(page.getByRole('heading', { name: seeded.quizTitle })).toBeVisible();
    await expect(page.getByText('Elige lo que más va contigo.')).toBeVisible();
    await page.getByRole('button', { name: 'Comenzar' }).click();
    await expect(page.getByText('Pregunta 1 de 2')).toBeVisible();
    const next = page.getByRole('button', { name: /Siguiente/ });
    await expect(next).toBeDisabled();
    await page.getByRole('radio', { name: 'Me quedo' }).check();
    await next.click();
    await expect(page.getByText('Pregunta 2 de 2')).toBeVisible();
    await page.getByRole('button', { name: /Atrás/ }).click();
    await expect(page.getByRole('radio', { name: 'Me quedo' })).toBeChecked();
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByRole('radio', { name: 'Me quedo' }).check();
    await page.getByRole('button', { name: 'Terminar' }).click();

    await expect(page.getByText('Decodificando tus respuestas…')).toBeVisible();
    await page.getByRole('button', { name: 'Saltar ›' }).click();
    await expect(page.getByRole('heading', { name: 'Eres de los que se quedan' })).toBeVisible();
    await expect(page.getByText('Cápsula 7')).toBeVisible();
    await expect(page.getByText('100%')).toBeVisible();
    await page.getByRole('link', { name: 'Volver a mi panel' }).click();

    // 5) El panel refleja el avance y se abren los extras (libro completo).
    await expect(page.getByText('Progreso: 1 de 1')).toBeVisible();
    await expect(page.getByText(/Completaste todo el libro/)).toBeVisible();
    await page.getByRole('link', { name: 'Ver los extras' }).click();
    await expect(page.getByRole('heading', { name: seeded.extraTitle })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(`Abrir\\s*${seeded.extraTitle}`) }).click();
    await expect(page.getByText('Contenido secreto del extra.')).toBeVisible();

    // 6) Sus resultados quedan guardados; el panel no desborda en ninguna pantalla.
    for (const path of ['/panel', '/panel/resultados', '/panel/extras', '/panel/cuenta']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `desborde en ${path}`).toBeLessThanOrEqual(1);
    }
    await page.goto('/panel/resultados');
    await expect(page.getByRole('heading', { name: 'Eres de los que se quedan' })).toBeVisible();

    // 7) Cerrar sesión: el panel vuelve a pedir ingresar.
    await page.goto('/panel/cuenta');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
    await page.goto('/panel');
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();

    await context.close();
    await admin.dispose();
  });

  test('recuperar contraseña: la pantalla responde siempre igual y la de restablecer rechaza un enlace inventado', async ({
    page,
  }) => {
    await page.goto('/ingresar');
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await page.getByLabel(/^Correo/).fill('nadie@ejemplo.com');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(
      page.getByText(/Si el correo está registrado, te enviamos un enlace/),
    ).toBeVisible();

    await page.goto(`/restablecer/${'x'.repeat(43)}`);
    await page.getByLabel(/^Nueva contraseña/).fill(PASSWORD);
    await page.getByLabel(/^Repite/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(
      page.getByText('El enlace no es válido o ya caducó. Solicita uno nuevo.'),
    ).toBeVisible();
  });

  test('sin sesión, el panel del lector pide ingresar y un quiz no se abre por dirección directa', async ({
    page,
  }) => {
    await page.goto('/panel/quiz/670000000000000000000001');
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  });
});
