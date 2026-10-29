import type { Page } from '@playwright/test';

/** Edad y consentimientos de una persona adulta para los registros por API de las pruebas (nacida en 1990). */
export const ADULT_CONSENT = {
  birth: { year: 1990, month: 6 },
  ageDeclaration: 'adult',
  acceptTerms: true,
  acceptPrivacy: true,
} as const;

/**
 * Llena la edad y marca los consentimientos del formulario de registro (`/registro`). Por defecto, una persona adulta.
 * `guardian` es para quien tiene de 16 a 17 años: marca la autorización de madre, padre o tutor.
 */
export async function fillConsent(
  page: Page,
  {
    month = '6',
    year = '1990',
    guardian = false,
  }: { month?: string; year?: string; guardian?: boolean } = {},
): Promise<void> {
  await page.getByLabel(/^Mes/).selectOption(month);
  await page.getByLabel(/^Año/).selectOption(year);
  await page
    .getByRole('checkbox', {
      name: guardian ? /madre, padre o tutor autoriza/ : /Tengo 18 años o más/,
    })
    .check();
  await page.getByRole('checkbox', { name: /Acepto los términos de uso/ }).check();
  await page.getByRole('checkbox', { name: /Autorizo el tratamiento de mis datos/ }).check();
}
