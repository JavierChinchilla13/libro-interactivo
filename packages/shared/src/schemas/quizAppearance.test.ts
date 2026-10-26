import { describe, expect, it } from 'vitest';
import { quizDetailResponseSchema } from './adminQuiz.js';
import { quizIntroResponseSchema } from './quiz.js';
import {
  APPEARANCE_FIELDS,
  APPEARANCE_HISTORY_LIMIT,
  OVERLAY_FLOOR,
  OVERLAY_MIN,
  overlayMinimum,
  QUIZ_VIDEO_LIMITS,
  quizAppearanceResponseSchema,
  quizAppearanceSchema,
  QUIZ_BG_FOLDER,
  QUIZ_BG_PUBLIC_ID,
  readerAppearanceSchema,
  revertQuizAppearanceRequestSchema,
  updateQuizAppearanceRequestSchema,
  urlHasPublicId,
  videoPosterUrl,
} from './quizAppearance.js';
import { imageSignatureRequestSchema } from './upload.js';

const image = {
  provider: 'cloudinary' as const,
  publicId: 'libro/quiz-bg/abc',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/abc.jpg',
  width: 1920,
  height: 1080,
  alt: 'Pasillo de un laboratorio',
};
const video = {
  provider: 'cloudinary' as const,
  publicId: 'libro/quiz-bg/vid',
  url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/vid.mp4',
  width: 1280,
  height: 720,
  durationSeconds: 9.4,
  posterUrl: 'https://res.cloudinary.com/demo/video/upload/so_0/libro/quiz-bg/vid.jpg',
  alt: 'Niebla sobre una ciudad',
};
const ok = (value: unknown) => quizAppearanceSchema.safeParse(value);

describe('apariencia del quiz', () => {
  it('acepta un fondo de imagen y uno de video con los valores por defecto del velo', () => {
    const withImage = ok({ background: { kind: 'image', image } });
    expect(withImage.success).toBe(true);
    expect(withImage.data?.overlay).toEqual({ mode: 'auto', strength: OVERLAY_FLOOR });
    expect(ok({ background: { kind: 'video', video } }).success).toBe(true);
    // Sin fondo ni nada más también es válida (quitar el fondo).
    expect(ok({}).success).toBe(true);
  });

  it('el texto alternativo es obligatorio en imagen y en video', () => {
    expect(ok({ background: { kind: 'image', image: { ...image, alt: '' } } }).success).toBe(false);
    expect(ok({ background: { kind: 'image', image: { ...image, alt: '   ' } } }).success).toBe(
      false,
    );
    expect(ok({ background: { kind: 'video', video: { ...video, alt: '' } } }).success).toBe(false);
    expect(
      ok({ background: { kind: 'image', image: { ...image, alt: 'x'.repeat(201) } } }).success,
    ).toBe(false);
  });

  it('el video exige póster y respeta la duración (10 s con 2 s de margen)', () => {
    const { posterUrl: _poster, ...withoutPoster } = video;
    expect(ok({ background: { kind: 'video', video: withoutPoster } }).success).toBe(false);
    expect(ok({ background: { kind: 'video', video: { ...video, posterUrl: '' } } }).success).toBe(
      false,
    );
    const limit = QUIZ_VIDEO_LIMITS.maxDurationSeconds + QUIZ_VIDEO_LIMITS.toleranceSeconds;
    expect(
      ok({ background: { kind: 'video', video: { ...video, durationSeconds: limit } } }).success,
    ).toBe(true);
    expect(
      ok({ background: { kind: 'video', video: { ...video, durationSeconds: limit + 1 } } })
        .success,
    ).toBe(false);
    expect(ok({ background: { kind: 'video', video: { ...video, width: 8000 } } }).success).toBe(
      false,
    );
  });

  it('el velo en modo automático puede bajar hasta 0,5 (cuando el editor midió el fondo)', () => {
    for (const strength of [0.5, 0.6, 0.78, 0.92]) {
      expect(ok({ overlay: { mode: 'auto', strength } }).success, String(strength)).toBe(true);
    }
    for (const strength of [0.49, 0.93, 0, 1]) {
      expect(ok({ overlay: { mode: 'auto', strength } }).success, String(strength)).toBe(false);
    }
    // Sin modo, el valor por defecto es automático.
    expect(ok({ overlay: { strength: 0.6 } }).data?.overlay.mode).toBe('auto');
  });

  it('el velo en modo manual no baja del piso 0,78: sin medición no hay garantía de contraste', () => {
    for (const strength of [0.78, 0.85, 0.92]) {
      expect(ok({ overlay: { mode: 'manual', strength } }).success, String(strength)).toBe(true);
    }
    for (const strength of [0.5, 0.6, 0.77, 0.7799]) {
      expect(ok({ overlay: { mode: 'manual', strength } }).success, String(strength)).toBe(false);
    }
    expect(ok({ overlay: { mode: 'manual', strength: 0.93 } }).success).toBe(false);
    expect(ok({ overlay: { mode: 'raro', strength: 0.8 } }).success).toBe(false);
  });

  it('el mínimo de cada modo, para el control del editor', () => {
    expect(overlayMinimum('manual')).toBe(OVERLAY_FLOOR);
    expect(overlayMinimum('auto')).toBe(OVERLAY_MIN);
  });

  it('la lectora recibe el mismo velo ya validado (manual por debajo del piso no cabe)', () => {
    expect(
      readerAppearanceSchema.safeParse({ overlay: { mode: 'manual', strength: 0.6 } }).success,
    ).toBe(false);
    expect(
      readerAppearanceSchema.safeParse({ overlay: { mode: 'auto', strength: 0.6 } }).success,
    ).toBe(true);
  });

  it('el acento es un token de la lista cerrada, nunca un color libre', () => {
    for (const accent of ['primary', 'accent', 'success', 'warning']) {
      expect(ok({ accent }).success).toBe(true);
    }
    for (const accent of ['#ff0000', 'red', 'danger', '']) {
      expect(ok({ accent }).success).toBe(false);
    }
  });

  it('el texto de introducción tiene tope de 5 000 caracteres', () => {
    expect(ok({ introHtml: '<p>' + 'a'.repeat(4990) + '</p>' }).success).toBe(true);
    expect(ok({ introHtml: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('la lista blanca es estricta: lo que cambia el significado del quiz se rechaza', () => {
    for (const forbidden of [
      { title: 'Otro título' },
      { stages: [] },
      { results: [] },
      { settings: { allowRetake: false } },
      { allowRetake: true },
      { showBreakdown: true },
      { resultKey: 'r1' },
      { instructionsHtml: '<p>x</p>' },
    ]) {
      expect(ok(forbidden).success, JSON.stringify(forbidden)).toBe(false);
    }
    expect([...APPEARANCE_FIELDS]).toEqual([
      'background',
      'overlay',
      'accent',
      'cover',
      'introHtml',
    ]);
  });

  it('la portada es una imagen como las demás', () => {
    expect(ok({ cover: image }).success).toBe(true);
    expect(ok({ cover: { ...image, width: 0 } }).success).toBe(false);
  });
});

describe('lo que recibe la lectora', () => {
  it('solo trae fondo, velo y acento: ni introducción ni portada ni nada de edición', () => {
    expect(readerAppearanceSchema.safeParse({ background: { kind: 'image', image } }).success).toBe(
      true,
    );
    expect(readerAppearanceSchema.safeParse({ introHtml: '<p>x</p>' }).success).toBe(false);
    expect(readerAppearanceSchema.safeParse({ cover: image }).success).toBe(false);
    expect(readerAppearanceSchema.safeParse({ rev: 3, history: [] }).success).toBe(false);
  });

  const intro = {
    id: 'a'.repeat(24),
    bookId: 'b'.repeat(24),
    title: 'Quiz',
    instructionsHtml: '',
    allowRetake: true,
    status: 'available' as const,
    completedCount: 0,
    canStart: true,
  };
  it('la introducción sigue aceptándose sin apariencia y la acepta con ella', () => {
    expect(quizIntroResponseSchema.safeParse(intro).success).toBe(true);
    const withAppearance = quizIntroResponseSchema.safeParse({
      ...intro,
      appearance: { background: { kind: 'video', video }, accent: 'accent' },
    });
    expect(withAppearance.success).toBe(true);
    expect(withAppearance.data?.appearance?.overlay.strength).toBe(OVERLAY_FLOOR);
    // Una apariencia con campos de edición no cabe en la introducción.
    expect(
      quizIntroResponseSchema.safeParse({ ...intro, appearance: { introHtml: 'x' } }).success,
    ).toBe(false);
  });
});

describe('edición, auditoría y reversión', () => {
  it('actualizar pide la apariencia y la revisión que se vio', () => {
    const body = { appearance: { background: { kind: 'image', image } }, expectedRev: 0 };
    expect(updateQuizAppearanceRequestSchema.safeParse(body).success).toBe(true);
    expect(updateQuizAppearanceRequestSchema.safeParse({ appearance: {} }).success).toBe(false);
    expect(updateQuizAppearanceRequestSchema.safeParse({ ...body, expectedRev: -1 }).success).toBe(
      false,
    );
    expect(updateQuizAppearanceRequestSchema.safeParse({ ...body, expectedRev: 1.5 }).success).toBe(
      false,
    );
  });

  it('revertir pide una revisión válida', () => {
    expect(revertQuizAppearanceRequestSchema.safeParse({ rev: 3, expectedRev: 4 }).success).toBe(
      true,
    );
    expect(revertQuizAppearanceRequestSchema.safeParse({ rev: 0, expectedRev: 4 }).success).toBe(
      false,
    );
  });

  it('el historial guarda quién y cuándo, y no pasa de 10 estados', () => {
    const entry = (rev: number) => ({
      rev,
      at: '2026-10-24T10:00:00.000Z',
      by: { id: 'c'.repeat(24), name: rev % 2 ? 'Editora' : null },
      action: 'update' as const,
      changed: ['background', 'overlay'] as ('background' | 'overlay')[],
    });
    const base = { appearance: null, rev: 0 };
    expect(
      quizAppearanceResponseSchema.safeParse({
        ...base,
        history: Array.from({ length: APPEARANCE_HISTORY_LIMIT }, (_, i) => entry(i + 1)),
      }).success,
    ).toBe(true);
    expect(
      quizAppearanceResponseSchema.safeParse({
        ...base,
        history: Array.from({ length: APPEARANCE_HISTORY_LIMIT + 1 }, (_, i) => entry(i + 1)),
      }).success,
    ).toBe(false);
    expect(
      quizAppearanceResponseSchema.safeParse({
        ...base,
        history: [{ ...entry(1), changed: ['title'] }],
      }).success,
    ).toBe(false);
    expect(quizAppearanceResponseSchema.parse({ ...base, history: [] }).warnings).toEqual([]);
  });
});

describe('integración con el resto del contrato', () => {
  it('el detalle del editor trae la apariencia y su revisión (0 si nunca se editó)', () => {
    const summary = {
      id: 'a'.repeat(24),
      bookId: 'b'.repeat(24),
      slug: 'quiz-1',
      title: 'Quiz',
      order: 1,
      status: 'draft',
      currentVersion: 0,
      allowRetake: true,
      showBreakdown: false,
      updatedAt: '2026-10-24T10:00:00.000Z',
      draft: {
        title: 'Quiz',
        settings: { allowRetake: true, showBreakdown: false },
        stages: [],
        results: [],
      },
      hasUnpublishedChanges: true,
    };
    const parsed = quizDetailResponseSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.appearanceRev).toBe(0);
    expect(parsed.data?.appearance).toBeUndefined();
  });

  it('el propósito de subida quiz-bg existe y admite video', () => {
    expect(
      imageSignatureRequestSchema.safeParse({ purpose: 'quiz-bg', resource: 'video' }).success,
    ).toBe(true);
    expect(imageSignatureRequestSchema.safeParse({ purpose: 'quiz-bg' }).success).toBe(true);
    expect(imageSignatureRequestSchema.safeParse({ purpose: 'otro' }).success).toBe(false);
  });
});

describe('póster y pertenencia de un medio', () => {
  it('el póster es el primer fotograma en JPG, con formato y calidad automáticos', () => {
    expect(
      videoPosterUrl('https://res.cloudinary.com/mi/video/upload/v123/libro/quiz-bg/abc.mp4'),
    ).toBe(
      'https://res.cloudinary.com/mi/video/upload/so_0,f_auto,q_auto/v123/libro/quiz-bg/abc.jpg',
    );
    expect(
      videoPosterUrl('https://res.cloudinary.com/mi/video/upload/libro/quiz-bg/abc.webm'),
    ).toBe('https://res.cloudinary.com/mi/video/upload/so_0,f_auto,q_auto/libro/quiz-bg/abc.jpg');
  });

  it('reconoce que una URL es de un publicId, con transformaciones, versión y cualquier extensión', () => {
    const id = `${QUIZ_BG_FOLDER}/abc`;
    expect(urlHasPublicId(`https://res.cloudinary.com/mi/video/upload/v1/${id}.mp4`, id)).toBe(
      true,
    );
    expect(
      urlHasPublicId(`https://res.cloudinary.com/mi/video/upload/so_0,f_auto/v1/${id}.jpg`, id),
    ).toBe(true);
    expect(urlHasPublicId(`https://res.cloudinary.com/mi/video/upload/${id}`, id)).toBe(true);
    expect(urlHasPublicId(`https://res.cloudinary.com/mi/video/upload/${id}x.mp4`, id)).toBe(false);
    expect(urlHasPublicId(`https://res.cloudinary.com/mi/video/upload/otra/abc.mp4`, id)).toBe(
      false,
    );
    expect(urlHasPublicId('no es una url', id)).toBe(false);
  });

  it('urlHasPublicId rechaza fetch remoto, recorridos de ruta, consultas y segmentos de más', () => {
    const id = `${QUIZ_BG_FOLDER}/abc`;
    const base = 'https://res.cloudinary.com/mi';
    expect(urlHasPublicId(`${base}/image/fetch/https://otro.example/${id}`, id)).toBe(false);
    expect(urlHasPublicId(`${base}/image/upload/${id}.jpg?x=1`, id)).toBe(false);
    expect(urlHasPublicId(`${base}/image/upload/..%2F..%2F${id}.jpg`, id)).toBe(false);
    expect(urlHasPublicId(`${base}/image/upload/otra-carpeta/${id}.jpg`, id)).toBe(false);
    expect(urlHasPublicId(`${base}/image/upload/l_video:x/fl_layer_apply/${id}.jpg`, id)).toBe(
      true,
    );
    expect(urlHasPublicId(`${base}/image/upload/c_limit,w_720/v12/${id}.jpg`, id)).toBe(true);
  });

  it('el identificador de un fondo no admite recorridos, consultas ni carpetas ajenas', () => {
    for (const publicId of [
      'libro/quiz-bg/../../x',
      'libro/quiz-bg/a%2F..%2Fb',
      'libro/quiz-bg/a?b=1',
      'libro/quiz-bg/a#b',
      'libro/quiz-bg/a/b',
      'libro/otra/a',
      'libro/quiz-bg/',
    ]) {
      expect(QUIZ_BG_PUBLIC_ID.test(publicId), publicId).toBe(false);
    }
    expect(QUIZ_BG_PUBLIC_ID.test('libro/quiz-bg/rvgxzqrnyifhsnr2yfxg')).toBe(true);
  });
});
