import {
  adminPostSchema,
  apiErrorSchema,
  postDetailSchema,
  postListResponseSchema,
  type PostInputPayload,
  type PostTemplate,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { Post } from '../models/Post.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const DAY = 86_400_000;
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

/** Datos válidos (para publicar) de cada plantilla. */
const VALID_DATA: Record<PostTemplate, Record<string, unknown>> = {
  text: { bodyHtml: '<p>[PLACEHOLDER] Primer párrafo.</p><p>Segundo.</p>' },
  featured_image: {
    image: image('destacada'),
    caption: 'Pie de foto',
    bodyHtml: '<p>[PLACEHOLDER] Texto</p>',
  },
  gallery: {
    images: [{ image: image('uno'), caption: 'Uno' }, { image: image('dos') }],
    bodyHtml: '<p>Galería</p>',
  },
  event: {
    startsAt: '2027-03-20T16:00:00.000Z',
    endsAt: '2027-03-20T18:00:00.000Z',
    venue: '[PLACEHOLDER] Librería',
    address: '[PLACEHOLDER] Calle 1',
    mapUrl: 'https://maps.example.com/lugar',
    link: 'https://ejemplo.com/evento',
    bodyHtml: '<p>[PLACEHOLDER] Evento</p>',
  },
  invitation: {
    bodyHtml: '<p>[PLACEHOLDER] Estás invitado</p>',
    image: image('invitacion'),
    ctaLabel: 'Confirmar',
    ctaUrl: 'https://ejemplo.com/confirmar',
    deadline: '2027-03-10T00:00:00.000Z',
  },
  announcement: { announces: 'extra', ctaLabel: 'Ver ahora', bodyHtml: '<p>Nuevo</p>' },
};

const body = (over: Partial<PostInputPayload> = {}): PostInputPayload => ({
  slug: 'mi-publicacion',
  title: '[PLACEHOLDER] Publicación',
  template: 'text',
  data: VALID_DATA.text,
  status: 'published',
  publishedAt: iso(-DAY),
  ...over,
});

describe('permisos del panel', () => {
  it('exige sesión y rol de editora o administradora en todas las rutas', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    await request(app).get('/api/admin/posts').expect(401);
    await request(app).post('/api/admin/posts').send(body()).expect(401);
    for (const call of [
      () => reader.get('/api/admin/posts'),
      () => reader.post('/api/admin/posts').send(body()),
      () => reader.get('/api/admin/posts/670000000000000000000001'),
      () => reader.put('/api/admin/posts/670000000000000000000001').send(body()),
    ]) {
      expect((await call()).status).toBe(403);
    }
    await editor.get('/api/admin/posts').expect(200);
    await admin.post('/api/admin/posts').send(body()).expect(201);
  });
});

describe('crear con cada plantilla', () => {
  const expected: Record<PostTemplate, { category: string }> = {
    text: { category: 'novedad' },
    featured_image: { category: 'novedad' },
    gallery: { category: 'novedad' },
    event: { category: 'evento' },
    invitation: { category: 'invitacion' },
    announcement: { category: 'novedad' },
  };
  for (const template of Object.keys(VALID_DATA) as PostTemplate[]) {
    it(`«${template}»: se guarda, propone su tipo y se ve distinto en el detalle`, async () => {
      const { editor, app } = await staffWorld();
      const res = await editor
        .post('/api/admin/posts')
        .send(
          body({
            template,
            data: VALID_DATA[template],
            slug: `post-${template.replace('_', '-')}`,
          }),
        )
        .expect(201);
      const post = adminPostSchema.parse(res.body);
      expect(post.template).toBe(template);
      expect(post.category).toBe(expected[template].category);
      expect(post.status).toBe('published');
      const detail = postDetailSchema.parse(
        (
          await request(app)
            .get(`/api/posts/post-${template.replace('_', '-')}`)
            .expect(200)
        ).body,
      );
      expect(detail.data).toMatchObject(
        template === 'announcement' ? { announces: 'extra' } : expect.any(Object),
      );
    });
  }

  it('la autora puede cambiar el tipo propuesto', async () => {
    const { editor } = await staffWorld();
    const res = await editor
      .post('/api/admin/posts')
      .send(body({ template: 'text', category: 'invitacion' }))
      .expect(201);
    expect(adminPostSchema.parse(res.body).category).toBe('invitacion');
  });

  it('calcula el resumen, la miniatura y la fecha del evento', async () => {
    const { editor } = await staffWorld();
    const text = adminPostSchema.parse(
      (
        await editor
          .post('/api/admin/posts')
          .send(
            body({
              data: { bodyHtml: '<p>Café &amp; <strong>té</strong> &lt;3</p><p>Otro párrafo</p>' },
            }),
          )
          .expect(201)
      ).body,
    );
    expect(text.excerpt).toBe('Café & té <3');
    expect(text.thumbnail).toBeUndefined();

    const gallery = adminPostSchema.parse(
      (
        await editor
          .post('/api/admin/posts')
          .send(body({ slug: 'g', template: 'gallery', data: VALID_DATA.gallery }))
          .expect(201)
      ).body,
    );
    expect(gallery.thumbnail?.publicId).toBe('libro/uno');

    const own = adminPostSchema.parse(
      (
        await editor
          .post('/api/admin/posts')
          .send(
            body({
              slug: 'g2',
              template: 'gallery',
              data: VALID_DATA.gallery,
              thumbnail: image('propia'),
            }),
          )
          .expect(201)
      ).body,
    );
    expect(own.thumbnail?.publicId).toBe('libro/propia');

    const event = adminPostSchema.parse(
      (
        await editor
          .post('/api/admin/posts')
          .send(body({ slug: 'e', template: 'event', data: { ...VALID_DATA.event, bodyHtml: '' } }))
          .expect(201)
      ).body,
    );
    expect(event.eventAt).toBe('2027-03-20T16:00:00.000Z');
    expect(event.excerpt).toBe('[PLACEHOLDER] Librería');
  });
});

describe('validación de la plantilla', () => {
  it('para publicar exige los datos obligatorios, con el error en el campo', async () => {
    const { editor } = await staffWorld();
    const cases: [PostTemplate, Record<string, unknown>, string][] = [
      ['text', {}, 'data.bodyHtml'],
      ['featured_image', { bodyHtml: '' }, 'data.image'],
      ['gallery', { images: [] }, 'data.images'],
      ['event', { bodyHtml: '' }, 'data.startsAt'],
      ['event', { startsAt: '2027-03-20T16:00:00.000Z', bodyHtml: '' }, 'data.venue'],
      ['invitation', { bodyHtml: '' }, 'data.bodyHtml'],
      ['announcement', {}, 'data.announces'],
    ];
    for (const [template, data, field] of cases) {
      const res = await editor.post('/api/admin/posts').send(body({ template, data }));
      expect(res.status, `${template} ${field}`).toBe(400);
      const error = apiErrorSchema.parse(res.body).error;
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toContain(field);
    }
  });

  it('un borrador puede estar incompleto, pero lo que escribió debe ser válido', async () => {
    const { editor } = await staffWorld();
    await editor
      .post('/api/admin/posts')
      .send(body({ status: 'draft', template: 'event', data: { venue: 'Algún lugar' } }))
      .expect(201);
    const res = await editor
      .post('/api/admin/posts')
      .send(
        body({ slug: 'otro', status: 'draft', template: 'event', data: { link: 'javascript:1' } }),
      );
    expect(res.status).toBe(400);
  });

  it('reglas propias: el evento no termina antes de empezar y el botón lleva texto y enlace', async () => {
    const { editor } = await staffWorld();
    const event = await editor.post('/api/admin/posts').send(
      body({
        template: 'event',
        data: { ...VALID_DATA.event, endsAt: '2027-03-20T10:00:00.000Z' },
      }),
    );
    expect(event.status).toBe(400);
    expect(JSON.stringify(event.body)).toContain('data.endsAt');
    for (const data of [
      { ...VALID_DATA.invitation, ctaUrl: undefined },
      { ...VALID_DATA.invitation, ctaLabel: undefined },
    ]) {
      const res = await editor
        .post('/api/admin/posts')
        .send(body({ slug: 'i', template: 'invitation', data }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('data.ctaUrl');
    }
  });

  it('los enlaces solo pueden ser http(s) (nunca javascript: ni data:)', async () => {
    const { editor } = await staffWorld();
    for (const [template, data] of [
      ['event', { ...VALID_DATA.event, link: 'javascript:alert(1)' }],
      ['event', { ...VALID_DATA.event, mapUrl: 'data:text/html,x' }],
      ['invitation', { ...VALID_DATA.invitation, ctaUrl: 'javascript:alert(1)' }],
    ] as [PostTemplate, Record<string, unknown>][]) {
      const res = await editor.post('/api/admin/posts').send(body({ template, data }));
      expect(res.status, JSON.stringify(data)).toBe(400);
    }
  });

  it('rechaza plantilla desconocida, slug inválido y título vacío', async () => {
    const { editor } = await staffWorld();
    for (const bad of [
      { template: 'inventada' },
      { slug: 'Con Espacios' },
      { title: '   ' },
      { status: 'programada' },
      { category: 'noticia' },
    ]) {
      expect(
        (await editor.post('/api/admin/posts').send({ ...body(), ...bad })).status,
        JSON.stringify(bad),
      ).toBe(400);
    }
  });
});

describe('seguridad del contenido', () => {
  it('sanea todo el HTML al guardar', async () => {
    const { editor, app } = await staffWorld();
    await editor
      .post('/api/admin/posts')
      .send(
        body({
          data: {
            bodyHtml:
              '<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>',
          },
        }),
      )
      .expect(201);
    const detail = postDetailSchema.parse(
      (await request(app).get('/api/posts/mi-publicacion').expect(200)).body,
    );
    const html = String(detail.data['bodyHtml']);
    expect(html).toContain('<p>Hola</p>');
    expect(html).not.toMatch(/script|onerror|javascript:/i);
  });

  it('las imágenes de los datos y la miniatura solo pueden ser de Cloudinary', async () => {
    const { editor } = await staffWorld();
    const external = image('x', { url: 'https://evil.example.com/a.png' });
    const cases: PostInputPayload[] = [
      body({ template: 'featured_image', data: { ...VALID_DATA.featured_image, image: external } }),
      body({
        template: 'gallery',
        data: { images: [{ image: image('ok') }, { image: external }] },
      }),
      body({ thumbnail: external }),
    ];
    for (const payload of cases) {
      expect((await editor.post('/api/admin/posts').send(payload)).status).toBe(400);
    }
  });

  it('un libro inexistente da 404 y uno real se guarda', async () => {
    const { editor } = await staffWorld();
    expect(
      (await editor.post('/api/admin/posts').send(body({ bookId: '670000000000000000000099' })))
        .status,
    ).toBe(404);
    const book = await Book.create({ slug: 'l', title: 'L', order: 1, status: 'draft' });
    const res = await editor
      .post('/api/admin/posts')
      .send(body({ bookId: book._id.toString() }))
      .expect(201);
    expect(adminPostSchema.parse(res.body).bookId).toBe(book._id.toString());
  });
});

describe('editar y listar en el panel', () => {
  it('slug repetido = 409; PUT reemplaza (incluida la plantilla) y conserva la fecha original', async () => {
    const { editor } = await staffWorld();
    const first = adminPostSchema.parse(
      (await editor.post('/api/admin/posts').send(body()).expect(201)).body,
    );
    const dup = await editor.post('/api/admin/posts').send(body());
    expect(dup.status).toBe(409);

    // Cambia de plantilla: los datos nuevos se validan contra la nueva.
    const bad = await editor
      .put(`/api/admin/posts/${first.id}`)
      .send(body({ template: 'event', data: VALID_DATA.text }));
    expect(bad.status).toBe(400);
    const changed = adminPostSchema.parse(
      (
        await editor
          .put(`/api/admin/posts/${first.id}`)
          .send({
            ...body({ template: 'event', data: VALID_DATA.event, title: 'Ahora evento' }),
            publishedAt: undefined,
          })
          .expect(200)
      ).body,
    );
    expect(changed).toMatchObject({ template: 'event', title: 'Ahora evento', category: 'evento' });
    // Sin fecha nueva conserva la que ya tenía.
    expect(changed.publishedAt).toBe(first.publishedAt);
    expect(changed.eventAt).toBeDefined();
    // Y al volver a texto se quita la fecha del evento.
    const back = adminPostSchema.parse(
      (await editor.put(`/api/admin/posts/${first.id}`).send(body()).expect(200)).body,
    );
    expect(back.eventAt).toBeUndefined();
    await editor.put('/api/admin/posts/670000000000000000000001').send(body()).expect(404);
    await editor.get('/api/admin/posts/670000000000000000000001').expect(404);
  });

  it('al publicar sin fecha se pone la de ahora; un borrador sin fecha no la tiene', async () => {
    const { editor } = await staffWorld();
    const draft = adminPostSchema.parse(
      (
        await editor
          .post('/api/admin/posts')
          .send({ ...body({ status: 'draft' }), publishedAt: undefined })
          .expect(201)
      ).body,
    );
    expect(draft.publishedAt).toBeUndefined();
    const published = adminPostSchema.parse(
      (
        await editor
          .put(`/api/admin/posts/${draft.id}`)
          .send({ ...body(), publishedAt: undefined })
          .expect(200)
      ).body,
    );
    expect(Math.abs(Date.parse(published.publishedAt ?? '') - Date.now())).toBeLessThan(10_000);
  });

  it('filtra por estado, tipo y título; incluye borradores y archivadas', async () => {
    const { editor } = await staffWorld();
    const make = (slug: string, over: Partial<PostInputPayload>) =>
      editor
        .post('/api/admin/posts')
        .send(body({ slug, title: `Post ${slug}`, ...over }))
        .expect(201);
    await make('a', {});
    await make('b', { status: 'draft' });
    await make('c', { status: 'archived' });
    await make('d', { template: 'event', data: VALID_DATA.event, title: 'Feria del libro' });
    const list = async (qs: string) =>
      (await editor.get(`/api/admin/posts${qs}`).expect(200)).body.posts.map(
        (p: { slug: string }) => p.slug,
      ) as string[];
    expect((await list('')).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(await list('?status=draft')).toEqual(['b']);
    expect(await list('?status=archived')).toEqual(['c']);
    expect(await list('?category=evento')).toEqual(['d']);
    expect(await list('?q=feria')).toEqual(['d']);
    expect(await list('?q=.*')).toEqual([]);
  });
});

describe('GET /api/posts (público)', () => {
  async function seed() {
    const world = await staffWorld();
    const { editor } = world;
    const make = (slug: string, over: Partial<PostInputPayload>) =>
      editor
        .post('/api/admin/posts')
        .send(body({ slug, title: `T-${slug}`, ...over }))
        .expect(201);
    await make('vieja', { publishedAt: iso(-5 * DAY) });
    await make('evento', {
      template: 'event',
      data: VALID_DATA.event,
      publishedAt: iso(-3 * DAY),
      featured: true,
    });
    await make('invita', {
      template: 'invitation',
      data: VALID_DATA.invitation,
      publishedAt: iso(-2 * DAY),
    });
    await make('reciente', { publishedAt: iso(-1 * DAY), featured: true });
    await make('borrador', { status: 'draft' });
    await make('archivada', { status: 'archived' });
    await make('programada', { publishedAt: iso(2 * DAY) });
    return world;
  }
  const slugs = (res: request.Response) =>
    postListResponseSchema.parse(res.body).posts.map((p) => p.slug);

  it('solo publicadas con la fecha cumplida, de la más reciente a la más antigua, sin sesión', async () => {
    const { app } = await seed();
    const res = await request(app).get('/api/posts').expect(200);
    expect(slugs(res)).toEqual(['reciente', 'invita', 'evento', 'vieja']);
    expect(postListResponseSchema.parse(res.body)).toMatchObject({
      total: 4,
      page: 1,
      pageSize: 9,
    });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('las tarjetas no llevan datos internos: ni plantilla completa, ni estado, ni autora', async () => {
    const { app } = await seed();
    const text = JSON.stringify((await request(app).get('/api/posts')).body);
    expect(text).not.toMatch(/"data"|"status"|authorId|draft|archived|programada|borrador/);
  });

  it('filtra por tipo y por destacadas', async () => {
    const { app } = await seed();
    expect(slugs(await request(app).get('/api/posts?category=evento').expect(200))).toEqual([
      'evento',
    ]);
    expect(slugs(await request(app).get('/api/posts?category=invitacion').expect(200))).toEqual([
      'invita',
    ]);
    expect(slugs(await request(app).get('/api/posts?featured=true').expect(200))).toEqual([
      'reciente',
      'evento',
    ]);
    expect(slugs(await request(app).get('/api/posts?featured=false').expect(200))).toEqual([
      'invita',
      'vieja',
    ]);
    await request(app).get('/api/posts?category=otra').expect(400);
  });

  it('pagina con «cargar más» sin repetir ni saltar publicaciones', async () => {
    const { app } = await seed();
    const first = await request(app).get('/api/posts?pageSize=3&page=1').expect(200);
    const second = await request(app).get('/api/posts?pageSize=3&page=2').expect(200);
    expect(slugs(first)).toEqual(['reciente', 'invita', 'evento']);
    expect(slugs(second)).toEqual(['vieja']);
    expect(postListResponseSchema.parse(second.body).total).toBe(4);
    expect(slugs(await request(app).get('/api/posts?pageSize=3&page=3').expect(200))).toEqual([]);
    await request(app).get('/api/posts?pageSize=500').expect(400);
    await request(app).get('/api/posts?page=0').expect(400);
  });

  it('filtra por libro e incluye las de toda la saga', async () => {
    const { app, editor } = await seed();
    const book = await Book.create({ slug: 'l1', title: 'L1', order: 1, status: 'published' });
    const other = await Book.create({ slug: 'l2', title: 'L2', order: 2, status: 'published' });
    await editor
      .post('/api/admin/posts')
      .send(body({ slug: 'del-libro', bookId: book._id.toString(), publishedAt: iso(-100) }))
      .expect(201);
    await editor
      .post('/api/admin/posts')
      .send(body({ slug: 'del-otro', bookId: other._id.toString(), publishedAt: iso(-100) }))
      .expect(201);
    const list = slugs(await request(app).get(`/api/posts?bookId=${book._id}`).expect(200));
    expect(list).toContain('del-libro');
    expect(list).toContain('vieja'); // de toda la saga
    expect(list).not.toContain('del-otro');
  });

  it('el detalle trae los datos de la plantilla; borrador, archivada, programada e inexistente dan el mismo 404', async () => {
    const { app } = await seed();
    const ok = postDetailSchema.parse(
      (await request(app).get('/api/posts/evento').expect(200)).body,
    );
    expect(ok.template).toBe('event');
    expect(ok.data).toMatchObject({ venue: '[PLACEHOLDER] Librería' });
    const missing = await request(app).get('/api/posts/no-existe');
    expect(missing.status).toBe(404);
    for (const slug of ['borrador', 'archivada', 'programada']) {
      const res = await request(app).get(`/api/posts/${slug}`);
      expect(res.status, slug).toBe(404);
      expect(res.body).toEqual(missing.body);
    }
    await request(app).get('/api/posts/Con%20Espacios').expect(400);
  });

  it('una programada se vuelve visible cuando llega su fecha', async () => {
    const { app } = await seed();
    await request(app).get('/api/posts/programada').expect(404);
    await Post.updateOne(
      { slug: 'programada' },
      { $set: { publishedAt: new Date(Date.now() - 1000) } },
    );
    await request(app).get('/api/posts/programada').expect(200);
    expect(slugs(await request(app).get('/api/posts').expect(200))).toContain('programada');
  });
});
