import {
  adminFanArtSchema,
  adminReviewSchema,
  apiErrorSchema,
  fanArtListResponseSchema,
  reviewListResponseSchema,
  type FanArtInputPayload,
  type ReviewInputPayload,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { FanArt } from '../models/FanArt.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const art = (over: Partial<FanArtInputPayload> = {}): FanArtInputPayload => ({
  title: '[PLACEHOLDER] Dibujo',
  image: image('arte'),
  artistName: '[PLACEHOLDER] Artista',
  permissionConfirmed: true,
  status: 'published',
  ...over,
});
const review = (over: Partial<ReviewInputPayload> = {}): ReviewInputPayload => ({
  text: '[PLACEHOLDER] Me encantó.',
  authorName: '[PLACEHOLDER] Lector',
  ...over,
});

describe('permisos del panel', () => {
  it('fan arts y reseñas exigen sesión y rol de editora o administradora', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    for (const path of ['/api/admin/fan-arts', '/api/admin/reviews']) {
      await request(app).get(path).expect(401);
      await request(app).post(path).send({}).expect(401);
      expect((await reader.get(path)).status).toBe(403);
      expect((await reader.post(path).send({})).status).toBe(403);
      expect((await reader.get(`${path}/670000000000000000000001`)).status).toBe(403);
      await editor.get(path).expect(200);
    }
    await admin.post('/api/admin/fan-arts').send(art()).expect(201);
    await admin.post('/api/admin/reviews').send(review()).expect(201);
  });
});

describe('fan arts', () => {
  it('se crea, se lee y se reemplaza; el permiso privado no sale en el público', async () => {
    const { editor, app } = await staffWorld();
    const created = adminFanArtSchema.parse(
      (
        await editor
          .post('/api/admin/fan-arts')
          .send(
            art({
              permissionNote: 'Permiso por correo el 3-oct',
              artistLink: 'https://ejemplo.com/artista',
            }),
          )
          .expect(201)
      ).body,
    );
    expect(created).toMatchObject({
      permissionConfirmed: true,
      permissionNote: 'Permiso por correo el 3-oct',
      status: 'published',
      order: 1,
    });
    const replaced = adminFanArtSchema.parse(
      (
        await editor
          .put(`/api/admin/fan-arts/${created.id}`)
          .send(art({ title: undefined, permissionNote: undefined, artistName: 'Otra persona' }))
          .expect(200)
      ).body,
    );
    expect(replaced.artistName).toBe('Otra persona');
    expect(replaced.title).toBeUndefined();
    expect(replaced.permissionNote).toBeUndefined();

    await editor
      .put(`/api/admin/fan-arts/${created.id}`)
      .send(art({ permissionNote: 'SECRETO-PERMISO' }))
      .expect(200);
    const res = await request(app).get('/api/fan-arts').expect(200);
    expect(fanArtListResponseSchema.parse(res.body).fanArts).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRETO|permission|status|createdBy/);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('no se puede publicar sin el permiso del artista, pero un borrador sí se guarda', async () => {
    const { editor } = await staffWorld();
    const res = await editor.post('/api/admin/fan-arts').send(art({ permissionConfirmed: false }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(apiErrorSchema.parse(res.body))).toContain('permissionConfirmed');
    await editor
      .post('/api/admin/fan-arts')
      .send(art({ permissionConfirmed: false, status: 'draft' }))
      .expect(201);
  });

  it('el público nunca ve borradores, archivados ni los publicados sin permiso confirmado', async () => {
    const { editor, app, adminUser } = await staffWorld();
    for (const [name, over] of [
      ['visible', {}],
      ['borrador', { status: 'draft' }],
      ['archivado', { status: 'archived' }],
    ] as [string, Partial<FanArtInputPayload>][]) {
      await editor
        .post('/api/admin/fan-arts')
        .send(art({ artistName: name, ...over }))
        .expect(201);
    }
    // Un documento «publicado» sin permiso (insertado directo: defensa en profundidad).
    await FanArt.create({
      image: image('x'),
      artistName: 'sin-permiso',
      permissionConfirmed: false,
      status: 'published',
      order: 1,
      createdBy: adminUser._id,
    });
    const names = fanArtListResponseSchema
      .parse((await request(app).get('/api/fan-arts').expect(200)).body)
      .fanArts.map((f) => f.artistName);
    expect(names).toEqual(['visible']);
  });

  it('respeta el orden manual y filtra por libro incluyendo las de toda la saga', async () => {
    const { editor, app } = await staffWorld();
    const book = await Book.create({ slug: 'l1', title: 'L1', order: 1, status: 'published' });
    const other = await Book.create({ slug: 'l2', title: 'L2', order: 2, status: 'published' });
    const make = (name: string, order: number, bookId?: string) =>
      editor
        .post('/api/admin/fan-arts')
        .send(art({ artistName: name, order, ...(bookId ? { bookId } : {}) }))
        .expect(201);
    await make('segunda', 2, book._id.toString());
    await make('primera', 1);
    await make('de-otro', 3, other._id.toString());
    const all = fanArtListResponseSchema.parse(
      (await request(app).get('/api/fan-arts').expect(200)).body,
    );
    expect(all.fanArts.map((f) => f.artistName)).toEqual(['primera', 'segunda', 'de-otro']);
    const filtered = fanArtListResponseSchema.parse(
      (await request(app).get(`/api/fan-arts?bookId=${book._id}`).expect(200)).body,
    );
    expect(filtered.fanArts.map((f) => f.artistName)).toEqual(['primera', 'segunda']);
    await request(app).get('/api/fan-arts?bookId=no').expect(400);
  });

  it('valida: imagen de Cloudinary, enlace http(s), libro existente y nombre del artista', async () => {
    const { editor } = await staffWorld();
    const bad: [Partial<FanArtInputPayload>, number][] = [
      [{ image: image('x', { url: 'https://evil.example.com/a.png' }) }, 400],
      [{ artistLink: 'javascript:alert(1)' }, 400],
      [{ artistName: '   ' }, 400],
      [{ bookId: '670000000000000000000099' }, 404],
      [{ order: 0 }, 400],
      [{ status: 'oculto' as never }, 400],
    ];
    for (const [over, status] of bad) {
      expect(
        (await editor.post('/api/admin/fan-arts').send(art(over))).status,
        JSON.stringify(over),
      ).toBe(status);
    }
    const { image: _omit, ...withoutImage } = art();
    void _omit;
    expect((await editor.post('/api/admin/fan-arts').send(withoutImage)).status).toBe(400);
  });

  it('el panel lista todos (también borradores y archivados) y filtra; id inexistente = 404', async () => {
    const { editor } = await staffWorld();
    await editor
      .post('/api/admin/fan-arts')
      .send(art({ artistName: 'a' }))
      .expect(201);
    await editor
      .post('/api/admin/fan-arts')
      .send(art({ artistName: 'b', status: 'draft' }))
      .expect(201);
    await editor
      .post('/api/admin/fan-arts')
      .send(art({ artistName: 'c', status: 'archived' }))
      .expect(201);
    const list = async (qs: string) =>
      (await editor.get(`/api/admin/fan-arts${qs}`).expect(200)).body.fanArts.map(
        (f: { artistName: string }) => f.artistName,
      ) as string[];
    expect(await list('')).toEqual(['a', 'b', 'c']);
    expect(await list('?status=draft')).toEqual(['b']);
    expect(await list('?status=archived')).toEqual(['c']);
    await editor.get('/api/admin/fan-arts/670000000000000000000001').expect(404);
    await editor.put('/api/admin/fan-arts/670000000000000000000001').send(art()).expect(404);
  });

  it('archivar o quitar el permiso lo saca del público', async () => {
    const { editor, app } = await staffWorld();
    const a = adminFanArtSchema.parse(
      (await editor.post('/api/admin/fan-arts').send(art()).expect(201)).body,
    );
    const count = async () =>
      fanArtListResponseSchema.parse((await request(app).get('/api/fan-arts')).body).fanArts.length;
    expect(await count()).toBe(1);
    await editor
      .put(`/api/admin/fan-arts/${a.id}`)
      .send(art({ status: 'archived' }))
      .expect(200);
    expect(await count()).toBe(0);
    await editor
      .put(`/api/admin/fan-arts/${a.id}`)
      .send(art({ status: 'draft', permissionConfirmed: false }))
      .expect(200);
    expect(await count()).toBe(0);
  });
});

describe('reseñas', () => {
  it('se crea con el estado «publicada» por defecto y el público la ve', async () => {
    const { editor, app } = await staffWorld();
    const created = adminReviewSchema.parse(
      (
        await editor
          .post('/api/admin/reviews')
          .send(review({ source: 'Goodreads', rating: 5 }))
          .expect(201)
      ).body,
    );
    expect(created).toMatchObject({
      status: 'published',
      rating: 5,
      source: 'Goodreads',
      order: 1,
    });
    const res = await request(app).get('/api/reviews').expect(200);
    const list = reviewListResponseSchema.parse(res.body).reviews;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/status|createdBy/);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('las ocultas no se ven; ocultar y mostrar de nuevo es reversible', async () => {
    const { editor, app } = await staffWorld();
    await editor
      .post('/api/admin/reviews')
      .send(review({ text: 'Visible' }))
      .expect(201);
    const hidden = adminReviewSchema.parse(
      (
        await editor
          .post('/api/admin/reviews')
          .send(review({ text: 'Oculta', status: 'hidden' }))
          .expect(201)
      ).body,
    );
    const texts = async () =>
      reviewListResponseSchema
        .parse((await request(app).get('/api/reviews')).body)
        .reviews.map((r) => r.text);
    expect(await texts()).toEqual(['Visible']);
    await editor
      .put(`/api/admin/reviews/${hidden.id}`)
      .send(review({ text: 'Oculta', status: 'published', order: 2 }))
      .expect(200);
    expect(await texts()).toEqual(['Visible', 'Oculta']);
    await editor
      .put(`/api/admin/reviews/${hidden.id}`)
      .send(review({ text: 'Oculta', status: 'hidden' }))
      .expect(200);
    expect(await texts()).toEqual(['Visible']);
  });

  it('es texto plano: el HTML se guarda tal cual y nunca se interpreta (lo escapa la web)', async () => {
    const { editor, app } = await staffWorld();
    await editor
      .post('/api/admin/reviews')
      .send(review({ text: '<script>alert(1)</script> Genial' }))
      .expect(201);
    const [first] = reviewListResponseSchema.parse(
      (await request(app).get('/api/reviews')).body,
    ).reviews;
    expect(first?.text).toBe('<script>alert(1)</script> Genial');
  });

  it('respeta el orden, el límite y el filtro por libro (con las de toda la saga)', async () => {
    const { editor, app } = await staffWorld();
    const book = await Book.create({ slug: 'l1', title: 'L1', order: 1, status: 'published' });
    const other = await Book.create({ slug: 'l2', title: 'L2', order: 2, status: 'published' });
    const make = (text: string, order: number, bookId?: string) =>
      editor
        .post('/api/admin/reviews')
        .send(review({ text, order, ...(bookId ? { bookId } : {}) }))
        .expect(201);
    await make('c', 3);
    await make('a', 1, book._id.toString());
    await make('b', 2, other._id.toString());
    const get = async (qs: string) =>
      reviewListResponseSchema
        .parse((await request(app).get(`/api/reviews${qs}`).expect(200)).body)
        .reviews.map((r) => r.text);
    expect(await get('')).toEqual(['a', 'b', 'c']);
    expect(await get('?limit=2')).toEqual(['a', 'b']);
    expect(await get(`?bookId=${book._id}`)).toEqual(['a', 'c']);
    await request(app).get('/api/reviews?limit=0').expect(400);
    await request(app).get('/api/reviews?limit=500').expect(400);
  });

  it('valida el texto, el nombre, la calificación y el libro', async () => {
    const { editor } = await staffWorld();
    const bad: [Partial<ReviewInputPayload>, number][] = [
      [{ text: '   ' }, 400],
      [{ text: 'x'.repeat(1001) }, 400],
      [{ authorName: '' }, 400],
      [{ rating: 0 }, 400],
      [{ rating: 6 }, 400],
      [{ rating: 3.5 }, 400],
      [{ status: 'borrador' as never }, 400],
      [{ bookId: '670000000000000000000099' }, 404],
    ];
    for (const [over, status] of bad) {
      expect(
        (await editor.post('/api/admin/reviews').send(review(over))).status,
        JSON.stringify(over),
      ).toBe(status);
    }
    await editor.get('/api/admin/reviews/670000000000000000000001').expect(404);
    await editor.put('/api/admin/reviews/670000000000000000000001').send(review()).expect(404);
  });

  it('el panel lista todas y filtra por estado', async () => {
    const { editor } = await staffWorld();
    await editor
      .post('/api/admin/reviews')
      .send(review({ text: 'a' }))
      .expect(201);
    await editor
      .post('/api/admin/reviews')
      .send(review({ text: 'b', status: 'hidden' }))
      .expect(201);
    const list = async (qs: string) =>
      (await editor.get(`/api/admin/reviews${qs}`).expect(200)).body.reviews.map(
        (r: { text: string }) => r.text,
      ) as string[];
    expect(await list('')).toEqual(['a', 'b']);
    expect(await list('?status=hidden')).toEqual(['b']);
  });
});
