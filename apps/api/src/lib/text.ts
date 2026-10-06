/** Texto sin acentos y en minúsculas: sirve para buscar y ordenar sin distinguir acentos ni mayúsculas. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Inicial para el filtro por letra: `A`–`Z`, o `#` si no empieza por una letra (números, símbolos). */
export function letterOf(name: string): string {
  const first = normalizeName(name).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

/** Escapa un texto para usarlo literal dentro de una expresión regular. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
