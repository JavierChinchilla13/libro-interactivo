import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

/** Mismo valor por defecto de desarrollo que usa el API (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';
const PINNED = 'Ninguna de las anteriores';

/** Quiz de una etapa con respuestas barajadas y «Ninguna de las anteriores» fija al final. */
async function seedShuffledQuiz(api: APIRequestContext, stamp: number) {
  const created = async (
    response: Awaited<ReturnType<APIRequestContext['post']>>,
    status = 201,
  ) => {
    expect(response.status(), await response.text()).toBe(status);
    return (await response.json()) as { id: string };
  };
  const book = await created(
    await api.post('/api/admin/books', {
      data: {
        slug: `libro-baraja-${stamp}`,
        title: `Libro baraja ${stamp}`,
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
  const quiz = await created(
    await api.post('/api/admin/quizzes', {
      data: { bookId: book.id, slug: 'quiz-baraja', order: 1, title: `Quiz que baraja ${stamp}` },
    }),
  );
  const answers = (q: string) => [
    { id: `${q}a`, text: 'Respuesta A', resultKey: 'r1' },
    { id: `${q}b`, text: 'Respuesta B', resultKey: 'r2' },
    { id: `${q}c`, text: 'Respuesta C', resultKey: 'r3' },
    { id: `${q}n`, text: PINNED, resultKey: 'r3', pinLast: true },
  ];
  const put = await api.put(`/api/admin/quizzes/${quiz.id}/draft`, {
    data: {
      title: `Quiz que baraja ${stamp}`,
      instructionsHtml: '',
      settings: { allowRetake: true, showBreakdown: false },
      stages: [
        {
          id: 'etapa-1',
          order: 1,
          shuffleQuestions: true,
          shuffleAnswers: true,
          producesFinal: true,
          questions: [
            { id: 'p1', text: '¿Primera?', answers: answers('p1') },
            { id: 'p2', text: '¿Segunda?', answers: answers('p2') },
          ],
        },
      ],
      results: [
        { key: 'r1', stageId: 'etapa-1', title: 'Resultado A' },
        { key: 'r2', stageId: 'etapa-1', title: 'Resultado B' },
        { key: 'r3', stageId: 'etapa-1', title: 'Resultado C' },
      ],
    },
  });
  expect(put.status(), await put.text()).toBe(200);
  await created(await api.post(`/api/admin/quizzes/${quiz.id}/publish`));
  const code = await created(
    await api.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quiz.id } }),
  );
  return { quizId: quiz.id, token: tokenFor(code.id), title: `Quiz que baraja ${stamp}` };
}

async function loginAdmin(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  expect(response.status()).toBe(200);
}

type Stage = {
  stageId: string;
  questions: { id: string; text: string; answers: { id: string; text: string }[] }[];
};

test.describe('barajado de respuestas', () => {
  test('la lectora ve las respuestas barajadas, la fija queda al final, el orden sobrevive a recargar y el resultado es el correcto', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    await loginAdmin(page);
    const seeded = await seedShuffledQuiz(page.request, stamp);

    const reader = await browser.newContext();
    expect(
      (
        await reader.request.post('/api/auth/register', {
          data: {
            name: 'Lectora Baraja',
            email: `lectora-baraja-${stamp}@ejemplo.com`,
            password: PASSWORD,
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (await reader.request.post('/api/access/redeem', { data: { token: seeded.token } })).status(),
    ).toBe(200);

    // El mensaje de bienvenida (si la autora lo dejó activo en la base de pruebas) tapa la pantalla: ya está leído.
    await reader.request.post('/api/me/welcome-seen');

    // 1) Varios intentos por API: «Ninguna…» siempre al final y el orden cambia de un intento a otro.
    const orders = new Set<string>();
    for (let round = 0; round < 6; round += 1) {
      const attempt = await (
        await reader.request.post(`/api/quizzes/${seeded.quizId}/attempts`)
      ).json();
      const stage = attempt.stage as Stage;
      for (const question of stage.questions) {
        expect(question.answers.at(-1)?.text).toBe(PINNED);
      }
      orders.add(JSON.stringify(stage.questions.map((q) => q.answers.map((a) => a.text))));
      // Se termina respondiendo siempre «Respuesta B»: el resultado no depende de la posición.
      const done = await reader.request.post(
        `/api/attempts/${attempt.attemptId}/stages/${stage.stageId}/answers`,
        {
          data: {
            answers: stage.questions.map((q) => ({
              questionId: q.id,
              answerId: q.answers.find((a) => a.text === 'Respuesta B')!.id,
            })),
          },
        },
      );
      expect((await done.json()).result.title).toBe('Resultado B');
    }
    expect(orders.size).toBeGreaterThan(1);

    // 2) En pantalla: el orden que se ve se mantiene al recargar a media etapa.
    const readerPage = await reader.newPage();
    await readerPage.goto(`/panel/quiz/${seeded.quizId}`);
    await readerPage.getByRole('button', { name: /Comenzar|Repetir/ }).click();
    const visibleOrder = async () =>
      readerPage
        .getByRole('radio')
        .evaluateAll((radios) =>
          radios.map((radio) => radio.closest('label')?.textContent?.trim() ?? ''),
        );
    await expect(readerPage.getByRole('radio')).toHaveCount(4);
    const before = await visibleOrder();
    expect(before.at(-1)).toBe(PINNED);
    await readerPage.reload();
    await readerPage.getByRole('button', { name: /Continuar/ }).click();
    await expect(readerPage.getByRole('radio')).toHaveCount(4);
    expect(await visibleOrder()).toEqual(before);

    // 3) Y se puede terminar: elegir por texto da el resultado esperado.
    for (let question = 0; question < 2; question += 1) {
      await readerPage.getByRole('radio', { name: 'Respuesta C' }).check();
      await readerPage.getByRole('button', { name: /Siguiente|Terminar/ }).click();
    }
    await expect(readerPage.getByRole('heading', { name: 'Resultado C' })).toBeVisible();
    await reader.close();
  });

  test('en el panel de la autora el interruptor de respuestas va junto al de preguntas y la respuesta fija se ve marcada', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'El editor es de escritorio.');
    const { quizId } = await (async () => {
      await loginAdmin(page);
      return seedShuffledQuiz(page.request, Date.now() + 1);
    })();
    await page.goto(`/admin/quizzes/${quizId}`);
    await page.getByRole('tab', { name: 'Etapas y preguntas' }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Barajar las preguntas de esta etapa' }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: /^Barajar las respuestas de cada pregunta/ }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: /^Dejar la respuesta 4 al final/ }).first(),
    ).toBeChecked();
    // Apagar el barajado esconde «Dejar al final» y exige guardar (y publicar para que rija).
    await page
      .getByRole('checkbox', { name: /^Barajar las respuestas de cada pregunta/ })
      .uncheck();
    await expect(page.getByRole('checkbox', { name: /al final/ })).toHaveCount(0);
    await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  });
});
