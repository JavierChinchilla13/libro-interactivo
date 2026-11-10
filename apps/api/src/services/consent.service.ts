import {
  AGE_RESTRICTED_MESSAGE,
  LEGAL_VERSION,
  NEWSLETTER_MINOR_MESSAGE,
  ageBand,
  checkBirth,
  expectedDeclaration,
  type Consent,
} from '@libro/shared';
import { AppError } from '../lib/errors.js';
import type { AgeGate } from './ageGate.service.js';

/** Lo único que se guarda de la edad y el consentimiento (ver el modelo `User`). */
export interface StoredConsent {
  birthYear: number;
  birthMonth: number;
  guardianAuthorized: boolean;
  termsAcceptedAt: Date;
  privacyConsentAt: Date;
  termsVersion: string;
}

/**
 * Decide si una persona puede crear cuenta según lo que declaró. **No escribe nada**: se llama antes de crear la
 * cuenta, de enviar correos o de hacer trabajo caro (cifrar la contraseña). Quien no alcanza la edad recibe un único
 * mensaje amable y, de ella, no queda ningún dato.
 *
 * 1. Si su red ya agotó los rechazos por edad, se responde igual que a una menor (también a una fecha válida).
 * 2. Una fecha imposible (futura, mes fuera de rango, más de 120 años) es un error de datos.
 * 3. Menor de 16: se anota el rechazo (solo el contador de la red) y se responde con el mensaje único.
 * 4. La casilla marcada debe coincidir con la edad calculada (adulta o de 16 a 17 con autorización).
 */
export function evaluateConsent(
  consent: Consent,
  context: { now: Date; gate: AgeGate; ip: string | undefined },
): StoredConsent {
  const { now, gate, ip } = context;
  if (gate.isClosed(ip)) throw new AppError('AGE_RESTRICTED', AGE_RESTRICTED_MESSAGE);

  const check = checkBirth(consent.birth, now);
  if (!check.valid) {
    throw new AppError('VALIDATION', 'La fecha de nacimiento no es válida.');
  }
  const band = ageBand(check.age);
  if (band === 'under') {
    gate.recordRejection(ip);
    throw new AppError('AGE_RESTRICTED', AGE_RESTRICTED_MESSAGE);
  }
  if (consent.ageDeclaration !== expectedDeclaration(band)) {
    throw new AppError('VALIDATION', 'La casilla de edad no coincide con tu fecha de nacimiento.');
  }
  // Los correos de novedades son solo para mayores de 18: se rechaza antes de crear nada.
  if (consent.newsletter === true && band !== 'adult') {
    throw new AppError('VALIDATION', NEWSLETTER_MINOR_MESSAGE);
  }
  return {
    birthYear: consent.birth.year,
    birthMonth: consent.birth.month,
    guardianAuthorized: band === 'minor',
    termsAcceptedAt: now,
    privacyConsentAt: now,
    termsVersion: LEGAL_VERSION,
  };
}
