import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

/** Mismo valor por defecto de desarrollo que usa el API (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';

/** Un libro con un campo de poder animado y un quiz de una pregunta cuyo resultado apunta a ese campo. */
async function seedFieldQuiz(api: APIRequestContext, stamp: string) {
  const ok = async (response: Awaited<ReturnType<APIRequestContext['post']>>, status = 201) => {
    expect(response.status(), await response.text()).toBe(status);
    return (await response.json()) as { id: string };
  };
  const book = await ok(
    await api.post('/api/admin/books', {
      data: {
        slug: `libro-campo-${stamp}`,
        title: `Libro del campo ${stamp}`,
        synopsis: '',
        order: 1,
        status: 'published',
        cover: {
          provider: 'cloudinary',
          publicId: 'libro/e2e',
          url: 'https://res.cloudinary.com/demo/image/upload/libro/e2e',
          width: 100,
          height: 100,
          alt: 'Portada',
        },
      },
    }),
  );
  await ok(
    await api.post('/api/admin/wiki', {
      data: {
        bookId: book.id,
        kind: 'power_field',
        slug: 'agitacion',
        name: 'Agitación',
        visualKey: 'rain',
        status: 'published',
      },
    }),
  );
  const quiz = await ok(
    await api.post('/api/admin/quizzes', {
      data: { bookId: book.id, slug: 'quiz-1', order: 1, title: `Quiz del campo ${stamp}` },
    }),
  );
  const answers = [
    { id: 'p1a', text: 'Me quedo', resultKey: 'r1' },
    { id: 'p1b', text: 'Me voy', resultKey: 'r2' },
  ];
  const saved = await api.put(`/api/admin/quizzes/${quiz.id}/draft`, {
    data: {
      title: `Quiz del campo ${stamp}`,
      instructionsHtml: '',
      settings: { allowRetake: true, showBreakdown: false },
      stages: [
        {
          id: 'etapa-1',
          order: 1,
          producesFinal: true,
          questions: [{ id: 'p1', text: '¿Qué haces?', answers }],
        },
      ],
      results: [
        { key: 'r1', stageId: 'etapa-1', title: 'Eres pura agitación', fieldSlug: 'agitacion' },
        { key: 'r2', stageId: 'etapa-1', title: 'Eres pura calma' },
      ],
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  await ok(await api.post(`/api/admin/quizzes/${quiz.id}/publish`));
  const code = await ok(
    await api.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quiz.id } }),
  );
  return {
    bookId: book.id,
    quizTitle: `Quiz del campo ${stamp}`,
    token: tokenFor(code.id),
  };
}

/** Registra a la lectora con el QR del quiz y la deja dentro del quiz, lista para responder. */
async function startQuiz(page: Page, seeded: { token: string; quizTitle: string }, stamp: string) {
  await page.goto(`/u/${seeded.token}`);
  await page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).click();
  await page.getByLabel(/^Nombre/).fill('Lectora del campo');
  await page.getByLabel(/^Correo/).fill(`campo-${stamp}@ejemplo.com`);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('¡Desbloqueado!')).toBeVisible();
  // La bienvenida es un ajuste global de la base de pruebas: se espera a que el servidor diga si toca mostrarla.
  const welcome = page.waitForResponse(
    (response) =>
      response.url().includes('/api/me/welcome') && response.request().method() === 'GET',
  );
  await page.getByRole('link', { name: 'Ir a mi panel' }).click();
  const { show } = (await (await welcome).json()) as { show: boolean };
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();
  if (show) await page.getByRole('button', { name: '¡A la aventura!' }).click();
  await page.getByRole('link', { name: new RegExp(`Empezar\\s*${seeded.quizTitle}`) }).click();
  await page.getByRole('button', { name: 'Comenzar' }).click();
}

test.describe('resultado de quiz con campo de poder (celular y escritorio)', () => {
  for (const reduced of [false, true]) {
    test(`el fondo del campo aparece solo al terminar el quiz${reduced ? ' y con movimiento reducido queda quieto' : ''}`, async ({
      browser,
      playwright,
      baseURL,
    }) => {
      const project = test.info().project.name;
      const stamp = `${Date.now()}-${project}-${reduced ? 'r' : 'm'}`;
      const admin = await playwright.request.newContext({ baseURL });
      expect(
        (
          await admin.post('/api/auth/login', {
            data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
          })
        ).status(),
      ).toBe(200);
      const seeded = await seedFieldQuiz(admin, stamp);

      const context = await browser.newContext({
        ...playwright.devices[project === 'movil' ? 'Pixel 7' : 'Desktop Chrome'],
        reducedMotion: reduced ? 'reduce' : 'no-preference',
      });
      await context.addInitScript(
        (id) => localStorage.setItem('libro_selected_book', id),
        seeded.bookId,
      );
      const page = await context.newPage();
      // Todo lo que el servidor responde mientras el quiz está en curso se guarda para revisarlo.
      const duringQuiz: string[] = [];
      let finished = false;
      page.on('response', (response) => {
        if (finished || !response.url().includes('/api/')) return;
        void response
          .text()
          .then((body) => duringQuiz.push(body))
          .catch(() => undefined);
      });

      try {
        await startQuiz(page, seeded, stamp);
        await expect(page.getByText('Pregunta 1 de 1', { exact: true })).toBeVisible();
        // Mientras se responde no hay ningún escenario animado en pantalla…
        await expect(page.locator('.field-stage')).toHaveCount(0);
        await page.getByRole('radio', { name: 'Me quedo' }).check();
        finished = true;
        // …y el servidor no adelantó el campo (regla: el resultado nunca se anticipa).
        expect(duringQuiz.join('\n')).not.toMatch(/visual|fieldSlug|agitaci[oó]n|rain/i);
        await page.getByRole('button', { name: 'Terminar' }).click();

        // Al terminar, el resultado trae el escenario del campo con el nombre del campo.
        await expect(page.getByRole('heading', { name: 'Eres pura agitación' })).toBeVisible();
        const stage = page.locator('.field-stage');
        await expect(stage).toHaveAttribute('data-key', 'rain');
        await expect(page.getByText('Campo: Agitación')).toBeVisible();
        // El lienzo se descarga y arranca cuando el navegador está libre.
        await expect(stage).toHaveAttribute('data-ready', '', { timeout: 15_000 });

        if (reduced) {
          // Con «reducir movimiento» se pinta un solo cuadro y queda quieto: dos capturas separadas son idénticas.
          const snapshot = () =>
            page.evaluate(
              () => document.querySelector<HTMLCanvasElement>('.field-canvas')?.toDataURL() ?? '',
            );
          const first = await snapshot();
          await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)));
          expect(await snapshot()).toBe(first);
        }
      } finally {
        await context.close();
        await admin.dispose();
      }
    });
  }
});
