import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

/** Mismo valor por defecto de desarrollo que usa el API (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';

test.describe('juego (celular y escritorio)', () => {
  test('QR → partida fallida → reintento → evacuación, con el avance guardado', async ({
    browser,
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

    // Un libro publicado sin quizzes y su juego (historia de ejemplo cargada con el script oficial de seed).
    const slug = `libro-juego-${stamp}`;
    const bookResponse = await admin.post('/api/admin/books', {
      data: {
        slug,
        title: `Libro del juego ${stamp}`,
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
    });
    expect(bookResponse.status(), await bookResponse.text()).toBe(201);
    const book = (await bookResponse.json()) as { id: string };
    const seeded = spawnSync('npm', ['run', 'seed:game', '-w', 'apps/api'], {
      shell: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        MONGODB_URI: 'mongodb://127.0.0.1:27017/libro-e2e',
        BOOK_SLUG: slug,
      },
    });
    expect(seeded.status, `${seeded.stdout}\n${seeded.stderr}`).toBe(0);

    const stories = await (await admin.get(`/api/admin/game-stories?bookId=${book.id}`)).json();
    const storyId = stories.stories[0].id as string;
    const code = await admin.post('/api/admin/access-tokens', {
      data: { kind: 'game', refId: storyId },
    });
    expect(code.status(), await code.text()).toBe(201);
    const token = tokenFor((await code.json()).id as string);

    const context = await browser.newContext(
      playwright.devices[test.info().project.name === 'movil' ? 'Pixel 7' : 'Desktop Chrome'],
    );
    await context.addInitScript((id) => localStorage.setItem('libro_selected_book', id), book.id);
    const page = await context.newPage();

    // 1) Canjea el QR del juego creando su cuenta.
    await page.goto(`/u/${token}`);
    await page.getByRole('main').getByRole('link', { name: 'Crear cuenta' }).click();
    await page.getByLabel(/^Nombre/).fill('Jugadora E2E');
    await page.getByLabel(/^Correo/).fill(`jugadora-${stamp}@ejemplo.com`);
    await page.getByLabel(/^Contraseña/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('¡Desbloqueado!')).toBeVisible();
    // La bienvenida es un ajuste global de la base de pruebas: se espera la respuesta del servidor que dice si toca
    // mostrarla y, solo entonces, se cierra (sin pausas ni errores tragados).
    const welcome = page.waitForResponse(
      (response) =>
        response.url().includes('/api/me/welcome') && response.request().method() === 'GET',
    );
    await page.getByRole('link', { name: 'Ir a mi panel' }).click();
    const { show } = (await (await welcome).json()) as { show: boolean };
    await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();
    if (show) await page.getByRole('button', { name: '¡A la aventura!' }).click();
    await page.getByRole('link', { name: /^Seguir con/ }).click();

    // 2) Mala decisión: final fallido y botón para intentarlo de nuevo.
    await page.getByRole('button', { name: '[PLACEHOLDER] Pasillo izquierdo' }).click();
    await expect(page.getByRole('heading', { name: '[PLACEHOLDER] Derrumbe' })).toBeVisible();
    await page.getByRole('button', { name: 'Intentarlo de nuevo' }).click();

    // 3) Ruta buena hasta la evacuación (todas por los botones de respaldo).
    for (const label of [
      'Pasillo derecho',
      'Subir por las escaleras',
      'Zona de cultivos',
      'Esconderse detrás de los personajes',
      'Seguir la ruta',
    ]) {
      await page.getByRole('button', { name: `[PLACEHOLDER] ${label}` }).click();
    }
    await expect(page.getByRole('heading', { name: '[PLACEHOLDER] Evacuación' })).toBeVisible();

    // 4) El panel refleja el juego completado.
    await page.getByRole('link', { name: 'Volver al panel' }).click();
    await page.getByRole('link', { name: /ir al libro/ }).click();
    await expect(page.getByText('Completado')).toBeVisible();
    await expect(page.getByText('Progreso: 1 de 1')).toBeVisible();
  });
});
