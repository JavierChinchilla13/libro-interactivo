/** `true` si es el error de clave duplicada de MongoDB (índice único). */
export function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

/** Campos del índice único que chocaron (p. ej. `['slug']`), para dar un mensaje preciso. */
export function duplicateKeyFields(error: unknown): string[] {
  const pattern = (error as { keyPattern?: Record<string, unknown> } | null)?.keyPattern;
  return pattern ? Object.keys(pattern) : [];
}
