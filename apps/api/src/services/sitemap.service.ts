import { Book } from '../models/Book.js';
import { Post } from '../models/Post.js';
import type { Clock } from '../lib/clock.js';
import type { PublicWikiService } from './publicWiki.service.js';

/** Un sitemap admite hasta 50 000 direcciones: más allá se corta (el sitio está muy lejos de eso). */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * Las páginas públicas fijas del sitio. Nunca el panel, la administración, los códigos QR, el ingreso ni el estado
 * técnico (esas páginas piden no indexarse).
 */
export const STATIC_SITEMAP_PATHS = [
  '/',
  '/wiki',
  '/actualizaciones',
  '/fan-arts',
  '/contacto',
  '/privacidad',
  '/terminos',
  '/cookies',
] as const;

/** Visitante anónimo: lo que él puede ver es lo único que se anuncia a los buscadores. */
const VISITOR = {};

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface UrlEntry {
  path: string;
  lastmod?: Date | undefined;
}

/**
 * `sitemap.xml` con las páginas públicas: las fijas, los libros visibles (publicados y «próximamente»), las entradas de
 * la wiki que **un visitante sin sesión ve abiertas** (las bloqueadas por progreso o escondidas nunca salen) y las
 * actualizaciones publicadas cuya fecha ya llegó. Los borradores y lo archivado no salen.
 */
export function createSitemapService({
  publicWiki,
  clock,
  siteUrl,
}: {
  publicWiki: PublicWikiService;
  clock: Clock;
  /** Dirección pública del sitio (`APP_URL`). */
  siteUrl: string;
}) {
  const base = siteUrl.replace(/\/+$/, '');

  async function wikiPaths(bookIds: string[]): Promise<string[]> {
    const paths: string[] = [];
    for (const bookId of bookIds) {
      const { sections } = await publicWiki.sections(bookId, VISITOR);
      for (const section of sections) {
        if (section.locked) continue;
        const { entries } = await publicWiki.entries({ bookId, kind: section.kind }, VISITOR);
        for (const item of entries) {
          if (item.locked) continue;
          paths.push(`/wiki/entrada/${item.id}`);
          if ('powers' in item) {
            for (const power of item.powers ?? []) {
              if (!power.locked) paths.push(`/wiki/entrada/${power.id}`);
            }
          }
        }
      }
    }
    return paths;
  }

  async function build(): Promise<string> {
    const urls: UrlEntry[] = STATIC_SITEMAP_PATHS.map((path) => ({ path }));

    const books = await Book.find({ status: { $in: ['published', 'upcoming'] } })
      .select('slug status updatedAt')
      .sort({ order: 1 })
      .lean();
    for (const book of books) urls.push({ path: `/libros/${book.slug}`, lastmod: book.updatedAt });

    const published = books.filter((book) => book.status === 'published').map((b) => String(b._id));
    for (const path of new Set(await wikiPaths(published))) urls.push({ path });

    const posts = await Post.find({ status: 'published', publishedAt: { $lte: clock() } })
      .select('slug publishedAt updatedAt')
      .sort({ publishedAt: -1 })
      .lean();
    for (const post of posts) {
      urls.push({
        path: `/actualizaciones/${post.slug}`,
        lastmod: post.updatedAt ?? post.publishedAt,
      });
    }

    const body = urls
      .slice(0, SITEMAP_MAX_URLS)
      .map(({ path, lastmod }) => {
        const loc = `${base}${path === '/' ? '/' : path}`;
        const mod = lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : '';
        return `  <url><loc>${escapeXml(loc)}</loc>${mod}</url>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  }

  return { build };
}

export type SitemapService = ReturnType<typeof createSitemapService>;
