import {
  apiErrorSchema,
  extraResponseSchema,
  extraUploadUrlResponseSchema,
  progressResponseSchema,
  readerExtraResponseSchema,
  readerExtrasResponseSchema,
  type ExtraInputPayload,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Extra } from '../models/Extra.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { UserProgress } from '../models/UserProgress.js';
import { staffWorld } from '../test-utils/admin.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { playQuizToEnd } from '../test-utils/quizPlay.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;

async function world() {
  const w = await staffWorld();
  const book = await createBook();
  const bookId = book._id.toString();
  const quiz1 = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent(),
    publishedBy: w.adminUser._id,
  });
  const quiz2 = await createQuiz({
    bookId: book._id,
    order: 2,
    content: simpleContent(),
    publishedBy: w.adminUser._id,
  });

  const text = (over: Partial<ExtraInputPayload> = {}): ExtraInputPayload => ({
    bookId,
    slug: 'capitulo-extra-1',
    title: '[PLACEHOLDER] Capítulo extra 1',
    kind: 'text',
    bodyHtml: '<p>[PLACEHOLDER] Texto del extra</p>',
    status: 'published',
    ...over,
  });
  /** Simula la subida (el navegador sube directo al almacenamiento) y devuelve el `file` para guardar el extra. */
  const upload = (name: string, mime = 'application/pdf', size = 1000) => {
    const storageKey = `extras/${bookId}/${name}`;
    w.storage.putObject({ key: storageKey, mime, size });
    return { storageKey, mime, size, originalName: `${name}.pdf` };
  };
  const reader = w.reader;
  const finishBook = async () => {
    await playQuizToEnd(reader, quiz1._id.toString());
    await playQuizToEnd(reader, quiz2._id.toString());
  };
  return { ...w, book, bookId, quiz1, quiz2, text, upload, reader, finishBook };
}

describe('permisos de /api/admin/extras', () => {
  it('sin sesión 401; lectora 403; editora y administradora permitidas', async () => {
    const { app, reader, editor, admin, bookId, text } = await world();
    await request(app).get('/api/admin/extras').query({ bookId }).expect(401);
    expect((await reader.get('/api/admin/extras').query({ bookId })).status).toBe(403);
    expect((await reader.post('/api/admin/extras').send(text())).status).toBe(403);
    expect(
      (
        await reader
          .post('/api/admin/extras/upload-url')
          .send({ bookId, kind: 'pdf', filename: 'a.pdf', mime: 'application/pdf', size: 10 })
      ).status,
    ).toBe(403);
    expect(await Extra.countDocuments()).toBe(0);
    await editor.get('/api/admin/extras').query({ bookId }).expect(200);
    await admin.post('/api/admin/extras').send(text()).expect(201);
  });
});

describe('subida al almacenamiento privado', () => {
  const body = (bookId: string, over: Record<string, unknown> = {}) => ({
    bookId,
    kind: 'pdf',
    filename: 'capitulo.pdf',
    mime: 'application/pdf',
    size: 5_000_000,
    ...over,
  });

  it('entrega un permiso de subida con clave dentro del libro y cabeceras firmadas', async () => {
    const { editor, bookId } = await world();
    const res = await editor.post('/api/admin/extras/upload-url').send(body(bookId)).expect(200);
    const upload = extraUploadUrlResponseSchema.parse(res.body);
    expect(upload.storageKey).toMatch(new RegExp(`^extras/${bookId}/[A-Za-z0-9_-]+\\.pdf$`));
    expect(upload.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(upload.maxBytes).toBe(25 * 1024 * 1024);
    expect(res.headers['cache-control']).toBe('no-store');
    // Dos permisos nunca comparten clave (no se pisan archivos).
    const other = extraUploadUrlResponseSchema.parse(
      (await editor.post('/api/admin/extras/upload-url').send(body(bookId)).expect(200)).body,
    );
    expect(other.storageKey).not.toBe(upload.storageKey);
  });

  it('rechaza tipos no permitidos, tamaños excesivos, libros inexistentes y cuerpos inválidos', async () => {
    const { editor, bookId } = await world();
    const post = (b: object) => editor.post('/api/admin/extras/upload-url').send(b);
    expect((await post(body(bookId, { mime: 'text/html' }))).status).toBe(400);
    expect((await post(body(bookId, { mime: 'application/x-msdownload' }))).status).toBe(400);
    expect((await post(body(bookId, { kind: 'image', mime: 'application/pdf' }))).status).toBe(400);
    expect((await post(body(bookId, { size: 26 * 1024 * 1024 }))).status).toBe(400);
    expect(
      (await post(body(bookId, { kind: 'image', mime: 'image/png', size: 11 * 1024 * 1024 })))
        .status,
    ).toBe(400);
    expect((await post(body('670000000000000000000099'))).status).toBe(404);
    expect((await post({ ...body(bookId), kind: 'text' })).status).toBe(400);
    expect((await post({ bookId })).status).toBe(400);
  });
});

describe('crear y reemplazar extras', () => {
  it('un extra de texto se guarda con el HTML saneado y exige el texto', async () => {
    const { editor, text } = await world();
    const res = await editor
      .post('/api/admin/extras')
      .send(text({ bodyHtml: '<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(1)>' }))
      .expect(201);
    const extra = extraResponseSchema.parse(res.body);
    expect(extra).toMatchObject({ kind: 'text', status: 'published', bodyHtml: '<p>Hola</p>' });
    expect(extra.publishedAt).toBeDefined();
    expect(JSON.stringify(await Extra.findById(extra.id).lean())).not.toMatch(/script|onerror/);

    expect(
      (await editor.post('/api/admin/extras').send(text({ slug: 'vacio', bodyHtml: '  ' }))).status,
    ).toBe(400);
    expect(
      (
        await editor
          .post('/api/admin/extras')
          .send({ ...text({ slug: 'sin' }), bodyHtml: undefined })
      ).status,
    ).toBe(400);
  });

  it('un PDF exige que el archivo ya esté subido, sea de este libro y cumpla tipo y tamaño', async () => {
    const { editor, bookId, text, upload, storage } = await world();
    const pdf = (file: object, slug = 'pdf-1') => ({
      ...text({ slug, kind: 'pdf' }),
      bodyHtml: undefined,
      file,
    });

    const ok = await editor
      .post('/api/admin/extras')
      .send(pdf(upload('a.pdf')))
      .expect(201);
    expect(extraResponseSchema.parse(ok.body).file?.storageKey).toBe(`extras/${bookId}/a.pdf`);

    expect(
      (
        await editor
          .post('/api/admin/extras')
          .send({ ...text({ slug: 'p2', kind: 'pdf' }), bodyHtml: undefined })
      ).status,
    ).toBe(400); // sin archivo
    const notUploaded = await editor.post('/api/admin/extras').send(
      pdf(
        {
          storageKey: `extras/${bookId}/fantasma.pdf`,
          mime: 'application/pdf',
          size: 10,
          originalName: 'x.pdf',
        },
        'p3',
      ),
    );
    expect(notUploaded.status).toBe(400);
    // Un archivo REAL (ya subido) pero de otro libro: se rechaza por pertenecer a otro prefijo.
    storage.putObject({
      key: 'extras/670000000000000000000099/a.pdf',
      mime: 'application/pdf',
      size: 10,
    });
    const otherBook = await editor.post('/api/admin/extras').send(
      pdf(
        {
          storageKey: 'extras/670000000000000000000099/a.pdf',
          mime: 'application/pdf',
          size: 10,
          originalName: 'x.pdf',
        },
        'p4',
      ),
    );
    expect(otherBook.status).toBe(400);

    // Lo que se subió no es lo que se dijo: se rechaza y se borra el objeto del almacenamiento.
    const sneaky = upload('malo.pdf', 'text/html');
    const wrong = await editor
      .post('/api/admin/extras')
      .send(pdf({ ...sneaky, mime: 'application/pdf' }, 'p5'));
    expect(wrong.status).toBe(400);
    expect(storage.objects.has(sneaky.storageKey)).toBe(false);
    const huge = upload('enorme.pdf', 'application/pdf', 30 * 1024 * 1024);
    expect((await editor.post('/api/admin/extras').send(pdf(huge, 'p6'))).status).toBe(400);
    expect(storage.objects.has(huge.storageKey)).toBe(false);
    expect(await Extra.countDocuments()).toBe(1);
  });

  it('slug repetido 409; el tipo y el libro no cambian; reemplazar el archivo borra el anterior', async () => {
    const { editor, text, upload, storage, bookId } = await world();
    const first = extraResponseSchema.parse(
      (await editor.post('/api/admin/extras').send(text()).expect(201)).body,
    );
    const dup = await editor.post('/api/admin/extras').send(text({ title: 'Otro' }));
    expect(dup.status).toBe(409);
    expect(code(dup)).toBe('CONFLICT');

    expect(
      (
        await editor
          .put(`/api/admin/extras/${first.id}`)
          .send({ ...text(), kind: 'pdf', bodyHtml: undefined, file: upload('x.pdf') })
      ).status,
    ).toBe(400);
    expect(
      (
        await editor
          .put(`/api/admin/extras/${first.id}`)
          .send(text({ bookId: '670000000000000000000099' }))
      ).status,
    ).toBe(400);

    const pdf = (file: object) => ({
      ...text({ slug: 'con-archivo', kind: 'pdf' }),
      bodyHtml: undefined,
      file,
    });
    const created = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send(pdf(upload('v1.pdf')))
          .expect(201)
      ).body,
    );
    const next = upload('v2.pdf');
    const replaced = extraResponseSchema.parse(
      (await editor.put(`/api/admin/extras/${created.id}`).send(pdf(next)).expect(200)).body,
    );
    expect(replaced.file?.storageKey).toBe(`extras/${bookId}/v2.pdf`);
    expect(storage.objects.has(`extras/${bookId}/v1.pdf`)).toBe(false);
    expect(storage.objects.has(next.storageKey)).toBe(true);
  });

  it('lista por libro, obtiene uno, responde 404/400 y la edición conserva la fecha de publicación', async () => {
    const { editor, text, bookId } = await world();
    const a = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send(text({ order: 2 }))
          .expect(201)
      ).body,
    );
    await editor
      .post('/api/admin/extras')
      .send(text({ slug: 'otro', order: 1, status: 'draft' }))
      .expect(201);
    const list = await editor.get('/api/admin/extras').query({ bookId }).expect(200);
    expect((list.body as { extras: { slug: string }[] }).extras.map((e) => e.slug)).toEqual([
      'otro',
      'capitulo-extra-1',
    ]); // por orden
    expect((await editor.get('/api/admin/extras/670000000000000000000099')).status).toBe(404);
    expect((await editor.get('/api/admin/extras/no')).status).toBe(400);
    const edited = extraResponseSchema.parse(
      (
        await editor
          .put(`/api/admin/extras/${a.id}`)
          .send(text({ title: 'Nuevo título', order: 2 }))
          .expect(200)
      ).body,
    );
    expect(edited.publishedAt).toBe(a.publishedAt);
    expect((await editor.get('/api/admin/extras')).status).toBe(400);
  });

  it('la vista previa de la autora funciona sin haber completado el libro y NO registra «visto»', async () => {
    const { editor, text, upload } = await world();
    const t = extraResponseSchema.parse(
      (await editor.post('/api/admin/extras').send(text()).expect(201)).body,
    );
    const pdf = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send({ ...text({ slug: 'p', kind: 'pdf' }), bodyHtml: undefined, file: upload('p.pdf') })
          .expect(201)
      ).body,
    );
    const textPreview = await editor.get(`/api/admin/extras/${t.id}/preview`).expect(200);
    expect(textPreview.body).toMatchObject({
      kind: 'text',
      bodyHtml: '<p>[PLACEHOLDER] Texto del extra</p>',
    });
    const pdfPreview = await editor.get(`/api/admin/extras/${pdf.id}/preview`).expect(200);
    expect(pdfPreview.body).toMatchObject({ kind: 'pdf', mime: 'application/pdf', expiresIn: 300 });
    expect(pdfPreview.headers['cache-control']).toBe('no-store');
    expect(await ExtraAccess.countDocuments()).toBe(0);
  });
});

describe('bookCompletedAt: se fija una sola vez al completar todos los quizzes publicados', () => {
  const completedAt = async (userEmail = 'usuario@ejemplo.com') => {
    const user = await (
      await import('../models/User.js')
    ).User.findOne({ emailNormalized: userEmail }).lean();
    return (await UserProgress.findOne({ userId: user?._id }).lean())?.bookCompletedAt;
  };

  it('no se fija con la mitad, sí al terminar el último, y no cambia si se repite un quiz', async () => {
    const { reader, quiz1, quiz2 } = await world();
    await playQuizToEnd(reader, quiz1._id.toString());
    expect(await completedAt()).toBeUndefined();
    await playQuizToEnd(reader, quiz2._id.toString());
    const first = await completedAt();
    expect(first).toBeInstanceOf(Date);
    await playQuizToEnd(reader, quiz1._id.toString()); // repetir
    expect((await completedAt())?.getTime()).toBe(first?.getTime());
  });

  it('no se revierte si después se agrega otro quiz, y /me/progress lo refleja', async () => {
    const { reader, finishBook, book, adminUser, bookId } = await world();
    await finishBook();
    const first = await completedAt();
    await createQuiz({
      bookId: book._id,
      order: 3,
      content: simpleContent(),
      publishedBy: adminUser._id,
    });
    expect((await completedAt())?.getTime()).toBe(first?.getTime());
    const progress = progressResponseSchema.parse(
      (await reader.get('/api/me/progress').query({ bookId }).expect(200)).body,
    );
    expect(progress.bookCompleted).toBe(true);
    expect(progress.experiences.map((e) => e.status)).toEqual([
      'completed',
      'completed',
      'available',
    ]);
  });

  it('los quizzes sin publicar no cuentan y el modo prueba (editoras) no completa el libro', async () => {
    const { reader, quiz1, quiz2, book, editor, editorUser } = await world();
    await createQuiz({ bookId: book._id, order: 3, content: simpleContent() }); // borrador: no se exige
    await playQuizToEnd(reader, quiz1._id.toString());
    await playQuizToEnd(reader, quiz2._id.toString());
    expect(await completedAt()).toBeInstanceOf(Date);

    await playQuizToEnd(editor, quiz1._id.toString());
    await playQuizToEnd(editor, quiz2._id.toString());
    expect(await UserProgress.countDocuments({ userId: editorUser._id })).toBe(0);
  });
});

describe('extras para el lector', () => {
  it('con el libro incompleto solo dice «bloqueado»: ni títulos ni cantidad', async () => {
    const { reader, text, editor, bookId, quiz1 } = await world();
    const extra = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send(text({ title: 'TITULO-SECRETO' }))
          .expect(201)
      ).body,
    );
    const listed = await reader.get('/api/extras').query({ bookId }).expect(200);
    expect(readerExtrasResponseSchema.parse(listed.body)).toEqual({ locked: true });
    expect(JSON.stringify(listed.body)).not.toMatch(/SECRETO|extras/);

    await playQuizToEnd(reader, quiz1._id.toString()); // falta el quiz 2
    expect(
      readerExtrasResponseSchema.parse(
        (await reader.get('/api/extras').query({ bookId }).expect(200)).body,
      ),
    ).toEqual({ locked: true });

    const open = await reader.get(`/api/extras/${extra.id}`);
    expect(open.status).toBe(403);
    expect(code(open)).toBe('NOT_UNLOCKED');
    expect(JSON.stringify(open.body)).not.toMatch(/SECRETO|Texto del extra|url/);
    expect(await ExtraAccess.countDocuments()).toBe(0);
  });

  it('exige sesión y valida los parámetros; un libro sin publicar o inexistente da 404', async () => {
    const { app, reader, bookId, book } = await world();
    await request(app).get('/api/extras').query({ bookId }).expect(401);
    await request(app).get('/api/extras/670000000000000000000001').expect(401);
    expect((await reader.get('/api/extras')).status).toBe(400);
    expect((await reader.get('/api/extras/no')).status).toBe(400);
    expect(
      (await reader.get('/api/extras').query({ bookId: '670000000000000000000099' })).status,
    ).toBe(404);
    await book.updateOne({ status: 'draft' });
    expect((await reader.get('/api/extras').query({ bookId })).status).toBe(404);
  });

  it('al completar el libro aparecen SOLO los publicados, en orden, y «abierto» cambia al abrir cada uno', async () => {
    const { reader, editor, text, upload, bookId, finishBook } = await world();
    const txt = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send(text({ order: 2 }))
          .expect(201)
      ).body,
    );
    const pdf = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send({
            ...text({ slug: 'pdf', kind: 'pdf', title: 'Un PDF', order: 1 }),
            bodyHtml: undefined,
            file: upload('x.pdf'),
          })
          .expect(201)
      ).body,
    );
    await editor
      .post('/api/admin/extras')
      .send(text({ slug: 'borrador', status: 'draft', title: 'BORRADOR' }))
      .expect(201);
    await editor
      .post('/api/admin/extras')
      .send(text({ slug: 'archivado', status: 'archived', title: 'ARCHIVADO' }))
      .expect(201);
    await finishBook();

    const read = async () => {
      const parsed = readerExtrasResponseSchema.parse(
        (await reader.get('/api/extras').query({ bookId }).expect(200)).body,
      );
      if (parsed.locked) throw new Error('Debía estar abierto');
      return parsed.extras;
    };
    const before = await read();
    expect(before.map((e) => [e.title, e.opened])).toEqual([
      ['Un PDF', false],
      ['[PLACEHOLDER] Capítulo extra 1', false],
    ]);
    expect(JSON.stringify(before)).not.toMatch(/BORRADOR|ARCHIVADO|storageKey|bodyHtml|extras\//);

    await reader.get(`/api/extras/${txt.id}`).expect(200);
    expect((await read()).map((e) => e.opened)).toEqual([false, true]);
    await reader.get(`/api/extras/${pdf.id}`).expect(200);
    expect((await read()).map((e) => e.opened)).toEqual([true, true]);
  });

  it('abrir un texto devuelve el HTML y un PDF/imagen una URL firmada de pocos minutos; registra «visto»', async () => {
    const { reader, editor, text, upload, finishBook, storage, bookId } = await world();
    const txt = extraResponseSchema.parse(
      (await editor.post('/api/admin/extras').send(text()).expect(201)).body,
    );
    const pdf = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send({
            ...text({ slug: 'pdf', kind: 'pdf', title: 'Un PDF' }),
            bodyHtml: undefined,
            file: upload('doc.pdf'),
          })
          .expect(201)
      ).body,
    );
    const img = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send({
            ...text({ slug: 'img', kind: 'image', title: 'Una imagen' }),
            bodyHtml: undefined,
            file: { ...upload('foto.png', 'image/png'), originalName: 'foto.png' },
          })
          .expect(201)
      ).body,
    );
    await finishBook();

    const t = await reader.get(`/api/extras/${txt.id}`).expect(200);
    expect(readerExtraResponseSchema.parse(t.body)).toEqual({
      kind: 'text',
      title: '[PLACEHOLDER] Capítulo extra 1',
      bodyHtml: '<p>[PLACEHOLDER] Texto del extra</p>',
    });
    expect(t.headers['cache-control']).toBe('no-store');

    const p = readerExtraResponseSchema.parse(
      (await reader.get(`/api/extras/${pdf.id}`).expect(200)).body,
    );
    if (p.kind !== 'pdf') throw new Error('Debía ser un PDF');
    expect(p).toMatchObject({ mime: 'application/pdf', expiresIn: 180 });
    expect(p.url).toContain(encodeURIComponent(`extras/${bookId}/doc.pdf`));
    expect(p.url).toContain('ttl=180'); // vida corta
    const i = readerExtraResponseSchema.parse(
      (await reader.get(`/api/extras/${img.id}`).expect(200)).body,
    );
    expect(i).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(storage.objects.size).toBeGreaterThan(0);

    const seen = await ExtraAccess.find().lean();
    expect(seen).toHaveLength(3);
    await reader.get(`/api/extras/${pdf.id}`).expect(200);
    const again = await ExtraAccess.findOne({ extraId: pdf.id }).lean();
    expect(again?.viewCount).toBe(2);
    expect(again?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(again?.firstSeenAt.getTime() ?? 0);
    expect(await ExtraAccess.countDocuments({ extraId: pdf.id })).toBe(1);
  });

  it('un extra en borrador o archivado da 404 aunque se haya completado el libro', async () => {
    const { reader, editor, text, finishBook } = await world();
    const draft = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send(text({ status: 'draft' }))
          .expect(201)
      ).body,
    );
    const archived = extraResponseSchema.parse(
      (
        await editor
          .post('/api/admin/extras')
          .send(text({ slug: 'a', status: 'archived' }))
          .expect(201)
      ).body,
    );
    await finishBook();
    expect((await reader.get(`/api/extras/${draft.id}`)).status).toBe(404);
    expect((await reader.get(`/api/extras/${archived.id}`)).status).toBe(404);
    expect((await reader.get('/api/extras/670000000000000000000099')).status).toBe(404);
  });

  it('el acceso es por persona: quien no completó el libro recibe 403 aunque otra sí lo hizo', async () => {
    const { app, reader, editor, text, finishBook } = await world();
    const extra = extraResponseSchema.parse(
      (await editor.post('/api/admin/extras').send(text()).expect(201)).body,
    );
    await finishBook();
    await reader.get(`/api/extras/${extra.id}`).expect(200);
    await createUser({ email: 'otra@ejemplo.com' });
    const other = await loginAgent(app, 'otra@ejemplo.com');
    expect((await other.get(`/api/extras/${extra.id}`)).status).toBe(403);
  });

  it('las editoras NO ven los extras por la ruta del lector sin completar el libro (para eso está la vista previa)', async () => {
    const { editor, text, bookId } = await world();
    const extra = extraResponseSchema.parse(
      (await editor.post('/api/admin/extras').send(text()).expect(201)).body,
    );
    expect((await editor.get(`/api/extras/${extra.id}`)).status).toBe(403);
    expect(
      readerExtrasResponseSchema.parse(
        (await editor.get('/api/extras').query({ bookId }).expect(200)).body,
      ),
    ).toEqual({ locked: true });
  });
});
