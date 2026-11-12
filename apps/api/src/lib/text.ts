import sanitizeHtml from 'sanitize-html';

/**
 * Texto plano: sin etiquetas ni su contenido peligroso (`<script>`, `<style>`…), con las entidades vueltas a caracteres,
 * sin caracteres de control y en una sola línea. Es lo que se guarda de un texto corto que la autora escribe a mano (por
 * ejemplo el nombre de una sección). Al pintarlo, React lo escapa.
 */
export function plainText(value: string): string {
  const stripped = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
  });
  return (
    stripped
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      // Caracteres de control y de ancho cero: se vuelven espacios (y luego se colapsan).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

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
  const first = normalizeName(name)
    .replace(/^[^a-z0-9]+/, '')
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

/** Escapa un texto para usarlo literal dentro de una expresión regular. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
