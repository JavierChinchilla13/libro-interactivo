import { expect, test, type Page } from '@playwright/test';
import { MongoClient, type ObjectId } from 'mongodb';
import { createUnsubscribeToken } from '../apps/api/src/lib/unsubscribeToken';
import { ADULT_CONSENT, fillConsent } from './consent';

const E2E_DB = 'mongodb://127.0.0.1:27017/libro-e2e';
/** El secreto de desarrollo y pruebas del API (la E2E no define `UNSUBSCRIBE_SECRET`). */
const UNSUB_SECRET = 'solo-para-desarrollo-enlaces-de-baja-no-usar-en-produccion-5432';
const PASSWORD = 'Nube-Azul-Cuatro-87';
const LABEL = 'Quiero recibir correos con novedades de la autora';

async function login(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/panel/);
}

/** Cierra el mensaje de bienvenida si otra prueba lo dejó activo. */
async function dismissWelcome(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button')
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

test.describe('correos de novedades: apuntarse y darse de baja', () => {
  test('al registrarse con la casilla y el correo sin comprobar, queda pendiente de confirmar', async ({
    page,
  }) => {
    const stamp = Date.now();
    await page.goto('/registro');
    await page.getByLabel(/Nombre/).fill(`Novedades ${stamp}`);
    await page.getByLabel(/Correo/).fill(`novedades-${stamp}@ejemplo.com`);
    await page.getByLabel(/^Contraseña/).fill(PASSWORD);
    await fillConsent(page);
    const box = page.getByRole('checkbox', { name: LABEL });
    await expect(box).not.toBeChecked();
    await box.check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/panel/);
    await dismissWelcome(page);
    await page.goto('/panel/cuenta');
    await dismissWelcome(page);
    const section = page.getByRole('region', { name: 'Correos de novedades' });
    await expect(section.getByText('Falta confirmar tu correo')).toBeVisible();
    await expect(section.getByRole('checkbox', { name: LABEL })).toBeChecked();
  });

  test('con el correo comprobado se apunta desde la cuenta y se da de baja con el enlace del correo, sin sesión', async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const email = `apuntada-${stamp}@ejemplo.com`;
    const api = await playwright.request.newContext({ baseURL });
    expect(
      (
        await api.post('/api/auth/register', {
          data: { ...ADULT_CONSENT, name: `Apuntada ${stamp}`, email, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    // Como si hubiera comprobado su correo (Google o recuperación de contraseña): se apunta al instante.
    const client = await MongoClient.connect(E2E_DB);
    let userId: string;
    try {
      const user = await client
        .db()
        .collection('users')
        .findOneAndUpdate(
          { emailNormalized: email },
          { $set: { emailVerifiedAt: new Date() } },
          { returnDocument: 'after' },
        );
      userId = String((user?._id as ObjectId | undefined) ?? '');
    } finally {
      await client.close();
    }
    expect(userId).toMatch(/^[0-9a-f]{24}$/);

    await login(page, email);
    await dismissWelcome(page);
    await page.goto('/panel/cuenta');
    await dismissWelcome(page);
    const section = page.getByRole('region', { name: 'Correos de novedades' });
    const box = section.getByRole('checkbox', { name: LABEL });
    await expect(box).not.toBeChecked();
    // Clic y después el resultado (mientras se guarda la casilla está desactivada).
    await box.click();
    await expect(section.getByText(/Te apuntaste el/)).toBeVisible();
    await expect(box).toBeChecked();

    // El enlace visible del correo, en otro navegador sin sesión: da de baja sola al abrirse.
    const anon = await browser.newContext({ baseURL });
    const link = await anon.newPage();
    await link.goto(`/baja?t=${createUnsubscribeToken(userId, UNSUB_SECRET)}`);
    await expect(link.getByRole('heading', { name: 'Te diste de baja' })).toBeVisible();
    await expect(link.getByText(/¿Fue un error\? Vuelve a apuntarte desde/)).toBeVisible();
    await anon.close();

    // En la cuenta ya figura sin apuntar.
    await page.reload();
    await dismissWelcome(page);
    await expect(
      page
        .getByRole('region', { name: 'Correos de novedades' })
        .getByRole('checkbox', { name: LABEL }),
    ).not.toBeChecked();
  });
});
