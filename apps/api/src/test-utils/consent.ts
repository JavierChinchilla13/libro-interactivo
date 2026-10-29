import type { Consent } from '@libro/shared';

/** Edad y consentimientos de una persona adulta (nacida en 1990), para los registros de las pruebas. */
export const ADULT_CONSENT: Consent = {
  birth: { year: 1990, month: 6 },
  ageDeclaration: 'adult',
  acceptTerms: true,
  acceptPrivacy: true,
};

/** Un día fijo para las pruebas de edad: 28-oct-2026 (UTC). */
export const NOW = new Date('2026-10-28T12:00:00Z');

/** Consentimiento de quien nació en el año y mes dados, con la casilla que le corresponde. */
export function consentFor(
  year: number,
  month: number,
  ageDeclaration: Consent['ageDeclaration'] = 'adult',
): Consent {
  return { birth: { year, month }, ageDeclaration, acceptTerms: true, acceptPrivacy: true };
}
