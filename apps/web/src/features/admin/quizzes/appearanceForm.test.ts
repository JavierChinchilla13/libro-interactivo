import { OVERLAY_FLOOR, OVERLAY_MAX, OVERLAY_MIN, quizAppearanceSchema } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { videoProblem } from '../uploads';
import {
  autoStrength,
  clampStrength,
  contrastReport,
  formFromAppearance,
  formKey,
  sampleSource,
  toAppearance,
} from './appearanceForm';

const image = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: `Fondo ${name}`,
  deliveryType: 'upload' as const,
});
const defaults = { introHtml: '<p>Introducción actual</p>', cover: image('portada') };

describe('formFromAppearance', () => {
  it('sin apariencia se rellena con la introducción y la portada actuales del quiz', () => {
    const form = formFromAppearance(null, defaults);
    expect(form).toMatchObject({
      kind: 'none',
      mode: 'auto',
      strength: OVERLAY_FLOOR,
      introHtml: '<p>Introducción actual</p>',
      cover: defaults.cover,
    });
  });

  it('lo que la apariencia no define se muestra con lo del quiz; lo que define manda (incluida una introducción vacía)', () => {
    const only = quizAppearanceSchema.parse({ background: { kind: 'image', image: image('a') } });
    expect(formFromAppearance(only, defaults).introHtml).toBe('<p>Introducción actual</p>');
    const empty = quizAppearanceSchema.parse({ introHtml: '' });
    expect(formFromAppearance(empty, defaults).introHtml).toBe('');
  });
});

describe('toAppearance', () => {
  it('siempre envía introducción y portada explícitas y es válido para el contrato', () => {
    const form = {
      ...formFromAppearance(null, defaults),
      kind: 'image' as const,
      image: image('uno'),
      accent: 'accent' as const,
    };
    const payload = toAppearance(form);
    expect(payload.introHtml).toBe('<p>Introducción actual</p>');
    expect(payload.cover?.publicId).toBe('libro/quiz-bg/portada');
    expect(() => quizAppearanceSchema.parse(payload)).not.toThrow();
  });

  it('el modo manual nunca baja del piso y ninguno pasa del máximo; el automático puede bajar hasta el mínimo', () => {
    expect(clampStrength('manual', 0.5)).toBe(OVERLAY_FLOOR);
    expect(clampStrength('manual', 1)).toBe(OVERLAY_MAX);
    expect(clampStrength('auto', 0.3)).toBe(OVERLAY_MIN);
    const manual = {
      ...formFromAppearance(null, defaults),
      mode: 'manual' as const,
      strength: 0.6,
    };
    expect(() => quizAppearanceSchema.parse(toAppearance(manual))).not.toThrow();
    expect(toAppearance(manual).overlay?.strength).toBe(OVERLAY_FLOOR);
  });

  it('sin imagen o video no hay fondo aunque el tipo diga otra cosa', () => {
    const form = { ...formFromAppearance(null, defaults), kind: 'video' as const };
    expect(toAppearance(form).background).toBeUndefined();
  });
});

describe('formKey', () => {
  it('en automático la intensidad no cuenta como cambio de la persona; en manual sí', () => {
    const base = formFromAppearance(null, defaults);
    expect(formKey({ ...base, strength: 0.6 })).toBe(formKey({ ...base, strength: 0.7 }));
    const manual = { ...base, mode: 'manual' as const };
    expect(formKey({ ...manual, strength: 0.8 })).not.toBe(formKey({ ...manual, strength: 0.9 }));
  });
});

describe('contraste y medida', () => {
  it('sin medida se calcula en el peor caso (blanco) y el piso cumple', () => {
    const report = contrastReport(undefined, OVERLAY_FLOOR, undefined);
    expect(report.basis).toBe('worst-case');
    expect(report.ok).toBe(true);
    expect(report.muted).toBeGreaterThanOrEqual(4.5);
  });

  it('un velo demasiado bajo sobre un fondo claro avisa que no cumple', () => {
    const report = contrastReport('#ffffff', 0.5, undefined);
    expect(report.ok).toBe(false);
    expect(report.muted).toBeLessThan(4.5);
  });

  it('un acento flojo sobre el fondo velado avisa aunque el texto cumpla', () => {
    const report = contrastReport('#ffffff', OVERLAY_FLOOR, '#2a3d5c');
    expect(report.muted).toBeGreaterThanOrEqual(4.5);
    expect(report.ok).toBe(false);
  });

  it('el modo automático usa la medida y, sin ella, el piso seguro', () => {
    expect(autoStrength(undefined)).toBe(OVERLAY_FLOOR);
    expect(autoStrength('#000000')).toBe(OVERLAY_MIN);
  });

  it('se mide la imagen o, en un video, su póster', () => {
    const base = formFromAppearance(null, defaults);
    expect(sampleSource({ ...base, kind: 'image', image: image('x') })).toContain('x.jpg');
    expect(sampleSource(base)).toBeUndefined();
  });
});

describe('videoProblem (límites de 5 MB y 10 s)', () => {
  const mb = (n: number) => n * 1024 * 1024;
  it('acepta un mp4 chico y corto', () => {
    expect(videoProblem({ size: mb(3), type: 'video/mp4' }, 8)).toBeNull();
    expect(videoProblem({ size: mb(5), type: 'video/webm' }, 11.9)).toBeNull();
  });

  it('rechaza por peso con el tamaño real y el máximo', () => {
    expect(videoProblem({ size: mb(7.5), type: 'video/mp4' }, 5)).toBe(
      'El video pesa 7,5 MB y el máximo es 5,0 MB. Comprímelo o recórtalo y vuelve a subirlo.',
    );
  });

  it('rechaza por duración (más de 10 s con el margen de 2 s)', () => {
    expect(videoProblem({ size: mb(2), type: 'video/mp4' }, 13.4)).toBe(
      'El video dura 13,4 s y el máximo es 10 s. Recórtalo y vuelve a subirlo.',
    );
  });

  it('rechaza otros formatos y no se queja si no pudo leer la duración (el servidor la verifica)', () => {
    expect(videoProblem({ size: mb(1), type: 'video/quicktime' }, 5)).toBe(
      'El video debe ser MP4 o WebM.',
    );
    expect(videoProblem({ size: mb(1), type: 'video/mp4' }, undefined)).toBeNull();
  });
});
