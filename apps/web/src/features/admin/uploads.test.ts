import { describe, expect, it } from 'vitest';
import { cardImageProblem, cloudinarySizeRejection, heavyFileNotice } from './uploads';

const mb = (n: number) => Math.round(n * 1024 * 1024);

describe('heavyFileNotice (aviso que no bloquea)', () => {
  it('una imagen hasta 10 MB y un video hasta 20 MB no avisan', () => {
    expect(heavyFileNotice({ size: mb(10), type: 'image/png' })).toBeNull();
    expect(heavyFileNotice({ size: mb(20), type: 'video/mp4' })).toBeNull();
    expect(heavyFileNotice({ size: mb(0.3), type: 'image/jpeg' })).toBeNull();
  });

  it('una imagen de más de 10 MB avisa con su peso, con coma decimal', () => {
    expect(heavyFileNotice({ size: mb(12.5), type: 'image/jpeg' })).toBe(
      'Este archivo pesa 12,5 MB: ocupa más espacio y puede tardar en cargar en el celular.',
    );
  });

  it('un video de 10 a 20 MB no avisa, pero de más de 20 MB sí', () => {
    expect(heavyFileNotice({ size: mb(15), type: 'video/webm' })).toBeNull();
    expect(heavyFileNotice({ size: mb(48), type: 'video/mp4' })).toBe(
      'Este archivo pesa 48,0 MB: ocupa más espacio y puede tardar en cargar en el celular.',
    );
  });

  it('con varios archivos a la vez, dice de cuál se trata', () => {
    expect(heavyFileNotice({ size: mb(11), type: 'image/png', name: 'mapa.png' })).toBe(
      '«mapa.png» pesa 11,0 MB: ocupa más espacio y puede tardar en cargar en el celular.',
    );
  });
});

describe('cloudinarySizeRejection', () => {
  it('con el máximo legible, lo dice en MB', () => {
    expect(
      cloudinarySizeRejection(400, {
        error: { message: 'File size too large. Got 31457280. Maximum is 10485760.' },
      }),
    ).toBe(
      'Cloudinary no acepta archivos de este peso en el plan actual (máximo 10 MB). Reduce el archivo o amplía el plan.',
    );
    expect(
      cloudinarySizeRejection(400, {
        error: { message: 'File size too large. Got 9000000. Maximum is 7864320.' },
      }),
    ).toContain('(máximo 7,5 MB)');
  });

  it('sin el máximo (o con un 413), solo dice que es demasiado pesado para el plan', () => {
    const text =
      'El archivo es demasiado pesado para el plan actual de Cloudinary. Reduce el archivo o amplía el plan.';
    expect(cloudinarySizeRejection(400, { error: { message: 'File size too large.' } })).toBe(text);
    expect(cloudinarySizeRejection(413, null)).toBe(text);
  });

  it('otros fallos no se confunden con el peso', () => {
    expect(cloudinarySizeRejection(400, { error: { message: 'Invalid image file' } })).toBeNull();
    expect(cloudinarySizeRejection(401, { error: { message: 'Invalid Signature' } })).toBeNull();
    expect(cloudinarySizeRejection(500, null)).toBeNull();
    expect(cloudinarySizeRejection(400, 'texto')).toBeNull();
  });
});

describe('cardImageProblem', () => {
  it('solo mira el formato: el peso ya no cuenta', () => {
    expect(cardImageProblem({ type: 'image/png', name: 'a.png' })).toBeNull();
    expect(cardImageProblem({ type: 'image/gif', name: 'a.gif' })).toBe(
      '«a.gif» no es JPG, PNG ni WebP.',
    );
  });
});
