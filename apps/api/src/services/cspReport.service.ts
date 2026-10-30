import type { CspReportBody } from '@libro/shared';

/** Lo único que se registra de una violación de la política de contenido. Sin IP, sin la página y sin parámetros. */
export interface Violation {
  blocked: string;
  directive: string;
}

const MAX_PER_REPORT = 10;
const KEYWORDS = new Set([
  'inline',
  'eval',
  'data',
  'blob',
  'self',
  'about',
  'wasm-eval',
  'trusted-types-policy',
]);

/**
 * `blocked-uri` sin lo que identifica a una persona: de una dirección solo quedan el origen y la ruta (nunca la consulta
 * ni el ancla, donde puede ir un token o un correo); las palabras clave (`inline`, `eval`, `data`) quedan tal cual.
 */
export function sanitizeBlocked(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (raw === '') return 'sin dato';
  if (KEYWORDS.has(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'javascript:') {
      return url.protocol.slice(0, -1);
    }
    return `${url.origin}${url.pathname}`.slice(0, 200);
  } catch {
    // No es una dirección: se descarta el contenido (podría ser cualquier texto) y solo se anota que fue algo raro.
    return 'otro';
  }
}

/** La directiva (`script-src-elem`, `img-src`…): solo letras y guiones, sin el resto de la política. */
export function sanitizeDirective(value: string | undefined): string {
  const match = /^[a-z][a-z-]{0,40}/.exec((value ?? '').trim().toLowerCase());
  return match?.[0] ?? 'otra';
}

/** Saca de un informe (formato antiguo o API de Reportes) hasta 10 violaciones ya limpias. */
export function extractViolations(body: CspReportBody): Violation[] {
  const found: Violation[] = [];
  if (Array.isArray(body)) {
    for (const entry of body) {
      if (entry.type !== undefined && entry.type !== 'csp-violation') continue;
      const report = entry.body;
      found.push({
        blocked: sanitizeBlocked(report?.blockedURL),
        directive: sanitizeDirective(report?.effectiveDirective ?? report?.violatedDirective),
      });
    }
  } else {
    const report = body['csp-report'];
    found.push({
      blocked: sanitizeBlocked(report['blocked-uri']),
      directive: sanitizeDirective(report['effective-directive'] ?? report['violated-directive']),
    });
  }
  return found.slice(0, MAX_PER_REPORT);
}
