import { createHash } from 'node:crypto';

/**
 * Política de contenido (CSP) del sitio estático. HOY SOLO REPORTA (`Content-Security-Policy-Report-Only`): no bloquea
 * nada; cada violación llega a `POST /api/csp-report` (solo la directiva y el recurso). Tras 1 o 2 semanas sin reportes
 * inesperados, la decisión de pasarla a bloqueo es de la clienta.
 *
 * Única fuente de la política: `render.yaml` copia lo que imprime `npm run csp:print`, y una prueba falla si se desfasan.
 */

/** Huella (`'sha256-…'`) de cada script en línea del HTML compilado que se ejecuta (los de datos `ld+json` no cuentan). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/type\s*=\s*["']?application\/ld\+json/i.test(attrs)) continue;
    const body = match[2] ?? '';
    if (body.trim() === '') continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

/** El texto de la política, con las huellas de los scripts en línea de esta compilación. */
export function buildCsp(hashes: string[]): string {
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    // Google solo se carga al tocar «Continuar con Google»; su script se permite por dirección, sin `strict-dynamic`.
    ['script-src', ["'self'", ...hashes, 'https://accounts.google.com/gsi/client']],
    // Deuda anotada: Tailwind y los estilos de React en línea necesitan `'unsafe-inline'` en los estilos.
    ['style-src', ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style']],
    ['img-src', ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']],
    ['media-src', ["'self'", 'https://res.cloudinary.com']],
    ['font-src', ["'self'"]],
    // `api.cloudinary.com`: la subida firmada de imágenes y videos desde el panel.
    ['connect-src', ["'self'", 'https://accounts.google.com/gsi/', 'https://api.cloudinary.com']],
    ['frame-src', ['https://accounts.google.com/gsi/']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ['report-uri', ['/api/csp-report']],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
