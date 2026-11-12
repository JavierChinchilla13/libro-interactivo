import { createHmac, randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { ADULT_CONSENT } from './consent';
import { E2E_ADMIN } from './global-setup';

const E2E_DB = 'mongodb://127.0.0.1:27017/libro-e2e';
/** El secreto de desarrollo del API para los QR (la E2E no define `ACCESS_TOKEN_SECRET`). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';

/** Todo lo de Cloudinary se responde con un dibujo propio: la prueba no sale a la red y las imágenes «cargan». */
async function fakeCloudinary(target: Page | BrowserContext) {
  await target.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#6b4"/></svg>',
    }),
  );
}

const publicId = () => `libro/cartas/${randomBytes(18).toString('base64url')}`;

async function dismissWelcome(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button')
    .click({ timeout: 2_000 })
    .catch(() => undefined);
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

test.describe('cartas con QR (de punta a punta)', () => {
  test.skip(({ isMobile }) => isMobile, 'Flujo de escritorio.');

  test('la administradora las carga y les pone QR; la lectora solo ve las que abre con su código; revocado o sin código, nada', async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    test.setTimeout(150_000);
    const stamp = Date.now();
    const api = await playwright.request.newContext({ baseURL });
    expect(
      (
        await api.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);

    // Registrar una cuenta inicia su sesión en el contexto que lo pide: las lectoras se registran aparte.
    const registrar = await playwright.request.newContext({ baseURL });

    // Un libro publicado (por API) y dos cartas (directo en la base: las imágenes no se verifican con Cloudinary aquí).
    const bookResponse = await api.post('/api/admin/books', {
      data: {
        slug: `libro-cartas-${stamp}`,
        title: `Libro de cartas ${stamp}`,
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
    const titleA = `Carta del faro ${stamp}`;
    const titleB = `Carta del puerto ${stamp}`;
    const imagesA = [publicId(), publicId(), publicId()];
    const imageB = publicId();
    const client = await MongoClient.connect(E2E_DB);
    let idA: string;
    let idB: string;
    try {
      const admin = await client
        .db()
        .collection('users')
        .findOne({ emailNormalized: E2E_ADMIN.email });
      const make = (title: string, order: number, ids: string[]) => ({
        bookId: new ObjectId(book.id),
        title,
        order,
        status: 'published',
        images: ids.map((id, n) => ({
          publicId: id,
          format: 'jpg',
          width: 1200,
          height: 1800,
          bytes: 900_000,
          ...(n === 1 ? { alt: 'Un mapa antiguo' } : {}),
        })),
        createdBy: admin?._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const inserted = await client
        .db()
        .collection('cards')
        .insertMany([make(titleA, 1, imagesA), make(titleB, 2, [imageB])]);
      idA = String(inserted.insertedIds[0]);
      idB = String(inserted.insertedIds[1]);
    } finally {
      await client.close();
    }

    // 1. La administradora: ve sus cartas, cambia el nombre de la sección y crea el QR de la primera desde «Códigos QR».
    await fakeCloudinary(page);
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto(`/admin/cartas?libro=${book.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Hallazgos' })).toBeVisible();
    const list = page.getByRole('list', { name: 'Elementos de «Hallazgos»' });
    await expect(list.getByRole('article')).toHaveCount(2);
    await expect(list.getByRole('article').first()).toContainText('3 imágenes');

    await page.getByRole('textbox', { name: 'Nombre' }).fill('<b>Reliquias</b>');
    await page.getByRole('button', { name: 'Guardar nombre' }).click();
    await expect(page.getByText('Nombre guardado')).toBeVisible();
    // Se guardó como texto plano y el menú y el título ya usan el nombre nuevo.
    await expect(page.getByRole('heading', { level: 1, name: 'Reliquias' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Reliquias');
    await expect(
      page
        .getByRole('navigation')
        .first()
        .getByRole('link', { name: /Reliquias/ }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/^Reliquias · Administración/);

    await page.goto('/admin/qr');
    await page.getByLabel('Libro', { exact: true }).selectOption(book.id);
    await page.getByRole('combobox', { name: 'Reliquias' }).selectOption(idA);
    await page.getByRole('button', { name: 'Crear código de «Reliquias»' }).click();
    await expect(page.getByText('Código creado')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Códigos del libro' })).toContainText(titleA);

    // El código de la segunda, por API (y se anota su id para revocarlo después).
    const codeB = (await (
      await api.post('/api/admin/access-tokens', { data: { kind: 'card', refId: idB } })
    ).json()) as { id: string };
    const codeA = (await (await api.get(`/api/admin/access-tokens?bookId=${book.id}`)).json()) as {
      tokens: Array<{ id: string; target: { refId: string } }>;
    };
    const tokenA = tokenFor(codeA.tokens.find((token) => token.target.refId === idA)?.id ?? '');
    const tokenB = tokenFor(codeB.id);

    // 2. La lectora A (sin abrir nada): ni la lista ni la API dejan ver una carta, ni cuántas hay.
    const emailA = `lectora-cartas-${stamp}@ejemplo.com`;
    expect(
      (
        await registrar.post('/api/auth/register', {
          data: { ...ADULT_CONSENT, name: `Lectora ${stamp}`, email: emailA, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    const readerContext = await browser.newContext({ baseURL });
    await fakeCloudinary(readerContext);
    const reader = await readerContext.newPage();
    await login(reader, emailA);
    await expect(reader).toHaveURL(/\/panel/);
    await dismissWelcome(reader);
    await reader.goto('/panel/cartas');
    await dismissWelcome(reader);
    await expect(reader.getByRole('heading', { level: 1, name: 'Reliquias' })).toBeVisible();
    await expect(
      reader.getByRole('navigation', { name: 'Panel' }).getByRole('link', { name: 'Reliquias' }),
    ).toBeVisible();
    await expect(reader.getByText(/Todavía no has abierto nada en «Reliquias»/)).toBeVisible();
    await expect(reader.getByText(titleA)).toHaveCount(0);
    const before = await reader.request.get('/api/cards');
    expect(await before.json()).toEqual({ cards: [], testMode: false });
    // Una carta que existe y una que no dan exactamente lo mismo.
    const real = await reader.request.get(`/api/cards/${idA}`);
    const fake = await reader.request.get(`/api/cards/${new ObjectId().toString()}`);
    expect(real.status()).toBe(404);
    expect(await real.json()).toEqual(await fake.json());

    // 3. Escanea el QR de la primera: se abre, se ve en grande como galería y queda en su cuenta.
    await reader.goto(`/u/${tokenA}`);
    await expect(reader.getByText('¡Desbloqueado!')).toBeVisible();
    await reader.getByRole('link', { name: `Ver «${titleA}»` }).click();
    const dialog = reader.getByRole('dialog', { name: titleA });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText(/1 de 3/);
    await dialog.getByRole('button', { name: 'Imagen siguiente' }).click();
    await expect(dialog.getByRole('status')).toHaveText(/2 de 3/);
    await expect(dialog.getByRole('img', { name: 'Un mapa antiguo' })).toBeVisible();
    await reader.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('status')).toHaveText(/3 de 3/);
    await reader.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // En la lista solo está la que abrió (con la portada); de la otra, nada. Las demás imágenes no viajan en la lista.
    const grid = reader.getByRole('list', { name: 'Reliquias' });
    await expect(grid.getByRole('link')).toHaveCount(1);
    await expect(grid).toContainText(titleA);
    await expect(grid).toContainText('3 imágenes');
    await expect(reader.getByText(titleB)).toHaveCount(0);
    const listText = await (await reader.request.get('/api/cards')).text();
    expect(listText).toContain(imagesA[0]);
    expect(listText).not.toContain(imagesA[1]);
    expect(listText).not.toContain(imageB);
    expect(listText).not.toContain(titleB);
    expect((await reader.request.get(`/api/cards/${idB}`)).status()).toBe(404);

    // 4. Una visita SIN sesión que escanea el otro QR: no ve el título; ingresa y vuelve a la carta.
    const emailB = `lectora-cartas-b-${stamp}@ejemplo.com`;
    expect(
      (
        await registrar.post('/api/auth/register', {
          data: { ...ADULT_CONSENT, name: `Otra ${stamp}`, email: emailB, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    const anonContext = await browser.newContext({ baseURL });
    await fakeCloudinary(anonContext);
    const anon = await anonContext.newPage();
    await anon.goto(`/u/${tokenB}`);
    await expect(anon.getByText(`Libro de cartas ${stamp}`)).toBeVisible();
    await expect(anon.getByText(/Algo nuevo para «(Hallazgos|Reliquias)»/)).toBeVisible();
    await expect(anon.getByText(titleB)).toHaveCount(0);
    await anon.getByRole('main').getByRole('link', { name: 'Ingresar' }).click();
    await anon.getByLabel('Correo').fill(emailB);
    await anon.getByLabel('Contraseña').fill(PASSWORD);
    await anon.getByRole('button', { name: 'Ingresar' }).click();
    await expect(anon.getByText('¡Desbloqueado!')).toBeVisible();
    await anon.getByRole('link', { name: `Ver «${titleB}»` }).click();
    await expect(anon.getByRole('dialog', { name: titleB })).toBeVisible();
    // Una sola imagen: sin flechas ni contador.
    await expect(anon.getByRole('button', { name: 'Imagen siguiente' })).toHaveCount(0);

    // 5. Con el QR revocado, quien no lo había usado recibe el mensaje genérico; quien ya lo usó conserva su carta.
    expect(
      (await api.post(`/api/admin/access-tokens/${codeB.id}/revoke`, { data: {} })).status(),
    ).toBe(200);
    const emailC = `lectora-cartas-c-${stamp}@ejemplo.com`;
    expect(
      (
        await registrar.post('/api/auth/register', {
          data: { ...ADULT_CONSENT, name: `Tercera ${stamp}`, email: emailC, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    const lateContext = await browser.newContext({ baseURL });
    const late = await lateContext.newPage();
    await login(late, emailC);
    await expect(late).toHaveURL(/\/panel/);
    await late.goto(`/u/${tokenB}`);
    await expect(late.getByText(/Este código no es válido/)).toBeVisible();
    await late.goto('/panel/cartas');
    await dismissWelcome(late);
    await expect(late.getByText(/Todavía no has abierto nada/)).toBeVisible();
    await anon.goto('/panel/cartas');
    await expect(anon.getByRole('list', { name: 'Reliquias' }).getByRole('link')).toHaveCount(1);

    await Promise.all([readerContext.close(), anonContext.close(), lateContext.close()]);
  });
});
