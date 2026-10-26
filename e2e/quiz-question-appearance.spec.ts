import { createHmac } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { E2E_ADMIN } from './global-setup';
import { seedPublishedQuiz } from './seed';

const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';
const E2E_DB = 'mongodb://127.0.0.1:27017/libro-e2e';
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const image = (name: string, alt: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt,
  deliveryType: 'upload' as const,
});
const general = {
  background: { kind: 'image' as const, image: image('e2e-general', 'Fondo general de la ciudad') },
  overlay: { mode: 'manual' as const, strength: 0.85 },
  accent: '#a89bff',
  introHtml: '<p>Una niebla espesa cubre el laboratorio.</p>',
};

/** Todo lo de Cloudinary se responde con un píxel: la prueba no sale a la red y el fondo «carga». */
async function fakeCloudinary(target: Page | BrowserContext, hits: string[] = []) {
  await target.route('https://res.cloudinary.com/**', (route) => {
    hits.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: PIXEL,
    });
  });
}

/** Libro con un quiz de 3 preguntas (en orden fijo), su QR y la sesión de la autora en `page`. */
async function seed(page: Page) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const login = await page.request.post('/api/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  expect(login.status()).toBe(200);
  const { quizId } = await seedPublishedQuiz(page.request, stamp, { questions: 3 });
  const code = await (
    await page.request.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quizId } })
  ).json();
  return { stamp, quizId, token: tokenFor(code.id) };
}

async function unlockedReader(
  browser: Browser,
  stamp: number,
  token: string,
  label: string,
  options: { reducedMotion?: 'reduce' } = {},
) {
  const context = await browser.newContext(options);
  const register = await context.request.post('/api/auth/register', {
    data: {
      name: `Lectora ${label}`,
      email: `lectora-${label}-${stamp}@ejemplo.com`,
      password: PASSWORD,
    },
  });
  expect(register.status(), await register.text()).toBe(201);
  // El mensaje de bienvenida global taparía la pantalla del quiz.
  await context.request.post('/api/me/welcome-seen');
  const redeem = await context.request.post('/api/access/redeem', { data: { token } });
  expect(redeem.status(), await redeem.text()).toBe(200);
  return context;
}

const nextQuestion = async (page: Page) => {
  await page.getByRole('radio').first().check({ force: true });
  await page.getByRole('button', { name: /Siguiente/ }).click();
};

test.describe('apariencia por pregunta', () => {
  test('la autora personaliza la pregunta 2 en el panel y la lectora la ve ahí y en ninguna otra', async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, 'El editor es de escritorio.');
    test.setTimeout(120_000);
    const { stamp, quizId, token } = await seed(page);
    await fakeCloudinary(page);
    // El fondo de la pregunta 2 se escribe por la API (subir archivos necesita la cuenta de Cloudinary).
    const saved = await page.request.put(`/api/admin/quizzes/${quizId}/appearance`, {
      data: {
        expectedRev: 0,
        appearance: {
          ...general,
          questions: {
            p2: {
              background: { kind: 'image', image: image('e2e-p2', 'Fondo de la pregunta dos') },
            },
          },
        },
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);

    // Panel: «Por pregunta» lista las 3 preguntas con su texto; la 2 ya tiene fondo propio.
    await page.goto(`/admin/quizzes/${quizId}`);
    await page.getByRole('tab', { name: 'Apariencia' }).click();
    await expect(page.getByRole('heading', { name: 'Por pregunta' })).toBeVisible();
    await expect(page.getByText('¿Cuál es la 1?')).toBeVisible();
    await expect(page.getByText('¿Cuál es la 3?')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Topes de apariencia por pregunta' }),
    ).toContainText('Preguntas con fondo propio: 1 de 5');
    const row = page.getByText('¿Cuál es la 2?').locator('xpath=ancestor::li[1]');
    await expect(row.getByText('Personalizada')).toBeVisible();
    // Solo el acento: se desmarca «igual que el general» y se escribe un código.
    await row.getByRole('checkbox', { name: 'Acento: igual que el general' }).uncheck();
    await row.getByRole('textbox', { name: 'Código del color' }).fill('#ff8fb1');
    // La vista previa muestra esa pregunta con su acento.
    await page.getByRole('combobox', { name: 'Pantalla' }).selectOption('p2');
    await expect(page.getByTestId('quiz-preview')).toHaveAttribute(
      'style',
      /--quiz-accent: #ff8fb1/,
    );
    await page.getByRole('button', { name: 'Guardar apariencia' }).click();
    await expect(page.getByText('Todo guardado')).toBeVisible();

    const stored = await (await page.request.get(`/api/admin/quizzes/${quizId}/appearance`)).json();
    expect(Object.keys(stored.appearance.questions)).toEqual(['p2']);
    expect(stored.appearance.questions.p2.accent).toBe('#ff8fb1');
    expect(stored.appearance.questions.p2.background.image.alt).toBe('Fondo de la pregunta dos');

    // Lectora: la 1 usa el general; la 2, su fondo y acento; la 3 vuelve al general.
    const reader = await unlockedReader(browser, stamp, token, 'preguntas');
    await fakeCloudinary(reader);
    const view = await reader.newPage();
    await view.goto(`/panel/quiz/${quizId}`);
    await view.getByRole('button', { name: 'Comenzar' }).click();
    await expect(view.getByText('¿Cuál es la 1?')).toBeVisible();
    await expect(view.locator('[style*="--quiz-accent: #a89bff"]')).toHaveCount(1);
    await expect(view.getByRole('img', { name: 'Fondo general de la ciudad' })).toHaveCount(1);
    // El fondo de la pregunta 2 todavía no está en la página (solo se precalienta).
    await expect(view.getByRole('img', { name: 'Fondo de la pregunta dos' })).toHaveCount(0);
    await nextQuestion(view);
    await expect(view.getByText('¿Cuál es la 2?')).toBeVisible();
    await expect(view.getByRole('img', { name: 'Fondo de la pregunta dos' })).toHaveCount(1);
    await expect(view.locator('[style*="--quiz-accent: #ff8fb1"]')).toHaveCount(1);
    await nextQuestion(view);
    await expect(view.getByText('¿Cuál es la 3?')).toBeVisible();
    await expect(view.locator('[style*="--quiz-accent: #a89bff"]')).toHaveCount(1);
    await expect(view.getByRole('img', { name: 'Fondo general de la ciudad' })).toHaveCount(1);
    await expect(view.getByRole('img', { name: 'Fondo de la pregunta dos' })).toHaveCount(0);
    await reader.close();
  });

  test('con movimiento reducido el video de una pregunta no se descarga: solo su póster', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const { stamp, quizId, token } = await seed(page);
    // El video se verifica contra Cloudinary al guardar (no hay cuenta en CI): se escribe directo en la base.
    const mongo = await MongoClient.connect(E2E_DB);
    try {
      await mongo
        .db()
        .collection('quizzes')
        .updateOne(
          { _id: new ObjectId(quizId) },
          {
            $set: {
              appearanceRev: 1,
              appearance: {
                overlay: { mode: 'manual', strength: 0.85 },
                questions: {
                  p2: {
                    background: {
                      kind: 'video',
                      video: {
                        provider: 'cloudinary',
                        publicId: 'libro/quiz-bg/e2e-video-p2',
                        url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/e2e-video-p2.mp4',
                        width: 1280,
                        height: 720,
                        durationSeconds: 8,
                        posterUrl:
                          'https://res.cloudinary.com/demo/video/upload/so_0,f_auto,q_auto/libro/quiz-bg/e2e-video-p2.jpg',
                        alt: 'Humo lento en la pregunta dos',
                      },
                    },
                  },
                },
              },
            },
          },
        );
    } finally {
      await mongo.close();
    }
    const context = await unlockedReader(browser, stamp, token, 'reducida', {
      reducedMotion: 'reduce',
    });
    const hits: string[] = [];
    await fakeCloudinary(context, hits);
    const view = await context.newPage();
    await view.goto(`/panel/quiz/${quizId}`);
    await view.getByRole('button', { name: 'Comenzar' }).click();
    await expect(view.getByText('¿Cuál es la 1?')).toBeVisible();
    await nextQuestion(view);
    await expect(view.getByText('¿Cuál es la 2?')).toBeVisible();
    await expect(view.getByRole('img', { name: 'Humo lento en la pregunta dos' })).toHaveCount(1);
    await expect(view.locator('.quiz-bg video')).toHaveCount(0);
    await expect(view.getByRole('button', { name: /video de fondo/i })).toHaveCount(0);
    await view.waitForLoadState('networkidle');
    expect(hits.filter((url) => /\.mp4/.test(url))).toHaveLength(0);
    expect(hits.some((url) => /so_0.*\.jpg/.test(url))).toBe(true);
    await context.close();
  });
});
