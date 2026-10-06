import DOMPurify from 'dompurify';

/** Misma lista blanca que el servidor (`apps/api/src/lib/sanitize.ts`). */
const ALLOWED_TAGS = [
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
];
const ALLOWED_ATTR = ['href', 'rel', 'src', 'alt', 'width', 'height'];

export function sanitizeForDisplay(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    ADD_ATTR: ['target'],
  });
}

/**
 * Único lugar donde se inyecta HTML: el contenido enriquecido se trata SIEMPRE como no confiable
 * (aunque el servidor ya lo sanee) y se vuelve a limpiar aquí antes de pintarlo.
 */
export function SafeHtml({ html, className = '' }: { html: string; className?: string }) {
  return (
    <div
      className={`[&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(html) }}
    />
  );
}
