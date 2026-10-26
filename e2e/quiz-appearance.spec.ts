import { createHmac } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { E2E_ADMIN } from './global-setup';
import { seedPublishedQuiz } from './seed';

/** Mismo valor por defecto de desarrollo que usa el API (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';
const E2E_DB = 'mongodb://127.0.0.1:27017/libro-e2e';

/** PNG de 1×1: lo que «devuelve» Cloudinary en las pruebas (no dependen de la red ni de archivos reales). */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const ALT = 'Una niebla espesa sobre la ciudad';

const image = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: ALT,
  deliveryType: 'upload' as const,
});
const appearanceWith = (name: string, extra: object = {}) => ({
  background: { kind: 'image' as const, image: image(name) },
  overlay: { mode: 'manual' as const, strength: 0.85 },
  accent: 'accent' as const,
  introHtml: '<p>Una niebla espesa cubre el laboratorio.</p>',
  ...extra,
});

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

async function loginAdmin(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  expect(response.status()).toBe(200);
}

/** Libro con un quiz publicado, su código QR y una lectora sin desbloquear. */
async function seed(page: Page) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  await loginAdmin(page);
  const { bookId, quizId } = await seedPublishedQuiz(page.request, stamp);
  const code = await (
    await page.request.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quizId } })
  ).json();
  return { stamp, bookId, quizId, token: tokenFor(code.id) };
}

async function newReader(browser: Browser, stamp: number, label: string) {
  const context = await browser.newContext();
  const register = await context.request.post('/api/auth/register', {
    data: {
      name: `Lectora ${label}`,
      email: `lectora-${label}-${stamp}@ejemplo.com`,
      password: PASSWORD,
    },
  });
  expect(register.status(), await register.text()).toBe(201);
  return context;
}

async function unlock(context: BrowserContext, token: string) {
  const redeem = await context.request.post('/api/access/redeem', { data: { token } });
  expect(redeem.status(), await redeem.text()).toBe(200);
}

const putAppearance = (
  api: APIRequestContext,
  quizId: string,
  appearance: object,
  expectedRev: number,
) => api.put(`/api/admin/quizzes/${quizId}/appearance`, { data: { appearance, expectedRev } });

test.describe('apariencia del quiz: editor y lectora', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'El editor es de escritorio; la lectora se prueba aparte en celular.',
  );

  test('la autora edita la apariencia en el panel y la lectora desbloqueada la ve cambiar, quitarse y revertirse', async ({
    page,
    browser,
  }) => {
    // Es un recorrido largo (autora y lectora): se da más margen que el estándar.
    test.setTimeout(120_000);
    const { stamp, quizId, token } = await seed(page);
    await fakeCloudinary(page);

    // 1) Panel: pestaña «Apariencia» con la vista previa a 375 y a 1280 px y el número real del quiz.
    await page.goto(`/admin/quizzes/${quizId}`);
    await page.getByRole('tab', { name: 'Apariencia' }).click();
    await expect(page.getByText('Todo guardado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar apariencia' })).toBeDisabled();
    const preview = page.getByTestId('quiz-preview');
    await expect(preview).toHaveAttribute('data-size', 'movil');
    await expect(preview.getByText('Quiz 1 de 1')).toBeVisible();
    await page.getByRole('button', { name: /Escritorio · 1280 px/ }).click();
    await expect(preview).toHaveAttribute('data-size', 'escritorio');
    await page.getByRole('button', { name: /Celular · 375 px/ }).click();

    // Elegir «Imagen» sin subir nada pide la imagen y no deja guardar (la subida firmada se prueba contra Cloudinary real).
    await page.getByText('Imagen', { exact: true }).click();
    await expect(page.getByText('Sube la imagen de fondo o elige «Sin fondo».')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar apariencia' })).toBeDisabled();
    await page.getByText('Sin fondo', { exact: true }).click();

    // 2) Se guarda un fondo con lo que el servidor acepta (la subida real necesita la cuenta de Cloudinary).
    const saved = await putAppearance(page.request, quizId, appearanceWith('e2e-uno'), 0);
    expect(saved.status(), await saved.text()).toBe(200);

    // No se creó una versión nueva del quiz: sigue la v1 publicada.
    const versions = await (await page.request.get(`/api/admin/quizzes/${quizId}/versions`)).json();
    expect(versions.versions).toHaveLength(1);

    // 3) La lectora sin QR no recibe nada de la apariencia.
    const locked = await newReader(browser, stamp, 'bloqueada');
    const denied = await locked.request.get(`/api/quizzes/${quizId}`);
    expect(denied.status()).toBe(403);
    expect(await denied.text()).not.toMatch(/appearance|e2e-uno|cloudinary|niebla/i);
    await locked.close();

    // 4) La lectora desbloqueada ve el fondo, el velo, el acento y la introducción nuevos.
    const reader = await newReader(browser, stamp, 'desbloqueada');
    await unlock(reader, token);
    await fakeCloudinary(reader);
    const readerPage = await reader.newPage();
    await readerPage.goto(`/panel/quiz/${quizId}`);
    await expect(readerPage.getByText('Una niebla espesa cubre el laboratorio.')).toBeVisible();
    const backdrop = readerPage.locator('.quiz-bg');
    await expect(backdrop).toHaveCount(1);
    await expect(readerPage.getByRole('img', { name: ALT })).toHaveCount(1);
    await expect(backdrop).toHaveAttribute('style', /--quiz-veil: 0\.85/);
    await expect(readerPage.locator('[style*="--quiz-accent: #a89bff"]')).toHaveCount(1);

    // 5) La autora recarga el editor: ve lo guardado, cambia el acento y guarda desde el panel.
    await page.goto(`/admin/quizzes/${quizId}`);
    await expect(
      page.getByText(/La introducción y la portada se editan en la pestaña/),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Apariencia' }).click();
    await expect(page.getByLabel('Texto alternativo (describe la imagen)').first()).toHaveValue(
      ALT,
    );
    await page.getByText('Verde', { exact: true }).click();
    await expect(page.getByText('Cambios sin guardar')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar apariencia' }).click();
    await expect(
      page.getByText(/Ya lo ven las lectoras, sin publicar una versión nueva/),
    ).toBeVisible();
    await expect(page.getByText('Todo guardado')).toBeVisible();
    await readerPage.reload();
    await expect(readerPage.locator('[style*="--quiz-accent: #5fe3ae"]')).toHaveCount(1);

    // 6) Quitar el fondo: la lectora vuelve a ver la página de siempre (sin versión nueva).
    await page.getByText('Sin fondo', { exact: true }).click();
    await page.getByRole('button', { name: 'Guardar apariencia' }).click();
    await expect(page.getByText('Todo guardado')).toBeVisible();
    await readerPage.reload();
    await expect(readerPage.getByRole('heading', { name: 'Quiz con código' })).toBeVisible();
    await expect(readerPage.locator('.quiz-bg')).toHaveCount(0);

    // 7) Revertir con el historial: «Volver a antes» en el cambio más reciente deshace el quitar.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Volver a antes' }).first().click();
    await expect(page.getByText(/Se volvió al estado anterior a ese cambio/)).toBeVisible();
    await readerPage.reload();
    await expect(readerPage.locator('.quiz-bg')).toHaveCount(1);
    await expect(readerPage.getByRole('img', { name: ALT })).toHaveCount(1);

    const after = await (await page.request.get(`/api/admin/quizzes/${quizId}/versions`)).json();
    expect(after.versions).toHaveLength(1);
    await reader.close();
  });

  test('acento libre: la autora escribe un #RRGGBB que no se leería, el panel avisa del ajuste y la lectora ve el color ajustado', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const { stamp, quizId, token } = await seed(page);
    await fakeCloudinary(page);
    expect(
      (await putAppearance(page.request, quizId, appearanceWith('e2e-acento'), 0)).status(),
    ).toBe(200);

    await page.goto(`/admin/quizzes/${quizId}`);
    await page.getByRole('tab', { name: 'Apariencia' }).click();
    const code = page.getByRole('textbox', { name: 'Código del color' });
    await expect(code).toHaveValue('#A89BFF');
    await expect(page.getByText('El color se lee bien sobre el fondo')).toBeVisible();
    await code.fill('#1a3a6e');
    await expect(page.getByText('Ajustamos tu color para que se lea')).toBeVisible();
    await expect(page.getByText('Tu color', { exact: true })).toBeVisible();
    await expect(page.getByText('Se verá así', { exact: true })).toBeVisible();
    // Un código incompleto avisa y no cambia lo guardado.
    await code.fill('#1a3');
    await expect(page.getByText(/Escribe un código de 6 cifras/)).toBeVisible();
    await code.fill('#1a3a6e');
    await page.getByRole('button', { name: 'Guardar apariencia' }).click();
    await expect(page.getByText('Todo guardado')).toBeVisible();

    // Se guardó lo que ella eligió; la lectora ve el color aclarado lo mínimo para leerse.
    const stored = await (await page.request.get(`/api/admin/quizzes/${quizId}/appearance`)).json();
    expect(stored.appearance.accent).toBe('#1a3a6e');
    const reader = await newReader(browser, stamp, 'acento');
    await unlock(reader, token);
    await fakeCloudinary(reader);
    const readerPage = await reader.newPage();
    await readerPage.goto(`/panel/quiz/${quizId}`);
    const style = await readerPage
      .locator('[style*="--quiz-accent"]')
      .first()
      .getAttribute('style');
    const painted = /--quiz-accent:\s*(#[0-9a-f]{6})/.exec(style ?? '')?.[1] ?? '';
    expect(painted).toMatch(/^#[0-9a-f]{6}$/);
    expect(painted).not.toBe('#1a3a6e');
    const brightness = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(brightness(painted)).toBeGreaterThan(brightness('#1a3a6e'));
    await reader.close();
  });

  test('si otra persona guardó antes, el panel avisa y no pisa su cambio (409)', async ({
    page,
  }) => {
    const { quizId } = await seed(page);
    await fakeCloudinary(page);
    expect((await putAppearance(page.request, quizId, appearanceWith('e2e-dos'), 0)).status()).toBe(
      200,
    );
    await page.goto(`/admin/quizzes/${quizId}`);
    await page.getByRole('tab', { name: 'Apariencia' }).click();
    await expect(page.getByText('Todo guardado')).toBeVisible();
    // Mientras la autora tiene el editor abierto, otra persona guarda (revisión 2).
    const other = await putAppearance(
      page.request,
      quizId,
      appearanceWith('e2e-dos', { accent: 'warning' }),
      1,
    );
    expect(other.status(), await other.text()).toBe(200);
    await page.getByText('Verde', { exact: true }).click();
    await page.getByRole('button', { name: 'Guardar apariencia' }).click();
    await expect(
      page.getByText('Otra persona cambió la apariencia mientras editabas'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cargar la versión actual' }).click();
    await expect(page.getByRole('radio', { name: 'Ámbar' })).toBeChecked();
  });
});

test.describe('apariencia del quiz: reglas de la lectora (celular y escritorio)', () => {
  test('sin desbloqueo no hay apariencia: ni en la respuesta ni en la pantalla ni en la red', async ({
    page,
    browser,
  }) => {
    const { stamp, quizId } = await seed(page);
    expect(
      (await putAppearance(page.request, quizId, appearanceWith('e2e-tres'), 0)).status(),
    ).toBe(200);
    const reader = await newReader(browser, stamp, 'sin-qr');
    const hits: string[] = [];
    await fakeCloudinary(reader, hits);
    const response = await reader.request.get(`/api/quizzes/${quizId}`);
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toMatch(/appearance|e2e-tres|niebla/i);

    const readerPage = await reader.newPage();
    await readerPage.goto(`/panel/quiz/${quizId}`);
    await expect(readerPage.getByText('Aún no puedes hacer este quiz')).toBeVisible();
    await expect(readerPage.locator('.quiz-bg')).toHaveCount(0);
    await expect(readerPage.getByRole('img', { name: ALT })).toHaveCount(0);
    expect(hits.filter((url) => url.includes('e2e-tres'))).toHaveLength(0);
    await reader.close();
  });

  test('con movimiento reducido el video de fondo no se descarga: solo se ve el póster', async ({
    page,
    browser,
  }) => {
    const { stamp, quizId, token } = await seed(page);
    // El video de fondo se verifica contra Cloudinary al guardar (no hay cuenta en CI): se deja escrito directo en la base.
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
                background: {
                  kind: 'video',
                  video: {
                    provider: 'cloudinary',
                    publicId: 'libro/quiz-bg/e2e-video',
                    url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/e2e-video.mp4',
                    width: 1280,
                    height: 720,
                    durationSeconds: 8,
                    posterUrl:
                      'https://res.cloudinary.com/demo/video/upload/so_0,f_auto,q_auto/libro/quiz-bg/e2e-video.jpg',
                    alt: 'Humo lento sobre una ciudad',
                  },
                },
                overlay: { mode: 'manual', strength: 0.85 },
              },
            },
          },
        );
    } finally {
      await mongo.close();
    }

    const context = await browser.newContext({ reducedMotion: 'reduce' });
    expect(
      (
        await context.request.post('/api/auth/register', {
          data: {
            name: 'Lectora Reducida',
            email: `lectora-reducida-${stamp}@ejemplo.com`,
            password: PASSWORD,
          },
        })
      ).status(),
    ).toBe(201);
    await unlock(context, token);
    const hits: string[] = [];
    await fakeCloudinary(context, hits);
    const readerPage = await context.newPage();
    await readerPage.goto(`/panel/quiz/${quizId}`);
    await expect(readerPage.getByRole('img', { name: 'Humo lento sobre una ciudad' })).toHaveCount(
      1,
    );
    await expect(readerPage.locator('.quiz-bg img')).toHaveCount(1);
    await expect(readerPage.locator('.quiz-bg video')).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: /video de fondo/i })).toHaveCount(0);
    // Esperar a que la página termine de pedir cosas y comprobar que el .mp4 nunca se pidió.
    await readerPage.waitForLoadState('networkidle');
    expect(hits.filter((url) => /\.mp4/.test(url))).toHaveLength(0);
    expect(hits.some((url) => /so_0.*\.jpg/.test(url))).toBe(true);
    await context.close();
  });
});
