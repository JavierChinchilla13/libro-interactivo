import { expect, test, type Page } from '@playwright/test';
import { ADULT_CONSENT } from './consent';
import { E2E_ADMIN } from './global-setup';

const cover = {
  provider: 'cloudinary',
  publicId: 'libro/e2e',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/e2e',
  width: 100,
  height: 100,
  alt: 'Portada',
};

const answers = [
  { id: 'p1a', text: 'Respuesta A', resultKey: 'r1' },
  { id: 'p1b', text: 'Respuesta B', resultKey: 'r2' },
];

/** El quiz de la prueba: una pregunta, dos resultados; los títulos cambian entre lo publicado y el borrador. */
const quizDraft = (results: { a: string; b: string }) => ({
  title: 'Quiz 1 del equipo',
  instructionsHtml: '',
  // Se juega UNA sola vez: para el equipo no debe estorbar.
  settings: { allowRetake: false, showBreakdown: false },
  stages: [
    {
      id: 'etapa-1',
      order: 1,
      producesFinal: true,
      questions: [{ id: 'p1', text: '¿Cuál?', answers }],
    },
  ],
  results: [
    { key: 'r1', stageId: 'etapa-1', title: results.a },
    { key: 'r2', stageId: 'etapa-1', title: results.b },
  ],
});

/**
 * Otra prueba puede encender el mensaje de bienvenida (un ajuste global de la base) en cualquier momento y su ventana
 * taparía los botones: se cierra sola cuando aparezca, en esta pestaña y en las que se abran después.
 */
async function autoDismissWelcome(page: Page) {
  await page.addLocatorHandler(page.getByRole('button', { name: '¡A la aventura!' }), (button) =>
    button.click(),
  );
}

async function play(page: Page, answer: string, result: string) {
  await page.getByRole('button', { name: /^(Comenzar|Repetir)$/ }).click();
  await page.getByRole('radio', { name: answer }).check();
  await page.getByRole('button', { name: 'Terminar' }).click();
  await expect(page.getByRole('heading', { name: result })).toBeVisible();
}

test.describe('modo prueba del equipo (celular y escritorio)', () => {
  test('administrador con un libro en borrador: ve el libro como lector, juega, repite el Quiz 1, prueba el borrador, reinicia y nada cambia en lo real', async ({
    page,
    playwright,
    baseURL,
    isMobile,
  }) => {
    // Recorrido largo (libro, quiz, tres partidas y un reinicio): con toda la suite en paralelo no alcanza el margen estándar.
    test.setTimeout(150_000);
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const bookTitle = `Libro en borrador ${stamp}`;
    const slug = `libro-en-borrador-${stamp}`;

    // --- Sesión de administración y datos: un libro en BORRADOR con el Quiz 1 publicado y cambios sin publicar ---
    // Una cuenta de administración PROPIA de esta prueba: «Reiniciar» borra todas las pruebas de la cuenta, y la
    // administradora compartida de las E2E la usan otras pruebas en paralelo (cambiarían el conteo y se borrarían entre sí).
    const owner = await playwright.request.newContext({ baseURL });
    expect(
      (
        await owner.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    const email = `equipo-${stamp}@ejemplo.com`;
    const password = 'Nube-Azul-Cuatro-87';
    const register = await playwright.request.newContext({ baseURL });
    const created = await register.post('/api/auth/register', {
      data: { ...ADULT_CONSENT, name: 'Administradora de prueba', email, password },
    });
    expect(created.status(), await created.text()).toBe(201);
    await register.dispose();
    const found = (await (
      await owner.get(`/api/admin/users?q=${encodeURIComponent(email)}`)
    ).json()) as { users: { id: string }[] };
    const promoted = await owner.patch(`/api/admin/users/${found.users[0]?.id}`, {
      data: { role: 'ADMIN' },
    });
    expect(promoted.status(), await promoted.text()).toBe(200);
    await owner.dispose();
    // El rol viaja en la sesión: se ingresa de nuevo ya como administración.
    expect(
      (await page.request.post('/api/auth/login', { data: { email, password } })).status(),
    ).toBe(200);
    await page.request.post('/api/me/welcome-seen');
    const bookResponse = await page.request.post('/api/admin/books', {
      data: { slug, title: bookTitle, synopsis: '', order: 1, status: 'draft', cover },
    });
    expect(bookResponse.status(), await bookResponse.text()).toBe(201);
    const book = (await bookResponse.json()) as { id: string };
    const quizResponse = await page.request.post('/api/admin/quizzes', {
      data: { bookId: book.id, slug: 'quiz-1', order: 1, title: 'Quiz 1 del equipo' },
    });
    expect(quizResponse.status(), await quizResponse.text()).toBe(201);
    const quiz = (await quizResponse.json()) as { id: string };
    const saveDraft = async (results: { a: string; b: string }) =>
      expect(
        (
          await page.request.put(`/api/admin/quizzes/${quiz.id}/draft`, {
            data: quizDraft(results),
          })
        ).status(),
      ).toBe(200);
    await saveDraft({ a: 'Resultado A', b: 'Resultado B' });
    expect((await page.request.post(`/api/admin/quizzes/${quiz.id}/publish`)).status()).toBe(201);
    // Cambios SIN publicar: solo el borrador tiene este título.
    await saveDraft({ a: 'Resultado A del borrador', b: 'Resultado B del borrador' });

    // --- Lo real, antes de probar nada ---
    const realState = async () => {
      const stats = (await (await page.request.get('/api/admin/stats')).json()) as {
        quizzes: { quizId: string }[];
      };
      const versions = (await (
        await page.request.get(`/api/admin/quizzes/${quiz.id}/versions`)
      ).json()) as { versions: unknown[] };
      const detail = (await (await page.request.get(`/api/admin/quizzes/${quiz.id}`)).json()) as {
        currentVersion: number;
      };
      return {
        // La fila de ESTE quiz en las estadísticas (las globales también las mueven otras pruebas en paralelo).
        quizStats: stats.quizzes.find((item) => item.quizId === quiz.id) ?? null,
        versions: versions.versions.length,
        currentVersion: detail.currentVersion,
      };
    };
    const before = await realState();
    expect(before.versions).toBe(1);

    await autoDismissWelcome(page);

    // --- «Ver el libro como lector» desde la lista de libros ---
    await page.goto('/admin/libros');
    // El buscador solo aparece con más de 8 libros (la base de pruebas acumula los de otras pruebas): se usa si está.
    const search = page.getByLabel('Buscar por título');
    const tryBook = page.getByRole('link', { name: `Ver el libro como lector ${bookTitle}` });
    await expect(search.or(tryBook).first()).toBeVisible();
    if (await search.isVisible()) await search.fill(bookTitle);
    await tryBook.click();
    await expect(page).toHaveURL(new RegExp(`/panel/libros/${slug}$`));
    const banner = page.getByTestId('test-mode-banner');
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toContainText('Modo prueba');
    await expect(banner).toContainText('Este libro aún no está publicado: los lectores no lo ven.');
    await expect(page.getByRole('heading', { level: 1, name: bookTitle })).toBeVisible();

    // --- Jugar el Quiz 1 publicado: sin QR y con el libro sin publicar ---
    await page.getByRole('link', { name: /^Empezar/ }).click();
    await expect(page).toHaveURL(new RegExp(`/panel/quiz/${quiz.id}$`));
    await expect(banner).toContainText('Modo prueba');
    await expect(banner).not.toContainText('Probando el BORRADOR');
    // El Quiz 1 es de una sola vez, y aun así el equipo lo juega…
    await play(page, 'Respuesta A', 'Resultado A');

    // --- …y lo REPITE (para el equipo no hay «una sola vez») ---
    await page.goto(`/panel/libros/${slug}`);
    await expect(page.getByText('Completado')).toBeVisible();
    await page.getByRole('link', { name: 'Repetir' }).click();
    await play(page, 'Respuesta B', 'Resultado B');

    // --- Probar el BORRADOR desde el editor: otra pestaña, con el contenido sin publicar ---
    await page.goto(`/admin/quizzes/${quiz.id}`);
    // En el celular las acciones del editor viven en el menú «Más» (se abre con window.open); en escritorio, un enlace.
    if (isMobile) await page.getByRole('button', { name: 'Más' }).click();
    const draftButton = isMobile
      ? page
          .getByRole('menuitem', { name: 'Probar el borrador' })
          .or(page.getByRole('button', { name: 'Probar el borrador' }))
      : page.getByRole('link', { name: /^Probar el borrador/ }).first();
    const [draftTab] = await Promise.all([
      page.context().waitForEvent('page'),
      draftButton.click(),
    ]);
    await autoDismissWelcome(draftTab);
    await expect(draftTab).toHaveURL(new RegExp(`/panel/quiz/${quiz.id}\\?fuente=borrador$`));
    await expect(draftTab.getByTestId('test-mode-banner')).toContainText(
      'Probando el BORRADOR (no publicado).',
    );
    await play(draftTab, 'Respuesta A', 'Resultado A del borrador');
    await expect(draftTab.getByRole('link', { name: 'Volver al editor del quiz' })).toBeVisible();
    await draftTab.close();

    // Lo probado no cambió nada real: ni versiones, ni la versión vigente, ni las estadísticas de este quiz.
    expect(await realState()).toEqual(before);

    // --- «Reiniciar mi progreso de prueba»: borra solo las tres pruebas de esta cuenta ---
    await page.goto(`/panel/libros/${slug}`);
    await page.getByRole('button', { name: 'Reiniciar mi progreso de prueba' }).click();
    await expect(page.getByText(/Se borrarán tus intentos y partidas de prueba/)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, reiniciar' }).click();
    await expect(page.getByTestId('test-mode-banner')).toContainText(
      /Listo: se borraron 3 intentos de quiz/,
    );
    // El recorrido vuelve a cero: el Quiz 1 ya no está «Completado».
    await expect(page.getByText('Completado')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Empezar/ })).toBeVisible();

    // --- El inicio de administración y las estadísticas siguen igual ---
    expect(await realState()).toEqual(before);
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: /^Buen(os|as) (días|tardes|noches)/ }),
    ).toBeVisible();
    expect(await realState()).toEqual(before);

    // --- Un lector no ve el borrador ni puede probarlo ---
    const reader = await playwright.request.newContext({ baseURL });
    const registered = await reader.post('/api/auth/register', {
      data: {
        ...ADULT_CONSENT,
        name: 'Lector del equipo',
        email: `lector-equipo-${stamp}@ejemplo.com`,
        password: 'Nube-Azul-Cuatro-87',
      },
    });
    expect(registered.status(), await registered.text()).toBe(201);
    const library = (await (await reader.get('/api/me/library')).json()) as {
      books: { book: { id: string } }[];
    };
    expect(library.books.some((entry) => entry.book.id === book.id)).toBe(false);
    expect((await reader.get(`/api/admin/quizzes/${quiz.id}/test-intro`)).status()).toBe(403);
    expect((await reader.post(`/api/admin/quizzes/${quiz.id}/test-attempts`)).status()).toBe(403);
    expect((await reader.delete('/api/me/test-progress')).status()).toBe(403);
    await reader.dispose();
  });
});
