import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { letterOf, normalizeName } from '../lib/text.js';
import { Book } from '../models/Book.js';
import { Post } from '../models/Post.js';
import { WikiEntry } from '../models/WikiEntry.js';
import { image } from '../test-utils/admin.js';
import { createTestApp } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { User } from '../models/User.js';
import { escapeXml, STATIC_SITEMAP_PATHS } from '../services/sitemap.service.js';

useTestDb();

const DAY = 86_400_000;
const BASE = 'https://universomemorias.com';
const OPEN = { ALLOW_INDEXING: 'true', APP_URL: BASE };

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '');

/** Un mundo con de todo: lo público, lo bloqueado por progreso, lo escondido y los borradores. */
async function world() {
  const admin = await User.create({
    email: 'a@ejemplo.com',
    emailNormalized: 'a@ejemplo.com',
    name: 'Admin',
    passwordHash: 'x'.repeat(20),
    role: 'ADMIN',
  });
  const book = await Book.create({
    slug: 'libro-1',
    title: 'Libro 1',
    order: 1,
    status: 'published',
    cover: image('c'),
  });
  await Book.create({
    slug: 'libro-2',
    title: 'Libro 2',
    order: 2,
    status: 'upcoming',
    cover: image('c2'),
  });
  await Book.create({ slug: 'libro-borrador', title: 'Borrador', order: 3, status: 'draft' });
  await Book.create({ slug: 'libro-archivado', title: 'Archivado', order: 4, status: 'archived' });
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz 1' }),
    publishedBy: admin._id,
  });
  await Book.updateOne(
    { _id: book._id },
    {
      $set: {
        wikiSections: [
          {
            kind: 'character',
            title: 'Personajes',
            order: 1,
            enabled: true,
            unlockAfter: { kind: 'quiz', refId: quiz._id.toString() },
          },
          { kind: 'term', title: 'Glosario', order: 2, enabled: true },
          { kind: 'place', title: 'Lugares', order: 3, enabled: false },
        ],
      },
    },
  );
  const add = async (over: { name: string; kind: string } & Record<string, unknown>) =>
    (await WikiEntry.create({
      bookId: book._id,
      slug: normalizeName(over.name).replace(/[^a-z0-9]+/g, '-'),
      nameNormalized: normalizeName(over.name),
      letter: letterOf(over.name),
      status: 'published',
      order: 1,
      ...over,
    } as never)) as unknown as { _id: { toString(): string } };
  const open = await add({ name: 'Memoria', kind: 'term' });
  const draft = await add({ name: 'Borrador secreto', kind: 'term', status: 'draft' });
  const ruled = await add({
    name: 'Con regla',
    kind: 'term',
    unlockAfter: { kind: 'quiz', refId: quiz._id.toString() },
  });
  const hiddenRule = await add({
    name: 'Escondida',
    kind: 'term',
    unlockAfter: { kind: 'quiz', refId: quiz._id.toString() },
    lockedDisplay: 'hide',
  });
  const character = await add({ name: 'Ana', kind: 'character' });
  const disabledPlace = await add({ name: 'Lugar apagado', kind: 'place' });

  const post = (over: Record<string, unknown>) =>
    Post.create({
      title: 'Publicación',
      authorId: admin._id,
      category: 'novedad',
      template: 'text',
      data: { bodyHtml: '<p>Hola</p>' },
      status: 'published',
      publishedAt: new Date(Date.now() - DAY),
      ...over,
    } as never);
  await post({ slug: 'novedad', title: 'Novedad' });
  await post({ slug: 'futura', publishedAt: new Date(Date.now() + DAY) });
  await post({ slug: 'borrador', status: 'draft' });
  await post({ slug: 'archivada', status: 'archived' });
  return { open, draft, ruled, hiddenRule, character, disabledPlace };
}

describe('GET /api/sitemap.xml', () => {
  it('con la indexación apagada (lo normal hasta el lanzamiento) responde 404 y no anuncia nada', async () => {
    await world();
    const res = await request(createTestApp()).get('/api/sitemap.xml');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<urlset');
  });

  it('con la indexación abierta lista las páginas fijas, los libros visibles, la wiki abierta y las publicaciones vigentes', async () => {
    const w = await world();
    const res = await request(createTestApp({ env: OPEN }))
      .get('/api/sitemap.xml')
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const urls = locs(res.text);

    for (const path of STATIC_SITEMAP_PATHS) {
      expect(urls).toContain(path === '/' ? `${BASE}/` : `${BASE}${path}`);
    }
    // Libros: publicados y «próximamente»; nunca borradores ni archivados.
    expect(urls).toContain(`${BASE}/libros/libro-1`);
    expect(urls).toContain(`${BASE}/libros/libro-2`);
    expect(urls.join('\n')).not.toMatch(/libro-borrador|libro-archivado/);
    // Wiki: solo lo que un visitante ve abierto.
    expect(urls).toContain(`${BASE}/wiki/entrada/${w.open._id.toString()}`);
    for (const hidden of [w.draft, w.ruled, w.hiddenRule, w.character, w.disabledPlace]) {
      expect(urls).not.toContain(`${BASE}/wiki/entrada/${hidden._id.toString()}`);
    }
    // Actualizaciones: publicadas cuya fecha ya llegó.
    expect(urls).toContain(`${BASE}/actualizaciones/novedad`);
    expect(urls.join('\n')).not.toMatch(/futura|borrador|archivada/);
  });

  it('nunca anuncia el panel, la administración, los QR, el ingreso, el registro ni el estado técnico', async () => {
    await world();
    const res = await request(createTestApp({ env: OPEN }))
      .get('/api/sitemap.xml')
      .expect(200);
    expect(res.text).not.toMatch(
      /\/panel|\/admin|\/u\/|\/ingresar|\/registro|\/estado|\/restablecer|\/olvide|\/api\//,
    );
  });

  it('es XML válido y bien escapado, y se puede cachear una hora', async () => {
    await Book.create({
      slug: 'a-b',
      title: 'Ab',
      order: 1,
      status: 'published',
      cover: image('c'),
    });
    const res = await request(createTestApp({ env: OPEN }))
      .get('/api/sitemap.xml')
      .expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
    expect(res.text.split('<url>').length - 1).toBe(locs(res.text).length);
    expect(res.text).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/);
  });

  it('es la única respuesta del API sin X-Robots-Tag: noindex (el resto sí lo lleva)', async () => {
    const app = createTestApp({ env: OPEN });
    expect((await request(app).get('/api/sitemap.xml')).headers['x-robots-tag']).toBeUndefined();
    expect((await request(app).get('/api/health')).headers['x-robots-tag']).toBe('noindex');
  });

  it('usa APP_URL como base, no el host con el que se pidió', async () => {
    const res = await request(
      createTestApp({ env: { ALLOW_INDEXING: 'true', APP_URL: 'https://otro.example' } }),
    )
      .get('/api/sitemap.xml')
      .set('Host', 'interno.render.example')
      .expect(200);
    expect(locs(res.text).every((url) => url.startsWith('https://otro.example'))).toBe(true);
  });
});
