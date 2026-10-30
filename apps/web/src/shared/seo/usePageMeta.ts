import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { SITE_NAME, absoluteUrl, defaultImage, describe } from './site';

export interface PageMeta {
  /** Título de la página; el nombre del sitio se agrega solo (salvo que el título sea el propio nombre del sitio). */
  title: string;
  /** Texto plano para buscadores y redes; se corta a 160 caracteres. Sin él se usa el del sitio. */
  description?: string | null | undefined;
  /** Imagen para redes (dirección absoluta). Sin ella, la imagen del sitio. */
  image?: string | null | undefined;
  type?: 'website' | 'article' | 'book';
  /** `true`: la página no debe indexarse (ingreso, panel, contenido bloqueado, no encontrada…). */
  noindex?: boolean;
  /** Datos estructurados (JSON-LD) verdaderos de la página. */
  jsonLd?: object | undefined;
}

/** Fija o crea una etiqueta `<meta>` y devuelve cómo dejarla como estaba. */
function upsertMeta(attr: 'name' | 'property', key: string, content: string): () => void {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (existing) {
    const previous = existing.getAttribute('content');
    existing.setAttribute('content', content);
    return () => {
      if (previous === null) existing.removeAttribute('content');
      else existing.setAttribute('content', previous);
    };
  }
  const created = document.createElement('meta');
  created.setAttribute(attr, key);
  created.setAttribute('content', content);
  document.head.appendChild(created);
  return () => created.remove();
}

function upsertCanonical(href: string): () => void {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (existing) {
    const previous = existing.getAttribute('href');
    existing.setAttribute('href', href);
    return () => {
      if (previous === null) existing.remove();
      else existing.setAttribute('href', previous);
    };
  }
  const created = document.createElement('link');
  created.rel = 'canonical';
  created.href = href;
  document.head.appendChild(created);
  return () => created.remove();
}

/**
 * Los metadatos de cada página, en un solo lugar: `<title>`, descripción, dirección canónica, Open Graph y Twitter,
 * `robots` (si no debe indexarse) y datos estructurados. Al salir de la página todo vuelve a como estaba.
 *
 * Aviso: los rastreadores que no ejecutan JavaScript (la vista previa de WhatsApp o de redes) solo ven lo que trae
 * `index.html` (nombre, descripción e imagen del sitio): el prerenderizado por página queda fuera del plan gratuito.
 */
export function usePageMeta(meta: PageMeta): void {
  const { pathname } = useLocation();
  const serialized = JSON.stringify(meta);

  useEffect(() => {
    const value = JSON.parse(serialized) as PageMeta;
    const title = value.title === SITE_NAME ? SITE_NAME : `${value.title} · ${SITE_NAME}`;
    const description = describe(value.description);
    const url = absoluteUrl(pathname);
    const image = value.image || defaultImage();
    const undo: Array<() => void> = [];

    const previousTitle = document.title;
    document.title = title;
    undo.push(() => {
      document.title = previousTitle;
    });

    undo.push(upsertMeta('name', 'description', description));
    if (value.noindex) {
      undo.push(upsertMeta('name', 'robots', 'noindex, nofollow'));
    } else {
      undo.push(upsertCanonical(url));
    }
    undo.push(upsertMeta('property', 'og:site_name', SITE_NAME));
    undo.push(upsertMeta('property', 'og:locale', 'es_LA'));
    undo.push(upsertMeta('property', 'og:type', value.type ?? 'website'));
    undo.push(upsertMeta('property', 'og:title', title));
    undo.push(upsertMeta('property', 'og:description', description));
    undo.push(upsertMeta('property', 'og:url', url));
    undo.push(upsertMeta('property', 'og:image', image));
    undo.push(upsertMeta('name', 'twitter:card', 'summary_large_image'));
    undo.push(upsertMeta('name', 'twitter:title', title));
    undo.push(upsertMeta('name', 'twitter:description', description));
    undo.push(upsertMeta('name', 'twitter:image', image));

    if (value.jsonLd && !value.noindex) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset['pageMeta'] = '1';
      // `<` escapado: el contenido es JSON, pero nunca debe poder cerrar la etiqueta.
      script.text = JSON.stringify(value.jsonLd).replace(/</g, '\\u003c');
      document.head.appendChild(script);
      undo.push(() => script.remove());
    }

    return () => {
      for (const restore of undo.reverse()) restore();
    };
  }, [serialized, pathname]);
}
