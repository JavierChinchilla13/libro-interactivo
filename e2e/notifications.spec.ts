import { expect, test, type Page } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { createUnsubscribeToken } from '../apps/api/src/lib/unsubscribeToken';
import { ADULT_CONSENT } from './consent';
import { E2E_ADMIN } from './global-setup';

const E2E_DB = 'mongodb://127.0.0.1:27017/libro-e2e';
/** El secreto de desarrollo y pruebas del API (la E2E no define `UNSUBSCRIBE_SECRET`). */
const UNSUB_SECRET = 'solo-para-desarrollo-enlaces-de-baja-no-usar-en-produccion-5432';
const PASSWORD = 'Nube-Azul-Cuatro-87';
const LABEL = 'Quiero recibir correos con novedades de la autora';

async function login(page: Page, email: string, password: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

async function dismissWelcome(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button')
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function withDb<T>(work: (db: ReturnType<MongoClient['db']>) => Promise<T>): Promise<T> {
  const client = await MongoClient.connect(E2E_DB);
  try {
    return await work(client.db());
  } finally {
    await client.close();
  }
}

/** El aviso de una actualización (por su título) cuando ya terminó de enviarse. */
async function finishedJob(title: string) {
  let job: { _id: ObjectId; status: string } | null = null;
  await expect
    .poll(
      async () => {
        job = await withDb((db) =>
          db
            .collection<{ _id: ObjectId; status: string }>('notificationJobs')
            .findOne({ 'content.title': title }),
        );
        return job?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('done');
  return job as unknown as { _id: ObjectId; status: string };
}

const deliveryOf = (jobId: ObjectId, userId: string) =>
  withDb((db) =>
    db.collection('notificationDeliveries').findOne({ jobId, userId: new ObjectId(userId) }),
  );

test.describe('avisos por correo de punta a punta', () => {
  test.skip(({ isMobile }) => isMobile, 'Flujo de administración de escritorio.');

  test('se apunta → la autora publica con aviso → le llega → se da de baja con el enlace → el siguiente aviso ya no le llega', async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const email = `aviso-${stamp}@ejemplo.com`;

    // 1. Un lector con el correo comprobado se apunta desde su cuenta.
    const api = await playwright.request.newContext({ baseURL });
    expect(
      (
        await api.post('/api/auth/register', {
          data: { ...ADULT_CONSENT, name: `Avisada ${stamp}`, email, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    const userId = await withDb(async (db) => {
      const user = await db
        .collection('users')
        .findOneAndUpdate(
          { emailNormalized: email },
          { $set: { emailVerifiedAt: new Date() } },
          { returnDocument: 'after' },
        );
      return String((user?._id as ObjectId | undefined) ?? '');
    });
    expect(userId).toMatch(/^[0-9a-f]{24}$/);
    await login(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/panel/);
    await dismissWelcome(page);
    await page.goto('/panel/cuenta');
    await dismissWelcome(page);
    const section = page.getByRole('region', { name: 'Correos de novedades' });
    await section.getByRole('checkbox', { name: LABEL }).click();
    await expect(section.getByText(/Te apuntaste el/)).toBeVisible();

    // 2. La autora publica una actualización marcando «Avisar por correo».
    const authorContext = await browser.newContext({ baseURL });
    const author = await authorContext.newPage();
    await login(author, E2E_ADMIN.email, E2E_ADMIN.password);
    await expect(
      author.getByRole('heading', { name: /^Buen(os|as) (días|tardes|noches)/ }),
    ).toBeVisible();
    const title = `Novedad E2E ${stamp}`;
    await author.goto('/admin/actualizaciones/nueva?plantilla=text');
    await author.getByRole('textbox', { name: /^Título/ }).fill(title);
    await author
      .getByRole('textbox', { name: 'Texto', exact: true })
      .fill('Hay novedades del libro.');
    const notify = author.getByRole('checkbox', {
      name: 'Avisar por correo a los lectores apuntados a las novedades',
    });
    await expect(author.getByText(/Lo recibirían/)).toBeVisible();
    await notify.click();
    await expect(notify).toBeChecked();
    await author.getByRole('button', { name: 'Publicar' }).click();
    await expect(author.getByText(/Guardado\. Aviso por correo en cola para \d+/)).toBeVisible();
    // Ya avisada: en vez de la casilla, cómo va (cada publicación se avisa una sola vez).
    await expect(author.getByText(/Ya se avisó por correo/)).toBeVisible();
    await expect(notify).toHaveCount(0);

    // 3. Le llega: su envío figura como enviado, y la pantalla de avisos lo muestra terminado.
    const first = await finishedJob(title);
    expect((await deliveryOf(first._id, userId))?.['status']).toBe('sent');
    await author.goto('/admin/avisos');
    const row = author.getByRole('row', { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Terminado')).toBeVisible();
    await expect(row.getByText(/\d+ de \d+ enviados/)).toBeVisible();

    // 4. Se da de baja con el enlace del correo, sin sesión.
    const anon = await browser.newContext({ baseURL });
    const link = await anon.newPage();
    await link.goto(`/baja?t=${createUnsubscribeToken(userId, UNSUB_SECRET)}`);
    await expect(link.getByRole('heading', { name: 'Te diste de baja' })).toBeVisible();
    await anon.close();

    // 5. El siguiente aviso ya no le llega (ni siquiera entra en la lista).
    const authorApi = authorContext.request;
    const second = `Otra novedad E2E ${stamp}`;
    const created = await authorApi.post('/api/admin/posts', {
      data: {
        slug: `otra-novedad-${stamp}`,
        title: second,
        template: 'text',
        status: 'published',
        data: { bodyHtml: '<p>Más novedades.</p>' },
      },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(
      (
        await authorApi.post('/api/admin/notifications', { data: { kind: 'post', refId: id } })
      ).status(),
    ).toBe(201);
    const next = await finishedJob(second);
    expect(await deliveryOf(next._id, userId)).toBeNull();
    await authorContext.close();
  });
});
