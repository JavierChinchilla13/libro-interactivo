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
const ALLOWED_ATTR = ['href', 'rel', 'src', 'alt', 'width', 'height', 'style'];

/** Como en el servidor: de `style` solo vale `text-align` izquierda o centro, en párrafos y títulos h2–h4. */
const ALIGNABLE = new Set(['P', 'H2', 'H3', 'H4']);
const TEXT_ALIGN = /(?:^|;)\s*text-align\s*:\s*(left|center)\s*(?:;|$)/i;
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style') return;
  const align = ALIGNABLE.has(node.nodeName) ? TEXT_ALIGN.exec(data.attrValue)?.[1] : undefined;
  if (align) data.attrValue = `text-align:${align.toLowerCase()}`;
  else data.keepAttr = false;
});

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
      className={`max-w-[var(--token-measure)] font-read text-[1.1875rem] leading-relaxed [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(html) }}
    />
  );
}
