import { APPEARANCE_HISTORY_LIMIT, type QuizAppearanceInput } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { createUser } from '../test-utils/auth.js';
import { fakeImages, videoAsset } from '../test-utils/fakeImages.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { createQuizAdminService } from './quizAdmin.service.js';
import { createQuizAppearanceService } from './quizAppearance.service.js';

useTestDb();

const image = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: `Fondo ${name}`,
});
const withImage = (
  name: string,
  extra: Partial<QuizAppearanceInput> = {},
): QuizAppearanceInput => ({
  background: { kind: 'image', image: image(name) },
  ...extra,
});

async function world() {
  const clockRef = { now: new Date('2026-10-24T10:00:00.000Z') };
  const clock = () => new Date(clockRef.now);
  const admin = await createUser({
    email: 'admin@ejemplo.com',
    role: 'ADMIN',
    name: 'Administradora',
  });
  const editor = await createUser({
    email: 'editora@ejemplo.com',
    role: 'EDITOR',
    name: 'Editora',
  });
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz de prueba' }),
    publishedBy: admin._id,
  });
  const cloud = fakeImages([videoAsset('libro/quiz-bg/vid')]);
  const appearance = createQuizAppearanceService({ clock, images: cloud.provider });
  const quizAdmin = createQuizAdminService({ clock });
  const actor = (u: { _id: unknown }, role: 'ADMIN' | 'EDITOR') => ({
    userId: String(u._id),
    role,
  });
  return {
    clockRef,
    cloud,
    quiz,
    appearance,
    quizAdmin,
    admin: actor(admin, 'ADMIN'),
    editor: actor(editor, 'EDITOR'),
    adminId: String(admin._id),
  };
}

describe('apariencia del quiz: lectura y primera edición', () => {
  it('un quiz sin apariencia responde vacío, en la revisión 0', async () => {
    const { appearance, quiz } = await world();
    expect(await appearance.get(quiz.id)).toEqual({
      appearance: null,
      rev: 0,
      history: [],
      warnings: [],
    });
  });

  it('un quiz que no existe da NOT_FOUND', async () => {
    const { appearance } = await world();
    await expect(appearance.get('670000000000000000000099')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('la primera edición crea la apariencia, sube la revisión y deja constancia de quién y cuándo', async () => {
    const { appearance, quiz, editor, clockRef } = await world();
    const res = await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', { accent: 'accent' }),
      expectedRev: 0,
    });
    expect(res.rev).toBe(1);
    expect(res.appearance?.background).toMatchObject({ kind: 'image' });
    expect(res.appearance?.accent).toBe('accent');
    expect(res.appearance?.overlay).toEqual({ mode: 'auto', strength: 0.78 });
    expect(res.history).toHaveLength(1);
    expect(res.history[0]).toMatchObject({
      rev: 1,
      action: 'seed',
      by: { id: editor.userId, name: 'Editora' },
      at: clockRef.now.toISOString(),
    });
    expect(res.history[0]?.changed).toEqual(['background', 'overlay', 'accent']);
  });

  it('solo registra las claves de la lista blanca que cambiaron', async () => {
    const { appearance, quiz, editor } = await world();
    await appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 });
    const res = await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', { accent: 'success' }),
      expectedRev: 1,
    });
    expect(res.history[0]).toMatchObject({ rev: 2, action: 'update', changed: ['accent'] });
    // Cambiar solo el fondo.
    const res3 = await appearance.update(quiz.id, editor, {
      appearance: withImage('dos', { accent: 'success' }),
      expectedRev: 2,
    });
    expect(res3.history[0]?.changed).toEqual(['background']);
  });
});

describe('apariencia del quiz: no toca las versiones (regla 5)', () => {
  it('guardar la apariencia no crea versión ni cambia el hash ni marca cambios sin publicar', async () => {
    const { appearance, quizAdmin, quiz, editor } = await world();
    const before = await quizAdmin.get(quiz.id);
    const versionsBefore = await QuizVersion.countDocuments({ quizId: quiz._id });
    const hashBefore = (await QuizVersion.findOne({ quizId: quiz._id }).lean())?.contentHash;
    expect(before.hasUnpublishedChanges).toBe(false);

    await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', {
        introHtml: '<p>Una niebla espesa.</p>',
        cover: image('portada'),
      }),
      expectedRev: 0,
    });

    expect(await QuizVersion.countDocuments({ quizId: quiz._id })).toBe(versionsBefore);
    expect((await QuizVersion.findOne({ quizId: quiz._id }).lean())?.contentHash).toBe(hashBefore);
    const after = await quizAdmin.get(quiz.id);
    expect(after.hasUnpublishedChanges).toBe(false);
    expect(after.currentVersion).toBe(before.currentVersion);
    // El detalle del editor trae la apariencia y su revisión.
    expect(after.appearanceRev).toBe(1);
    expect(after.appearance?.introHtml).toBe('<p>Una niebla espesa.</p>');
  });

  it('con apariencia creada, guardar el borrador no pisa la introducción ni la portada de la raíz', async () => {
    const { appearance, quizAdmin, quiz, editor } = await world();
    const root = await Quiz.findById(quiz.id).lean();
    await Quiz.updateOne(
      { _id: quiz.id },
      { $set: { instructionsHtml: '<p>Texto original</p>', image: image('original') } },
    );
    await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', { introHtml: '<p>Texto nuevo</p>' }),
      expectedRev: 0,
    });
    const detail = await quizAdmin.get(quiz.id);
    // El borrador del editor llega con los valores por defecto de siempre (vacío, sin imagen).
    await quizAdmin.saveDraft(
      quiz.id,
      { ...detail.draft, title: 'Quiz de prueba', instructionsHtml: '', image: undefined },
      editor,
    );
    const after = await Quiz.findById(quiz.id).lean();
    expect(after?.instructionsHtml).toBe('<p>Texto original</p>');
    expect((after?.image as { publicId?: string } | undefined)?.publicId).toBe(
      'libro/quiz-bg/original',
    );
    expect(root).not.toBeNull();
  });

  it('sin apariencia, guardar el borrador sigue funcionando como siempre', async () => {
    const { quizAdmin, quiz, editor } = await world();
    const detail = await quizAdmin.get(quiz.id);
    await quizAdmin.saveDraft(
      quiz.id,
      { ...detail.draft, instructionsHtml: '<p>Instrucciones del borrador</p>' },
      editor,
    );
    expect((await Quiz.findById(quiz.id).lean())?.instructionsHtml).toBe(
      '<p>Instrucciones del borrador</p>',
    );
  });
});

describe('apariencia del quiz: sanea y valida', () => {
  it('el texto de introducción pasa por el sanitizador del servidor (regla 7)', async () => {
    const { appearance, quiz, editor } = await world();
    const res = await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', {
        introHtml:
          '<p onclick="alert(1)">Hola</p><script>alert(1)</script><img src=x onerror="alert(1)">',
      }),
      expectedRev: 0,
    });
    expect(res.appearance?.introHtml).toBe('<p>Hola</p>');
    const stored = JSON.stringify((await Quiz.findById(quiz.id).lean())?.appearance);
    expect(stored).not.toMatch(/<script|onerror|onclick|alert\(1\)/);
  });

  it('rechaza una URL que no es de Cloudinary (fondo, póster o portada)', async () => {
    const { appearance, quiz, editor } = await world();
    const bad = { ...image('x'), url: 'https://ejemplo.com/fondo.jpg' };
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: { background: { kind: 'image', image: bad } },
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      appearance.update(quiz.id, editor, { appearance: { cover: bad }, expectedRev: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const video = {
      provider: 'cloudinary' as const,
      publicId: 'libro/quiz-bg/v',
      url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/v.mp4',
      width: 1280,
      height: 720,
      durationSeconds: 8,
      posterUrl: 'https://ejemplo.com/poster.jpg',
      alt: 'Niebla',
    };
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: { background: { kind: 'video', video } },
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await appearance.get(quiz.id)).rev).toBe(0);
  });

  it('rechaza lo que cambia el significado del quiz aunque llegue sin pasar por la ruta', async () => {
    const { appearance, quiz, editor } = await world();
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: { title: 'Otro título' } as unknown as QuizAppearanceInput,
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: { overlay: { mode: 'manual', strength: 0.6 } },
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await appearance.get(quiz.id)).rev).toBe(0);
  });

  it('avisa (sin bloquear) si el texto nombra un resultado del quiz', async () => {
    const { appearance, quiz, editor } = await world();
    const results = (await Quiz.findById(quiz.id).lean())?.draft?.results as { title: string }[];
    const title = results[0]!.title;
    const res = await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', { introHtml: `<p>Quizá seas de los de «${title}».</p>` }),
      expectedRev: 0,
    });
    expect(res.warnings).toEqual(['APPEARANCE_MENTIONS_RESULT']);
    expect(res.rev).toBe(1);
    const clean = await appearance.update(quiz.id, editor, {
      appearance: withImage('uno', { introHtml: '<p>Una niebla espesa.</p>' }),
      expectedRev: 1,
    });
    expect(clean.warnings).toEqual([]);
  });
});

describe('apariencia del quiz: concurrencia y archivado', () => {
  it('con una revisión vieja responde CONFLICT y no cambia nada', async () => {
    const { appearance, quiz, editor, admin } = await world();
    await appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 });
    await expect(
      appearance.update(quiz.id, admin, { appearance: withImage('dos'), expectedRev: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const now = await appearance.get(quiz.id);
    expect(now.rev).toBe(1);
    expect(now.appearance?.background).toMatchObject({ image: { publicId: 'libro/quiz-bg/uno' } });
  });

  it('dos ediciones a la vez con la misma revisión: solo una se aplica (operación atómica)', async () => {
    const { appearance, quiz, editor, admin } = await world();
    const results = await Promise.allSettled([
      appearance.update(quiz.id, editor, { appearance: withImage('a'), expectedRev: 0 }),
      appearance.update(quiz.id, admin, { appearance: withImage('b'), expectedRev: 0 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'CONFLICT' });
    const now = await appearance.get(quiz.id);
    expect(now.rev).toBe(1);
    expect(now.history).toHaveLength(1);
  });

  it('un quiz archivado no se puede editar', async () => {
    const { appearance, quizAdmin, quiz, editor } = await world();
    await quizAdmin.archive(quiz.id);
    await expect(
      appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('un quiz creado antes de existir el campo (sin revisión guardada) se edita con la revisión 0', async () => {
    const { appearance, quiz, editor } = await world();
    await Quiz.collection.updateOne(
      { _id: quiz._id },
      { $unset: { appearanceRev: '', appearanceHistory: '', appearance: '' } },
    );
    const res = await appearance.update(quiz.id, editor, {
      appearance: withImage('uno'),
      expectedRev: 0,
    });
    expect(res.rev).toBe(1);
  });
});

describe('apariencia del quiz: historial y reversión', () => {
  it('conserva solo los últimos 10 cambios', async () => {
    const { appearance, quiz, editor } = await world();
    for (let i = 0; i < 12; i += 1) {
      await appearance.update(quiz.id, editor, { appearance: withImage(`f${i}`), expectedRev: i });
    }
    const res = await appearance.get(quiz.id);
    expect(res.rev).toBe(12);
    expect(res.history).toHaveLength(APPEARANCE_HISTORY_LIMIT);
    // Del más reciente al más antiguo: 12 … 3.
    expect(res.history.map((h) => h.rev)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('revertir restaura el estado anterior de esa revisión y queda registrado como una entrada nueva', async () => {
    const { appearance, quiz, editor, admin } = await world();
    await appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 });
    await appearance.update(quiz.id, editor, {
      appearance: withImage('dos', { accent: 'warning' }),
      expectedRev: 1,
    });
    const res = await appearance.revert(quiz.id, admin, { rev: 2, expectedRev: 2 });
    expect(res.rev).toBe(3);
    expect(res.appearance?.background).toMatchObject({ image: { publicId: 'libro/quiz-bg/uno' } });
    expect(res.appearance?.accent).toBeUndefined();
    expect(res.history[0]).toMatchObject({ rev: 3, action: 'revert', by: { id: admin.userId } });
    // El historial no se reescribe: la edición revertida sigue ahí, y revertir también se puede revertir.
    expect(res.history.map((h) => h.rev)).toEqual([3, 2, 1]);
    const back = await appearance.revert(quiz.id, admin, { rev: 3, expectedRev: 3 });
    expect(back.appearance?.background).toMatchObject({ image: { publicId: 'libro/quiz-bg/dos' } });
    expect(back.appearance?.accent).toBe('warning');
  });

  it('revertir la primera edición quita la apariencia por completo', async () => {
    const { appearance, quiz, editor, quizAdmin } = await world();
    await appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 });
    const res = await appearance.revert(quiz.id, editor, { rev: 1, expectedRev: 1 });
    expect(res.appearance).toBeNull();
    expect(res.rev).toBe(2);
    expect((await Quiz.findById(quiz.id).lean())?.appearance).toBeUndefined();
    expect((await quizAdmin.get(quiz.id)).appearance).toBeUndefined();
  });

  it('una revisión que ya salió del historial, o con revisión vieja, no se puede revertir', async () => {
    const { appearance, quiz, editor } = await world();
    for (let i = 0; i < 12; i += 1) {
      await appearance.update(quiz.id, editor, { appearance: withImage(`f${i}`), expectedRev: i });
    }
    await expect(
      appearance.revert(quiz.id, editor, { rev: 1, expectedRev: 12 }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      appearance.revert(quiz.id, editor, { rev: 5, expectedRev: 11 }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await appearance.get(quiz.id)).rev).toBe(12);
  });

  it('si la cuenta que editó ya no existe, el historial lo dice sin romperse', async () => {
    const { appearance, quiz, editor } = await world();
    await appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 });
    const { User } = await import('../models/User.js');
    await User.deleteOne({ _id: editor.userId });
    const res = await appearance.get(quiz.id);
    expect(res.history[0]?.by).toEqual({ id: editor.userId, name: null });
  });
});

const videoRef = (over: Record<string, unknown> = {}) => ({
  provider: 'cloudinary' as const,
  publicId: 'libro/quiz-bg/vid',
  url: 'https://res.cloudinary.com/demo/video/upload/v1/libro/quiz-bg/vid.mp4',
  width: 1280,
  height: 720,
  durationSeconds: 5,
  posterUrl:
    'https://res.cloudinary.com/demo/video/upload/so_0,f_auto,q_auto/v1/libro/quiz-bg/vid.jpg',
  alt: 'Niebla sobre una ciudad',
  ...over,
});
const withVideo = (over: Record<string, unknown> = {}): QuizAppearanceInput => ({
  background: { kind: 'video', video: videoRef(over) as never },
});

describe('apariencia del quiz: el video se verifica con Cloudinary', () => {
  it('acepta un video que cumple y guarda las medidas reales (no las que mandó el navegador)', async () => {
    const { appearance, quiz, editor, cloud } = await world();
    const res = await appearance.update(quiz.id, editor, {
      appearance: withVideo(),
      expectedRev: 0,
    });
    const video = res.appearance?.background;
    expect(video?.kind).toBe('video');
    if (video?.kind === 'video') {
      expect(video.video.durationSeconds).toBe(8.2); // el navegador decía 5
      expect(video.video.width).toBe(1280);
    }
    expect(cloud.provider.inspect).toHaveBeenCalledWith({
      publicId: 'libro/quiz-bg/vid',
      resource: 'video',
    });
  });

  it('rechaza un video que dura más de 10 s (con margen de 2) aunque el navegador diga que dura poco', async () => {
    const { appearance, quiz, editor, cloud } = await world();
    cloud.set(videoAsset('libro/quiz-bg/vid', { durationSeconds: 14.5 }));
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: withVideo({ durationSeconds: 3 }),
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('14,5 s') });
    cloud.set(videoAsset('libro/quiz-bg/vid', { durationSeconds: 11.9 }));
    await expect(
      appearance.update(quiz.id, editor, { appearance: withVideo(), expectedRev: 0 }),
    ).resolves.toMatchObject({ rev: 1 });
  });

  it('rechaza un video de más de 5 MB, de otro formato o sin duración', async () => {
    const { appearance, quiz, editor, cloud } = await world();
    cloud.set(videoAsset('libro/quiz-bg/vid', { bytes: 6 * 1024 * 1024 }));
    await expect(
      appearance.update(quiz.id, editor, { appearance: withVideo(), expectedRev: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('5 MB') });
    cloud.set(videoAsset('libro/quiz-bg/vid', { format: 'mov' }));
    await expect(
      appearance.update(quiz.id, editor, { appearance: withVideo(), expectedRev: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await appearance.get(quiz.id)).rev).toBe(0);
  });

  it('si Cloudinary no da la duración, el video se rechaza con un mensaje claro y no se guarda nada', async () => {
    const { appearance, quiz, editor, cloud } = await world();
    cloud.set(videoAsset('libro/quiz-bg/vid', { durationSeconds: undefined }));
    const error = await appearance
      .update(quiz.id, editor, { appearance: withVideo({ durationSeconds: 3 }), expectedRev: 0 })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'VALIDATION' });
    expect((error as Error).message).toContain('No pudimos medir la duración');
    expect((error as Error).message).toContain('no se guardó');
    // La duración que dice el navegador (3 s) NO sirve de sustituto.
    const stored = await appearance.get(quiz.id);
    expect(stored).toMatchObject({ appearance: null, rev: 0, history: [] });
  });

  it('rechaza un video que no existe en Cloudinary', async () => {
    const { appearance, quiz, editor } = await world();
    const ghost = {
      publicId: 'libro/quiz-bg/fantasma',
      url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/fantasma.mp4',
      posterUrl: 'https://res.cloudinary.com/demo/video/upload/so_0/libro/quiz-bg/fantasma.jpg',
    };
    await expect(
      appearance.update(quiz.id, editor, { appearance: withVideo(ghost), expectedRev: 0 }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('No encontramos'),
    });
  });

  it('el póster y el video deben ser del mismo archivo y estar en la carpeta de fondos', async () => {
    const { appearance, quiz, editor } = await world();
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: withVideo({
          posterUrl: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/otro.jpg',
        }),
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('póster') });
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: withVideo({ publicId: 'libro/cover/vid' }),
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    // Una imagen de fondo tampoco puede venir de otra carpeta.
    await expect(
      appearance.update(quiz.id, editor, {
        appearance: {
          background: {
            kind: 'image',
            image: {
              ...image('x'),
              publicId: 'libro/cover/x',
              url: 'https://res.cloudinary.com/demo/image/upload/libro/cover/x.jpg',
            },
          },
        },
        expectedRev: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('una imagen de fondo no necesita consultar a Cloudinary', async () => {
    const { appearance, quiz, editor, cloud } = await world();
    await appearance.update(quiz.id, editor, { appearance: withImage('uno'), expectedRev: 0 });
    expect(cloud.provider.inspect).not.toHaveBeenCalled();
  });

  it('nunca borra nada en Cloudinary: ni al cambiar el fondo, ni al quitarlo, ni al revertir', async () => {
    const { appearance, quiz, editor, cloud } = await world();
    await appearance.update(quiz.id, editor, { appearance: withVideo(), expectedRev: 0 });
    await appearance.update(quiz.id, editor, { appearance: withImage('dos'), expectedRev: 1 });
    await appearance.update(quiz.id, editor, { appearance: {}, expectedRev: 2 });
    await appearance.revert(quiz.id, editor, { rev: 2, expectedRev: 3 });
    expect(cloud.provider.destroy).not.toHaveBeenCalled();
    expect(cloud.destroyed).toEqual([]);
  });
});
