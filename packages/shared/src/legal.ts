/**
 * Versión de los textos legales (privacidad, términos y cookies). Cambia cada vez que los textos cambian de fondo: es
 * lo que se guarda junto a la aceptación de una persona (`termsVersion`) y lo que se muestra al pie de cada página legal.
 * Subirla no pide de nuevo la aceptación a quien ya tiene cuenta (decisión D10, aparte).
 */
export const LEGAL_VERSION = '2026-11-2';

/** Desde cuándo rigen los textos de `LEGAL_VERSION` (AAAA-MM-DD). Se muestra en cada página legal. */
export const LEGAL_EFFECTIVE_DATE = '2026-11-09';

/** Edad mínima para tener una cuenta. Es una declaración de la persona: el sitio no verifica la edad. */
export const MIN_ACCOUNT_AGE = 16;

/** Desde esta edad no hace falta la autorización de madre, padre o tutor. */
export const ADULT_AGE = 18;

/** Correo público de contacto que citan los textos legales. */
export const LEGAL_CONTACT_EMAIL = 'contacto@universomemorias.com';
