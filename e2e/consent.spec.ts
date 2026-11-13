import { expect, test, type Page } from '@playwright/test';
import { ADULT_CONSENT, fillConsent } from './consent';

const PASSWORD = 'Nube-Azul-Cuatro-87';
const SORRY = 'Este libro es para personas de 16 años o más. Cuando cumplas 16 te esperamos.';
const thisYear = new Date().getUTCFullYear();

async function fillAccount(page: Page, email: string) {
  await page.goto('/registro');
  await page.getByLabel(/^Nombre/).fill('Lector Edad');
  await page.getByLabel(/^Correo/).fill(email);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
}

test.describe('registro con edad y consentimientos', () => {
  test('una persona adulta se registra con sus dos consentimientos y entra a su panel', async ({
    page,
  }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    await fillAccount(page, `adulta-${stamp}@ejemplo.com`);
    // Sin los consentimientos el formulario avisa y no envía nada.
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Elige el mes y el año de tu nacimiento.')).toBeVisible();
    await expect(page.getByText('Acepta los términos de uso para continuar.')).toBeVisible();
    await expect(page).toHaveURL(/\/registro/);

    await fillConsent(page);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/panel/);
  });

  test('de 16 a 17 años pide la autorización de madre, padre o tutor', async ({ page }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    await fillAccount(page, `joven-${stamp}@ejemplo.com`);
    // Nacida en enero hace 17 años: tiene 16 o 17 según el mes, siempre en la franja de la autorización.
    await page.getByLabel(/^Mes/).selectOption('1');
    await page.getByLabel(/^Año/).selectOption(String(thisYear - 17));
    await expect(page.getByRole('checkbox', { name: /Tengo 18 años o más/ })).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: /madre, padre o tutor autoriza/ }),
    ).toBeVisible();

    await page.getByRole('checkbox', { name: /Acepto los términos de uso/ }).check();
    await page.getByRole('checkbox', { name: /Autorizo el tratamiento de mis datos/ }).check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(
      page.getByText('Marca la autorización de tu madre, padre o tutor para continuar.'),
    ).toBeVisible();

    await page.getByRole('checkbox', { name: /madre, padre o tutor autoriza/ }).check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/panel/);
  });

  test('menor de 16: mensaje amable, ninguna casilla y no se manda nada al servidor', async ({
    page,
  }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const email = `menor-${stamp}@ejemplo.com`;
    const registers: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/register')) registers.push(request.url());
    });
    await fillAccount(page, email);
    await page.getByLabel(/^Mes/).selectOption('5');
    await page.getByLabel(/^Año/).selectOption(String(thisYear - 12));
    await expect(page.getByText(SORRY)).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/registro/);
    expect(registers).toHaveLength(0);
  });

  test('el servidor decide por su cuenta: a una menor la rechaza y no guarda nada', async ({
    request,
  }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const email = `menor-api-${stamp}@ejemplo.com`;
    const res = await request.post('/api/auth/register', {
      data: {
        name: 'Menor Prueba',
        email,
        password: PASSWORD,
        birth: { year: thisYear - 12, month: 5 },
        ageDeclaration: 'adult',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toEqual({ code: 'AGE_RESTRICTED', message: SORRY });
    // La cuenta no existe: ni con esa contraseña se puede entrar.
    const login = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
    expect(login.status()).toBe(401);
  });

  test('la casilla de edad debe coincidir con la fecha, y los dos consentimientos son obligatorios', async ({
    request,
  }) => {
    const stamp = `${Date.now()}-${test.info().project.name}`;
    const body = (change: object) => ({
      name: 'Prueba Datos',
      email: `datos-${stamp}-${Math.random().toString(36).slice(2, 8)}@ejemplo.com`,
      password: PASSWORD,
      ...ADULT_CONSENT,
      ...change,
    });
    const mismatch = await request.post('/api/auth/register', {
      data: body({ ageDeclaration: 'minor_with_guardian' }),
    });
    expect(mismatch.status()).toBe(400);
    const noPrivacy = await request.post('/api/auth/register', {
      data: body({ acceptPrivacy: false }),
    });
    expect(noPrivacy.status()).toBe(400);
    const future = await request.post('/api/auth/register', {
      data: body({ birth: { year: thisYear + 1, month: 1 } }),
    });
    expect(future.status()).toBe(400);
  });
});
