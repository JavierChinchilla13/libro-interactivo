import sanitizeHtml from 'sanitize-html';

/**
 * Sanitización de HTML enriquecido (TipTap) con lista blanca. Se aplica SIEMPRE en el servidor al guardar
 * (y de nuevo al publicar); el cliente además lo trata como no confiable al renderizar.
 *
 * Permite: párrafos, encabezados h2–h4, énfasis, listas, citas, saltos, líneas, enlaces http(s)/mailto
 * (siempre con `rel="noopener noreferrer"`) e imágenes alojadas en Cloudinary. Todo lo demás
 * (scripts, estilos, atributos `on*`, iframes, `javascript:`, clases…) se elimina.
 */
const CLOUDINARY_IMAGE = /^https:\/\/res\.cloudinary\.com\//i;

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h2',
    'h3',
    'h4',
    'a',
    'img',
  ],
  allowedAttributes: {
    a: ['href', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs['href'] ? { href: attribs['href'] } : {}),
        rel: 'noopener noreferrer',
      },
    }),
  },
  // Imágenes solo de Cloudinary: cualquier otra se descarta entera.
  exclusiveFilter: (frame) =>
    frame.tag === 'img' && !CLOUDINARY_IMAGE.test(frame.attribs['src'] ?? ''),
  // El contenido de estas etiquetas peligrosas se descarta (no se deja su texto).
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
};

export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, options).trim();
}

/**
 * Primer párrafo de un HTML en texto plano, recortado: sirve de resumen en las tarjetas. No devuelve HTML (se
 * escapa lo que quede) y las entidades vuelven a ser caracteres normales.
 */
export function firstParagraphText(html: string, maxLength = 200): string {
  const withBreaks = html.replace(/<\/(p|li|h2|h3|h4|blockquote)>|<br\s*\/?>/gi, '\n');
  const plain = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const first =
    plain
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .find((line) => line !== '') ?? '';
  return first.length > maxLength ? `${first.slice(0, maxLength - 1).trimEnd()}…` : first;
}
