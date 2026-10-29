import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Dirección pública del sitio: de aquí salen el `Sitemap` del robots.txt y (más adelante) las direcciones canónicas. */
export const DEFAULT_SITE_URL = 'https://universomemorias.com';

export interface IndexingOptions {
  /** `true` solo el día del lanzamiento (`VITE_ALLOW_INDEXING=true` al construir). Apagado, el sitio pide no indexarse. */
  allow: boolean;
  /** Dirección pública sin barra final. */
  siteUrl: string;
}

/**
 * Lee las variables de construcción. `VITE_ALLOW_INDEXING` solo se enciende con el texto exacto `true`: cualquier otro
 * valor (o su ausencia) deja el sitio sin indexar, que es el lado seguro de equivocarse.
 */
export function resolveIndexing(env: Record<string, string | undefined>): IndexingOptions {
  const raw = (env['VITE_SITE_URL'] ?? '').trim() || DEFAULT_SITE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      'VITE_SITE_URL no es una dirección válida (ejemplo: https://universomemorias.com).',
    );
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('VITE_SITE_URL debe empezar con https:// (solo localhost puede usar http).');
  }
  return { allow: env['VITE_ALLOW_INDEXING'] === 'true', siteUrl: url.origin };
}

const template = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../robots/${name}`, import.meta.url)), 'utf8');

/** El contenido de `robots.txt` para cada modo, desde las plantillas de `apps/web/robots/`. */
export function robotsTxt({ allow, siteUrl }: IndexingOptions): string {
  return allow
    ? template('robots.allow.txt').replaceAll('{{SITE_URL}}', siteUrl)
    : template('robots.block.txt');
}

/**
 * Interruptor de indexación. Apagado (lo normal hasta el lanzamiento): agrega `<meta name="robots" content="noindex,
 * nofollow">` al HTML y publica un `robots.txt` que bloquea todo. Encendido: no agrega la meta y publica el
 * `robots.txt` abierto (con `Sitemap`). Nota: un `robots.txt` que bloquea impide que los rastreadores lean la meta;
 * por eso van las dos (la meta cubre el caso de que alguien llegue a una página por otra vía).
 */
export function indexingControl(options: IndexingOptions): Plugin {
  return {
    name: 'indexing-control',
    transformIndexHtml() {
      if (options.allow) return [];
      return [
        {
          tag: 'meta',
          attrs: { name: 'robots', content: 'noindex, nofollow' },
          injectTo: 'head-prepend' as const,
        },
      ];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(options) });
    },
    configureServer(server) {
      server.middlewares.use('/robots.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(robotsTxt(options));
      });
    },
  };
}
