import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { ADULT_CONSENT } from './consent';
import { E2E_ADMIN } from './global-setup';

const run = promisify(execFile);
const ARCHIVE = 'Faro-Lejano-Ocho-2026';
const PASSWORD = 'Nube-Azul-Cuatro-87';
const TSX_CLI = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function fillForm(page: Page, password: string) {
  await page.getByLabel('Tu contraseña', { exact: true }).fill(password);
  await page.getByLabel('Contraseña para el archivo', { exact: true }).fill(ARCHIVE);
  await page.getByLabel('Repite la contraseña para el archivo', { exact: true }).fill(ARCHIVE);
  const saved = page.getByLabel(/Ya guardé la contraseña del archivo/);
  if (!(await saved.isChecked())) await saved.check();
}

// El servidor prepara un respaldo a la vez: corre en un solo proyecto para no chocar con el otro en paralelo.
test.describe('respaldo desde el panel (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'Uno a la vez en el servidor: solo en escritorio.');

  test('la administradora descarga un respaldo cifrado, queda en el historial y restore:db lo abre', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page
      .getByRole('navigation', { name: 'Administración' })
      .getByRole('link', { name: /Respaldo/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/respaldo$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Respaldo' })).toBeVisible();

    // Con la contraseña equivocada no descarga y explica lo de Google.
    await fillForm(page, 'Una-Que-No-Es-1');
    await page.getByRole('button', { name: 'Descargar respaldo' }).click();
    await expect(page.getByText('¿Entras con Google?')).toBeVisible();

    await page.getByLabel('Tu contraseña', { exact: true }).fill(E2E_ADMIN.password);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar respaldo' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(
      /^universo-memorias-respaldo-\d{4}-\d{2}-\d{2}-\d{4}\.tar\.cifrado$/,
    );
    const path = await download.path();
    const bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 6).toString('ascii')).toBe('UMRESP');
    // Lo cifrado no deja ver los correos.
    expect(bytes.includes(Buffer.from(E2E_ADMIN.email))).toBe(false);

    await expect(page.getByText(/Respaldo descargado/)).toBeVisible();
    await expect(page.getByText(/^Último respaldo: hoy/)).toBeVisible();
    const history = page.getByRole('region', { name: 'Últimas descargas' });
    await expect(history.getByText('Completo').first()).toBeVisible();
    await expect(history.getByText(E2E_ADMIN.name).first()).toBeVisible();

    // El desarrollador lo verifica con restore:db y la contraseña del archivo (sin tocar ninguna base).
    // Con `node` directo (sin shell): el script recibe la ruta tal cual y la contraseña por el entorno.
    const { stdout } = await run(
      process.execPath,
      [TSX_CLI, 'apps/api/scripts/restore-db.ts', path, '--clave', '--solo-verificar'],
      { env: { ...process.env, RESPALDO_CLAVE: ARCHIVE } },
    );
    expect(stdout).toContain('✓ Archivo descifrado');
    expect(stdout).toContain('✓ El respaldo está completo');
  });

  test('una editora no ve «Respaldo» en el menú ni puede abrir la pantalla', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const email = `editora-respaldo-${stamp}@ejemplo.com`;
    const anon = await playwright.request.newContext({ baseURL });
    expect(
      (
        await anon.post('/api/auth/register', {
          data: { ...ADULT_CONSENT, name: `Editora Respaldo ${stamp}`, email, password: PASSWORD },
        })
      ).status(),
    ).toBe(201);
    const admin = await playwright.request.newContext({ baseURL });
    expect(
      (
        await admin.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    const found = (await (
      await admin.get(`/api/admin/users?q=${encodeURIComponent(email)}`)
    ).json()) as { users: Array<{ id: string }> };
    const id = found.users[0]?.id;
    expect(id).toBeTruthy();
    expect(
      (await admin.patch(`/api/admin/users/${id}`, { data: { role: 'EDITOR' } })).status(),
    ).toBe(200);

    await loginAs(page, email, PASSWORD);
    await expect(
      page
        .getByRole('navigation', { name: 'Administración' })
        .getByRole('link', { name: /Libros/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Administración' })
        .getByRole('link', { name: /Respaldo/ }),
    ).toHaveCount(0);
    await page.goto('/admin/respaldo');
    await expect(page.getByText('No tienes permiso para ver esta página')).toBeVisible();
    // Y el servidor tampoco la deja.
    const editor = page.context().request;
    expect(
      (
        await editor.post('/api/admin/backups', {
          data: { password: PASSWORD, archivePassword: ARCHIVE, archivePasswordConfirm: ARCHIVE },
        })
      ).status(),
    ).toBe(403);
  });
});
