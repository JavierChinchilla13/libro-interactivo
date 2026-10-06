import { apiErrorSchema, bookListResponseSchema, bookResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { image, staffWorld, validBook } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;

describe('permisos de /api/admin/books', () => {
  it('sin sesión 401, lector 403 y EDITOR/ADMIN permitidos en todas las operaciones', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    await request(app).get('/api/admin/books').expect(401);
    for (const res of [
      await reader.get('/api/admin/books'),
      await reader.post('/api/admin/books').send(validBook()),
      await reader.put('/api/admin/books/670000000000000000000001').send(validBook()),
    ]) {
      expect(res.status).toBe(403);
      expect(code(res)).toBe('FORBIDDEN');
    }
    expect(await Book.countDocuments()).toBe(0);
    await editor.get('/api/admin/books').expect(200);
    await admin.get('/api/admin/books').expect(200);
    await editor.post('/api/admin/books').send(validBook()).expect(201);
  });
});

describe('POST /api/admin/books', () => {
  it('crea el libro y devuelve el contrato completo', async () => {
    const { editor } = await staffWorld();
    const res = await editor
      .post('/api/admin/books')
      .send(
        validBook({
          tagline: '[PLACEHOLDER] lema',
          genres: ['ciencia ficción'],
          minAge: 16,
          cover: image('portada'),
          status: 'published',
          releaseDate: '2026-12-01',
          purchaseLinks: [
            { region: 'CR', kind: 'whatsapp', label: 'Envíos', url: 'https://wa.me/00000000' },
            {
              region: 'CR',
              kind: 'store',
              label: 'Compras presenciales',
              notes: '[PLACEHOLDER] sedes',
            },
            { region: 'INTL', kind: 'amazon', label: 'Amazon', url: 'https://www.amazon.com/dp/X' },
          ],
          theme: { primaryColor: '#444444', background: { type: 'color', color: '#f4f4f4' } },
        }),
      )
      .expect(201);
    const book = bookResponseSchema.parse(res.body);
    expect(book).toMatchObject({
      slug: 'libro-1',
      status: 'published',
      releaseDate: '2026-12-01',
      minAge: 16,
    });
    expect(book.purchaseLinks).toHaveLength(3);
    expect(book.purchaseLinks[1]?.url).toBeUndefined(); // «compras presenciales» no lleva enlace
  });

  it('sanea el HTML (sinopsis, advertencia y texto de las pestañas de la wiki)', async () => {
    const { editor } = await staffWorld();
    const res = await editor
      .post('/api/admin/books')
      .send(
        validBook({
          synopsis: '<p>Hola</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
          contentWarning: '<p onclick="alert(1)">Aviso</p>',
          wikiSections: [
            {
              kind: 'term',
              title: 'Glosario',
              order: 1,
              enabled: true,
              introHtml: '<a href="javascript:alert(1)">x</a>',
            },
          ],
        }),
      )
      .expect(201);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/<script|onerror|onclick|javascript:|alert\(1\)/);
    expect(bookResponseSchema.parse(res.body).synopsis).toBe('<p>Hola</p>');
    const stored = await Book.findOne().lean();
    expect(JSON.stringify(stored)).not.toMatch(/<script|onerror|onclick|javascript:/);
  });

  it('valida: slug, portada obligatoria para publicar, pestañas repetidas y colores', async () => {
    const { editor } = await staffWorld();
    const bad = [
      validBook({ slug: 'Libro Uno' }),
      validBook({ status: 'published' }), // sin portada
      validBook({ status: 'upcoming' }),
      validBook({
        wikiSections: [
          { kind: 'term', title: 'A', order: 1, enabled: true },
          { kind: 'term', title: 'B', order: 2, enabled: true },
        ],
      }),
      validBook({ theme: { background: { type: 'color', color: 'rojo' } } }),
      validBook({ order: 0 }),
      { ...validBook(), title: '' },
      { ...validBook(), theme: { background: { type: 'video' } } },
    ];
    for (const body of bad) {
      const res = await editor.post('/api/admin/books').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(code(res)).toBe('VALIDATION');
    }
    expect(await Book.countDocuments()).toBe(0);
  });

  it('rechaza portadas, fondos y mapas que no sean de Cloudinary', async () => {
    const { editor } = await staffWorld();
    const external = image('x', { url: 'https://malo.com/portada.png' });
    for (const body of [
      validBook({ cover: external }),
      validBook({ theme: { background: { type: 'image', image: external } } }),
      validBook({
        wikiSections: [
          { kind: 'place', title: 'Lugares', order: 1, enabled: true, mapImage: external },
        ],
      }),
    ]) {
      const res = await editor.post('/api/admin/books').send(body);
      expect(res.status).toBe(400);
    }
  });

  it('un slug repetido responde 409', async () => {
    const { editor } = await staffWorld();
    await editor.post('/api/admin/books').send(validBook()).expect(201);
    const again = await editor.post('/api/admin/books').send(validBook({ title: 'Otro' }));
    expect(again.status).toBe(409);
    expect(code(again)).toBe('CONFLICT');
  });

  it('no permite bloquear una pestaña con un quiz al crear (el libro aún no tiene quizzes)', async () => {
    const { editor } = await staffWorld();
    const res = await editor.post('/api/admin/books').send(
      validBook({
        wikiSections: [
          {
            kind: 'character',
            title: 'Personajes',
            order: 1,
            enabled: true,
            unlockAfter: { kind: 'quiz', refId: '670000000000000000000002' },
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET/PUT /api/admin/books', () => {
  it('lista todos los estados ordenados, obtiene uno y 404 si no existe', async () => {
    const { editor } = await staffWorld();
    await editor
      .post('/api/admin/books')
      .send(validBook({ slug: 'dos', order: 2 }))
      .expect(201);
    await editor
      .post('/api/admin/books')
      .send(validBook({ slug: 'uno', order: 1 }))
      .expect(201);
    const list = bookListResponseSchema.parse(
      (await editor.get('/api/admin/books').expect(200)).body,
    );
    expect(list.books.map((b) => b.slug)).toEqual(['uno', 'dos']);
    const id = list.books[0]!.id;
    expect(
      bookResponseSchema.parse((await editor.get(`/api/admin/books/${id}`).expect(200)).body).slug,
    ).toBe('uno');
    expect((await editor.get('/api/admin/books/670000000000000000000099')).status).toBe(404);
    expect((await editor.get('/api/admin/books/no-es-un-id')).status).toBe(400);
  });

  it('reemplaza los datos, quita los campos opcionales omitidos y archiva con status', async () => {
    const { editor } = await staffWorld();
    const created = bookResponseSchema.parse(
      (
        await editor
          .post('/api/admin/books')
          .send(validBook({ tagline: 'lema', isbn: '123', minAge: 16 }))
          .expect(201)
      ).body,
    );
    const res = await editor
      .put(`/api/admin/books/${created.id}`)
      .send(validBook({ title: 'Título nuevo', status: 'archived' }))
      .expect(200);
    const updated = bookResponseSchema.parse(res.body);
    expect(updated).toMatchObject({ title: 'Título nuevo', status: 'archived' });
    expect(updated.tagline).toBeUndefined();
    expect(updated.isbn).toBeUndefined();
    expect(updated.minAge).toBeUndefined();
    expect(await Book.countDocuments()).toBe(1); // se archiva, no se borra
  });

  it('PUT valida igual que POST y respeta el slug único', async () => {
    const { editor } = await staffWorld();
    const a = bookResponseSchema.parse(
      (await editor.post('/api/admin/books').send(validBook()).expect(201)).body,
    );
    await editor
      .post('/api/admin/books')
      .send(validBook({ slug: 'libro-2', order: 2 }))
      .expect(201);
    expect(
      (await editor.put(`/api/admin/books/${a.id}`).send(validBook({ status: 'published' })))
        .status,
    ).toBe(400);
    expect(
      (await editor.put(`/api/admin/books/${a.id}`).send(validBook({ slug: 'libro-2' }))).status,
    ).toBe(409);
    expect(
      (await editor.put('/api/admin/books/670000000000000000000099').send(validBook())).status,
    ).toBe(404);
  });

  it('el bloqueo de una pestaña solo puede apuntar a un quiz de este libro', async () => {
    const { editor, adminUser } = await staffWorld();
    const mine = await createBook({ slug: 'mio' });
    const other = await createBook({ slug: 'otro' });
    await Book.updateOne({ _id: other._id }, { order: 2 });
    const quizMine = await createQuiz({
      bookId: mine._id,
      order: 1,
      content: simpleContent(),
      publishedBy: adminUser._id,
    });
    const quizOther = await createQuiz({
      bookId: other._id,
      order: 1,
      content: simpleContent(),
      publishedBy: adminUser._id,
    });
    const section = (refId: string) => [
      {
        kind: 'character' as const,
        title: 'Personajes',
        order: 1,
        enabled: true,
        lockedMessage: '[PLACEHOLDER]',
        unlockAfter: { kind: 'quiz' as const, refId },
      },
    ];
    const url = `/api/admin/books/${mine._id.toString()}`;
    const body = (refId: string) => validBook({ slug: 'mio', wikiSections: section(refId) });

    expect((await editor.put(url).send(body(quizOther._id.toString()))).status).toBe(400);
    const ok = await editor.put(url).send(body(quizMine._id.toString())).expect(200);
    expect(bookResponseSchema.parse(ok.body).wikiSections[0]?.unlockAfter?.refId).toBe(
      quizMine._id.toString(),
    );
  });
});
