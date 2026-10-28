import {
  apiErrorSchema,
  quizAppearanceResponseSchema,
  quizDetailResponseSchema,
  type QuizAppearanceInput,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;

const image = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: `Fondo ${name}`,
});
const appearance = (
  name = 'uno',
  extra: Partial<QuizAppearanceInput> = {},
): QuizAppearanceInput => ({
  background: { kind: 'image', image: image(name) },
  ...extra,
});
const video = {
  provider: 'cloudinary' as const,
  publicId: 'libro/quiz-bg/v',
  url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/v.mp4',
  width: 1280,
  height: 720,
  durationSeconds: 8,
  posterUrl: 'https://res.cloudinary.com/demo/video/upload/so_0/libro/quiz-bg/v.jpg',
  alt: 'Niebla sobre una ciudad',
};

async function world() {
  const w = await staffWorld();
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz de prueba' }),
    publishedBy: w.adminUser._id,
  });
  const url = `/api/admin/quizzes/${quiz.id}/appearance`;
  return { ...w, book, quiz, url };
}

describe('permisos de /api/admin/quizzes/:id/appearance', () => {
  it('sin sesión 401; lectora 403 en todas las operaciones; EDITOR y ADMIN 200', async () => {
    const { app, reader, editor, admin, url, quiz } = await world();
    const body = { appearance: appearance(), expectedRev: 0 };
    for (const res of [
      await request(app).get(url),
      await request(app).get(`${url}/history`),
      await request(app).put(url).send(body),
      await request(app).post(`${url}/revert`).send({ rev: 1, expectedRev: 1 }),
    ]) {
      expect(res.status).toBe(401);
      expect(code(res)).toBe('UNAUTHENTICATED');
    }
    for (const res of [
      await reader.get(url),
      await reader.get(`${url}/history`),
      await reader.put(url).send(body),
      await reader.post(`${url}/revert`).send({ rev: 1, expectedRev: 1 }),
    ]) {
      expect(res.status).toBe(403);
      expect(code(res)).toBe('FORBIDDEN');
    }
    // La lectora no cambió nada.
    expect((await Quiz.findById(quiz.id).lean())?.appearance).toBeUndefined();

    await editor.get(url).expect(200);
    await editor.get(`${url}/history`).expect(200);
    await editor.put(url).send(body).expect(200);
    await admin
      .put(url)
      .send({ appearance: appearance('dos'), expectedRev: 1 })
      .expect(200);
    await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 2 }).expect(200);
    await admin.get(url).expect(200);
  });
});

describe('GET y PUT de la apariencia', () => {
  it('un quiz sin apariencia responde vacío; guardar devuelve el estado, la revisión y el historial', async () => {
    const { editor, editorUser, url } = await world();
    const empty = quizAppearanceResponseSchema.parse((await editor.get(url).expect(200)).body);
    expect(empty).toEqual({ appearance: null, rev: 0, history: [], warnings: [] });

    const res = await editor
      .put(url)
      .send({
        appearance: appearance('uno', { accent: 'accent', introHtml: '<p>Una niebla espesa.</p>' }),
        expectedRev: 0,
      })
      .expect(200);
    const saved = quizAppearanceResponseSchema.parse(res.body);
    expect(saved.rev).toBe(1);
    expect(saved.appearance).toMatchObject({
      accent: '#a89bff',
      introHtml: '<p>Una niebla espesa.</p>',
    });
    expect(saved.history[0]).toMatchObject({
      rev: 1,
      action: 'seed',
      by: { id: String(editorUser._id), name: expect.any(String) },
    });
    // Se lee igual después.
    expect(quizAppearanceResponseSchema.parse((await editor.get(url)).body)).toEqual(saved);
  });

  it('el detalle del quiz en el editor trae la apariencia y su revisión', async () => {
    const { editor, quiz, url } = await world();
    await editor.put(url).send({ appearance: appearance(), expectedRev: 0 }).expect(200);
    const detail = quizDetailResponseSchema.parse(
      (await editor.get(`/api/admin/quizzes/${quiz.id}`).expect(200)).body,
    );
    expect(detail.appearanceRev).toBe(1);
    expect(detail.appearance?.background).toMatchObject({ kind: 'image' });
  });

  it('quitar el fondo es guardar la apariencia sin `background`', async () => {
    const { editor, url } = await world();
    await editor.put(url).send({ appearance: appearance(), expectedRev: 0 }).expect(200);
    const res = await editor
      .put(url)
      .send({ appearance: { accent: 'success' }, expectedRev: 1 })
      .expect(200);
    const body = quizAppearanceResponseSchema.parse(res.body);
    expect(body.appearance?.background).toBeUndefined();
    expect(body.history[0]?.changed).toEqual(['background', 'accent']);
  });

  it('sanea el texto de introducción (regla 7)', async () => {
    const { editor, url, quiz } = await world();
    const res = await editor
      .put(url)
      .send({
        appearance: appearance('uno', {
          introHtml: '<p onclick="x()">Hola</p><script>alert(1)</script>',
        }),
        expectedRev: 0,
      })
      .expect(200);
    expect(res.body.appearance.introHtml).toBe('<p>Hola</p>');
    expect(JSON.stringify((await Quiz.findById(quiz.id).lean())?.appearance)).not.toMatch(
      /script|onclick/,
    );
  });

  it('avisa sin bloquear si el texto nombra un resultado', async () => {
    const { editor, url, quiz } = await world();
    const results = (await Quiz.findById(quiz.id).lean())?.draft?.results as { title: string }[];
    const res = await editor
      .put(url)
      .send({
        appearance: appearance('uno', {
          introHtml: `<p>Eres de los de «${results[0]!.title}»</p>`,
        }),
        expectedRev: 0,
      })
      .expect(200);
    expect(res.body.warnings).toEqual(['APPEARANCE_MENTIONS_RESULT']);
  });
});

describe('validación (Zod en la ruta)', () => {
  /** Cada cuerpo debe dar 400 VALIDATION y no dejar rastro en el quiz (se reutiliza el mismo mundo). */
  const expectAllRejected = async (bodies: unknown[]) => {
    const { editor, url, quiz } = await world();
    for (const body of bodies) {
      const res = await editor.put(url).send(body as object);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(code(res)).toBe('VALIDATION');
    }
    const stored = await Quiz.findById(quiz.id).lean();
    expect(stored?.appearance).toBeUndefined();
    expect(stored?.appearanceRev ?? 0).toBe(0);
    expect(stored?.appearanceHistory ?? []).toHaveLength(0);
  };

  it('rechaza un fondo sin texto alternativo', async () => {
    await expectAllRejected([
      {
        appearance: { background: { kind: 'image', image: { ...image('x'), alt: '' } } },
        expectedRev: 0,
      },
      {
        appearance: { background: { kind: 'video', video: { ...video, alt: '   ' } } },
        expectedRev: 0,
      },
    ]);
  });

  it('rechaza una intensidad fuera de rango y el modo manual por debajo del piso 0,78', async () => {
    await expectAllRejected([
      { appearance: { overlay: { mode: 'auto', strength: 0.3 } }, expectedRev: 0 },
      { appearance: { overlay: { mode: 'auto', strength: 0.95 } }, expectedRev: 0 },
      { appearance: { overlay: { mode: 'manual', strength: 0.6 } }, expectedRev: 0 },
    ]);
  });

  it('el acento es un color libre #RRGGBB: se guarda en minúsculas; un nombre antiguo queda como su hex', async () => {
    const { editor, url } = await world();
    const free = await editor
      .put(url)
      .send({ appearance: { accent: '#FF8FB1' }, expectedRev: 0 })
      .expect(200);
    expect(free.body.appearance.accent).toBe('#ff8fb1');
    const legacy = await editor
      .put(url)
      .send({ appearance: { accent: 'success' }, expectedRev: 1 })
      .expect(200);
    expect(legacy.body.appearance.accent).toBe('#5fe3ae');
    // Guardar el mismo color con su nombre antiguo no se cuenta como cambio de acento.
    const same = await editor
      .put(url)
      .send({ appearance: { accent: '#5FE3AE', introHtml: '<p>Hola</p>' }, expectedRev: 2 })
      .expect(200);
    expect(same.body.history[0].changed).toEqual(['introHtml']);
  });

  it('rechaza un acento que no es #RRGGBB (nombres de color, funciones CSS, abreviaturas)', async () => {
    await expectAllRejected(
      ['red', '#fff', '#ff00', 'ff0000', 'rgb(1,2,3)', '#ff0000;color:red', 'url(x)', ''].map(
        (accent) => ({ appearance: { accent }, expectedRev: 0 }),
      ),
    );
  });

  it('rechaza un video sin póster o de más de 12 s', async () => {
    const { posterUrl: _poster, ...withoutPoster } = video;
    await expectAllRejected([
      { appearance: { background: { kind: 'video', video: withoutPoster } }, expectedRev: 0 },
      {
        appearance: { background: { kind: 'video', video: { ...video, durationSeconds: 13 } } },
        expectedRev: 0,
      },
    ]);
  });

  it('rechaza lo que cambia el significado del quiz (título, preguntas, reintentos, resultKey…)', async () => {
    await expectAllRejected(
      [
        { title: 'Otro título' },
        { stages: [] },
        { results: [] },
        { settings: { allowRetake: false } },
        { allowRetake: false },
        { resultKey: 'r1' },
        { instructionsHtml: '<p>x</p>' },
      ].map((forbidden) => ({ appearance: { ...appearance(), ...forbidden }, expectedRev: 0 })),
    );
  });

  it('rechaza una imagen, un póster o una portada que no son de Cloudinary', async () => {
    const outside = { ...image('x'), url: 'https://ejemplo.com/fondo.jpg' };
    await expectAllRejected(
      [
        { background: { kind: 'image', image: outside } },
        { cover: outside },
        {
          background: {
            kind: 'video',
            video: { ...video, posterUrl: 'https://ejemplo.com/p.jpg' },
          },
        },
        {
          background: {
            kind: 'video',
            video: { ...video, url: 'http://res.cloudinary.com/demo/v.mp4' },
          },
        },
      ].map((bad) => ({ appearance: bad, expectedRev: 0 })),
    );
  });

  it('pide la revisión que se vio y un identificador de quiz válido', async () => {
    const { editor, url } = await world();
    expect((await editor.put(url).send({ appearance: appearance() })).status).toBe(400);
    expect((await editor.put(url).send({ appearance: appearance(), expectedRev: -1 })).status).toBe(
      400,
    );
    const res = await editor
      .put('/api/admin/quizzes/no-es-un-id/appearance')
      .send({ appearance: appearance(), expectedRev: 0 });
    expect(res.status).toBe(400);
  });

  it('un quiz que no existe da 404', async () => {
    const { editor } = await world();
    const res = await editor
      .put('/api/admin/quizzes/670000000000000000000099/appearance')
      .send({ appearance: appearance(), expectedRev: 0 });
    expect(res.status).toBe(404);
    expect(code(res)).toBe('NOT_FOUND');
  });
});

describe('concurrencia y archivado', () => {
  it('con una revisión vieja responde 409 y no cambia nada', async () => {
    const { editor, admin, url } = await world();
    await editor
      .put(url)
      .send({ appearance: appearance('uno'), expectedRev: 0 })
      .expect(200);
    const res = await admin.put(url).send({ appearance: appearance('dos'), expectedRev: 0 });
    expect(res.status).toBe(409);
    expect(code(res)).toBe('CONFLICT');
    const now = quizAppearanceResponseSchema.parse((await editor.get(url)).body);
    expect(now.rev).toBe(1);
    expect(now.appearance?.background).toMatchObject({ image: { publicId: 'libro/quiz-bg/uno' } });
  });

  it('un quiz archivado no se puede editar ni revertir (409), pero se puede leer', async () => {
    const { editor, url, quiz } = await world();
    await editor.put(url).send({ appearance: appearance(), expectedRev: 0 }).expect(200);
    await editor.post(`/api/admin/quizzes/${quiz.id}/archive`).expect(200);
    for (const res of [
      await editor.put(url).send({ appearance: appearance('dos'), expectedRev: 1 }),
      await editor.post(`${url}/revert`).send({ rev: 1, expectedRev: 1 }),
    ]) {
      expect(res.status).toBe(409);
      expect(code(res)).toBe('CONFLICT');
    }
    await editor.get(url).expect(200);
  });
});

describe('la apariencia no toca las versiones (regla 5)', () => {
  it('guardar y revertir no crean ninguna versión ni cambian el hash ni marcan cambios sin publicar', async () => {
    const { editor, url, quiz } = await world();
    const detailUrl = `/api/admin/quizzes/${quiz.id}`;
    const before = quizDetailResponseSchema.parse((await editor.get(detailUrl)).body);
    const versions = await QuizVersion.countDocuments({ quizId: quiz._id });
    const hash = (await QuizVersion.findOne({ quizId: quiz._id }).lean())?.contentHash;

    await editor
      .put(url)
      .send({
        appearance: appearance('uno', { introHtml: '<p>Texto</p>', cover: image('portada') }),
        expectedRev: 0,
      })
      .expect(200);
    await editor
      .put(url)
      .send({ appearance: appearance('dos'), expectedRev: 1 })
      .expect(200);
    await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 2 }).expect(200);

    expect(await QuizVersion.countDocuments({ quizId: quiz._id })).toBe(versions);
    expect((await QuizVersion.findOne({ quizId: quiz._id }).lean())?.contentHash).toBe(hash);
    const after = quizDetailResponseSchema.parse((await editor.get(detailUrl)).body);
    expect(after.hasUnpublishedChanges).toBe(false);
    expect(after.currentVersion).toBe(before.currentVersion);
    expect(after.appearanceRev).toBe(3);
  });

  it('el borrador del editor viejo no pisa la introducción ni la portada cuando existe apariencia', async () => {
    const { editor, url, quiz } = await world();
    await Quiz.updateOne(
      { _id: quiz.id },
      { $set: { instructionsHtml: '<p>Original</p>', image: image('original') } },
    );
    await editor
      .put(url)
      .send({ appearance: appearance('uno', { introHtml: '<p>Nuevo</p>' }), expectedRev: 0 })
      .expect(200);
    const detail = (await editor.get(`/api/admin/quizzes/${quiz.id}`)).body;
    await editor
      .put(`/api/admin/quizzes/${quiz.id}/draft`)
      .send({ ...detail.draft, instructionsHtml: '', image: undefined })
      .expect(200);
    const root = await Quiz.findById(quiz.id).lean();
    expect(root?.instructionsHtml).toBe('<p>Original</p>');
    expect((root?.image as { publicId: string }).publicId).toBe('libro/quiz-bg/original');
  });
});

describe('historial y reversión', () => {
  it('registra quién y cuándo; conserva solo los últimos 10 cambios', async () => {
    const { editor, admin, url } = await world();
    for (let i = 0; i < 12; i += 1) {
      const agent = i % 2 === 0 ? editor : admin;
      await agent
        .put(url)
        .send({ appearance: appearance(`f${i}`), expectedRev: i })
        .expect(200);
    }
    const res = quizAppearanceResponseSchema.parse((await editor.get(url)).body);
    expect(res.rev).toBe(12);
    expect(res.history.map((h) => h.rev)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(res.history.every((h) => h.by.id && h.at)).toBe(true);
    const history = (await editor.get(`${url}/history`).expect(200)).body;
    expect(history.rev).toBe(12);
    expect(history.history).toHaveLength(10);
    expect(history).not.toHaveProperty('appearance');
  });

  it('revertir restaura el estado anterior; una revisión que ya salió del historial da 404; una vieja, 409', async () => {
    const { editor, url } = await world();
    await editor
      .put(url)
      .send({ appearance: appearance('uno'), expectedRev: 0 })
      .expect(200);
    await editor
      .put(url)
      .send({ appearance: appearance('dos', { accent: 'warning' }), expectedRev: 1 })
      .expect(200);
    const back = quizAppearanceResponseSchema.parse(
      (await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 2 }).expect(200)).body,
    );
    expect(back.rev).toBe(3);
    expect(back.appearance?.background).toMatchObject({ image: { publicId: 'libro/quiz-bg/uno' } });
    expect(back.history[0]).toMatchObject({ rev: 3, action: 'revert' });

    const stale = await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 1 });
    expect(stale.status).toBe(409);
    for (let i = 3; i < 14; i += 1) {
      await editor
        .put(url)
        .send({ appearance: appearance(`g${i}`), expectedRev: i })
        .expect(200);
    }
    const gone = await editor.post(`${url}/revert`).send({ rev: 1, expectedRev: 14 });
    expect(gone.status).toBe(404);
    expect(code(gone)).toBe('NOT_FOUND');
    expect((await editor.post(`${url}/revert`).send({ rev: 0, expectedRev: 14 })).status).toBe(400);
  });
});

describe('límite de guardado de la apariencia', () => {
  it('corta con 429 el guardado y la reversión de quien se pasa, sin afectar a otra persona ni a las lecturas', async () => {
    const { editor, admin, url } = await staffWorld({
      limits: { appearanceWrite: { windowMs: 60_000, limit: 2, by: 'user' } },
    }).then(async (w) => {
      const book = await createBook();
      const quiz = await createQuiz({
        bookId: book._id,
        order: 1,
        content: simpleContent({ title: 'Quiz de prueba' }),
        publishedBy: w.adminUser._id,
      });
      return { ...w, url: `/api/admin/quizzes/${quiz.id}/appearance` };
    });
    await editor
      .put(url)
      .send({ appearance: appearance('a'), expectedRev: 0 })
      .expect(200);
    await editor
      .put(url)
      .send({ appearance: appearance('b'), expectedRev: 1 })
      .expect(200);

    const blocked = await editor.put(url).send({ appearance: appearance('c'), expectedRev: 2 });
    expect(blocked.status).toBe(429);
    expect(code(blocked)).toBe('RATE_LIMITED');
    expect((await editor.post(`${url}/revert`).send({ rev: 1, expectedRev: 2 })).status).toBe(429);
    // Leer no cuenta, y otra persona tiene su propio cupo.
    await editor.get(url).expect(200);
    await editor.get(`${url}/history`).expect(200);
    await admin
      .put(url)
      .send({ appearance: appearance('d'), expectedRev: 2 })
      .expect(200);
  });
});
