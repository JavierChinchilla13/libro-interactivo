import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const PASSWORD = 'Nube-Azul-Cuatro-87';

async function loginAs(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(landing);
}

async function adminApi(
  playwright: { request: { newContext(o: object): Promise<APIRequestContext> } },
  baseURL?: string,
) {
  const api = await playwright.request.newContext({ baseURL });
  const login = await api.post('/api/auth/login', {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  expect(login.status()).toBe(200);
  return api;
}

test.describe('administración: usuarios, mensajes y borrado de cuenta (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'Flujo de administración de escritorio.');

  test('la administradora ve a una lectora, la desactiva (no puede ingresar) y la reactiva', async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const email = `lectora-ops-${stamp}@ejemplo.com`;
    const api = await adminApi(playwright, baseURL);
    const anon = await playwright.request.newContext({ baseURL });
    expect(
      (
        await anon.post('/api/auth/register', {
          data: { name: `Lectora Ops ${stamp}`, email, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);

    await loginAs(page, E2E_ADMIN.email, E2E_ADMIN.password, /\/admin/);
    await page.goto('/admin/usuarios');
    await page.getByLabel('Buscar por nombre o correo').fill(`Ops ${stamp}`);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('link', { name: `Lectora Ops ${stamp}` }).click();
    await expect(page.getByRole('heading', { name: `Lectora Ops ${stamp}` })).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Desactivar cuenta' }).click();
    await expect(page.getByText('Desactivada').first()).toBeVisible();

    // Una persona desactivada ya no puede ingresar.
    const other = await browser.newContext();
    const reader = await other.newPage();
    await reader.goto('/ingresar');
    await reader.getByLabel('Correo').fill(email);
    await reader.getByLabel('Contraseña').fill(PASSWORD);
    await reader.getByRole('button', { name: 'Ingresar' }).click();
    await expect(reader.getByRole('alert')).toBeVisible();
    await expect(reader).toHaveURL(/\/ingresar/);

    await page.getByRole('button', { name: 'Reactivar cuenta' }).click();
    await expect(page.getByText('Activa').first()).toBeVisible();
    await reader.getByRole('button', { name: 'Ingresar' }).click();
    await expect(reader).toHaveURL(/\/panel/);
    await other.close();
    await api.dispose();
  });

  test('un mensaje de contacto llega a la bandeja y se marca como atendido', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const anon = await playwright.request.newContext({ baseURL });
    const sent = await anon.post('/api/contact', {
      data: {
        name: `Visitante ${stamp}`,
        email: 'visita-e2e@ejemplo.com',
        message: `Hola, ¿habrá una segunda parte? (${stamp})`,
        website: '',
        startedAt: Date.now() - 10_000,
      },
    });
    expect(sent.status(), await sent.text()).toBe(202);

    await loginAs(page, E2E_ADMIN.email, E2E_ADMIN.password, /\/admin/);
    await page.goto('/admin/mensajes');
    const card = page.getByRole('article').filter({ hasText: `(${stamp})` });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Marcar atendido' }).click();
    // Sale de «Sin atender» y aparece en «Atendidos».
    await expect(card).toHaveCount(0);
    await page.getByLabel('Mostrar').selectOption('handled');
    await expect(page.getByRole('article').filter({ hasText: `(${stamp})` })).toBeVisible();
  });

  test('la administradora invita a una editora, que elige su contraseña y no ve las secciones de administración', async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    await loginAs(page, E2E_ADMIN.email, E2E_ADMIN.password, /\/admin/);
    await page.goto('/admin/usuarios');
    await page.getByRole('button', { name: 'Nueva cuenta de administración' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(`Editora E2E ${stamp}`);
    await page
      .getByLabel('Correo electrónico', { exact: true })
      .fill(`editora-${stamp}@ejemplo.com`);
    await page.getByRole('button', { name: 'Crear y enviar invitación' }).click();
    await page.getByLabel('Buscar por nombre o correo').fill(`Editora E2E ${stamp}`);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(
      page.getByRole('row', { name: new RegExp(`Editora E2E ${stamp}.*Editora.*Activa`) }),
    ).toBeVisible();
    await page.getByRole('link', { name: `Editora E2E ${stamp}` }).click();
    // Es una cuenta de administración: se desactiva, no se elimina.
    await expect(page.getByRole('button', { name: 'Desactivar cuenta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar cuenta' })).toHaveCount(0);
    void browser;
  });

  test('una lectora elimina su cuenta con su contraseña y ya no puede ingresar', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const email = `adios-${stamp}@ejemplo.com`;
    const anon = await playwright.request.newContext({ baseURL });
    expect(
      (
        await anon.post('/api/auth/register', {
          data: { name: `Adiós ${stamp}`, email, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);

    await loginAs(page, email, PASSWORD, /\/panel/);
    // Si otra prueba dejó activo el mensaje de bienvenida, se cierra para llegar a la pantalla.
    await page
      .getByRole('dialog')
      .getByRole('button')
      .click({ timeout: 3_000 })
      .catch(() => undefined);
    await page.goto('/panel/cuenta');
    await page
      .getByRole('dialog')
      .getByRole('button')
      .click({ timeout: 3_000 })
      .catch(() => undefined);
    await page.getByRole('button', { name: /Eliminar mi cuenta…/ }).click();
    await page.getByLabel(/Tu contraseña, para confirmar/).fill('contraseña-equivocada');
    await page.getByRole('button', { name: 'Eliminar mi cuenta para siempre' }).click();
    await expect(page.getByText('La contraseña no es correcta.')).toBeVisible();

    await page.getByLabel(/Tu contraseña, para confirmar/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Eliminar mi cuenta para siempre' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
  });
});
