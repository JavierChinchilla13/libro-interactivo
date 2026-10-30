import type { HtmlTagDescriptor, Plugin } from 'vite';

export interface SiteMetaOptions {
  /** Dirección pública del sitio sin barra final (`VITE_SITE_URL`). */
  siteUrl: string;
}

const NAME = 'Universo Memorias';

/**
 * Etiquetas sociales por omisión en `index.html`. Los rastreadores que no ejecutan JavaScript (la vista previa de
 * WhatsApp o de las redes) solo ven esto: el nombre, la descripción y la imagen del sitio. Las de cada página las pone
 * `usePageMeta` para quien sí ejecuta JavaScript. La descripción sale de la `<meta name="description">` del propio
 * `index.html` (una sola fuente); las direcciones, de `VITE_SITE_URL`.
 */
export function siteMeta({ siteUrl }: SiteMetaOptions): Plugin {
  return {
    name: 'site-meta',
    transformIndexHtml(html) {
      const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? NAME;
      const image = `${siteUrl}/og-default.png`;
      const property = (name: string, content: string): HtmlTagDescriptor => ({
        tag: 'meta',
        attrs: { property: name, content },
        injectTo: 'head',
      });
      const named = (name: string, content: string): HtmlTagDescriptor => ({
        tag: 'meta',
        attrs: { name, content },
        injectTo: 'head',
      });
      return [
        property('og:site_name', NAME),
        property('og:type', 'website'),
        property('og:locale', 'es_LA'),
        property('og:title', NAME),
        property('og:description', description),
        property('og:image', image),
        property('og:image:width', '1200'),
        property('og:image:height', '630'),
        property('og:image:alt', NAME),
        named('twitter:card', 'summary_large_image'),
        named('twitter:title', NAME),
        named('twitter:description', description),
        named('twitter:image', image),
      ];
    },
  };
}
