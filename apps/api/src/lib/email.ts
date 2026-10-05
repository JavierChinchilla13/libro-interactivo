/** Correo normalizado para el índice único: sin espacios, NFC y en minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLowerCase();
}
