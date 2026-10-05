import { describe, expect, it } from 'vitest';
import { imageRefSchema, objectIdSchema, roleSchema, unlockRuleSchema } from './common.js';

describe('esquemas comunes', () => {
  it('acepta los tres roles y rechaza otros', () => {
    expect(roleSchema.parse('EDITOR')).toBe('EDITOR');
    expect(roleSchema.safeParse('SUPERADMIN').success).toBe(false);
  });

  it('valida identificadores de MongoDB', () => {
    expect(objectIdSchema.safeParse('670000000000000000000001').success).toBe(true);
    expect(objectIdSchema.safeParse('no-es-un-id').success).toBe(false);
  });

  it('completa deliveryType en imágenes', () => {
    const img = imageRefSchema.parse({
      provider: 'cloudinary',
      publicId: 'libro/portada-1',
      url: 'https://res.cloudinary.com/[cloud]/image/upload/libro/portada-1',
      width: 1200,
      height: 1800,
      alt: 'Portada',
    });
    expect(img.deliveryType).toBe('upload');
  });

  it('las reglas de desbloqueo solo admiten quiz o juego (los extras no tienen QR)', () => {
    const refId = '670000000000000000000020';
    expect(unlockRuleSchema.safeParse({ kind: 'quiz', refId }).success).toBe(true);
    expect(unlockRuleSchema.safeParse({ kind: 'extra', refId }).success).toBe(false);
  });
});
