import { afterEach, describe, expect, it } from 'vitest';
import { assertCloudinaryUrls, cloudNameOf, configureCloudinaryAccount } from './images.js';

afterEach(() => configureCloudinaryAccount({ production: false }));

const url = (cloud: string, path = 'image/upload/v1/libro/cover/a.jpg') =>
  `https://res.cloudinary.com/${cloud}/${path}`;
const passes = (value: string) => {
  try {
    assertCloudinaryUrls([value]);
    return true;
  } catch {
    return false;
  }
};

describe('cloudNameOf', () => {
  it('lee la cuenta del primer segmento y solo en https y en res.cloudinary.com', () => {
    expect(cloudNameOf(url('mi-cuenta'))).toBe('mi-cuenta');
    expect(cloudNameOf('http://res.cloudinary.com/mi/image/upload/a.jpg')).toBeUndefined();
    expect(cloudNameOf('https://ejemplo.com/mi/image/upload/a.jpg')).toBeUndefined();
    expect(cloudNameOf('https://res.cloudinary.com/')).toBeUndefined();
    expect(cloudNameOf('no es una url')).toBeUndefined();
  });
});

describe('assertCloudinaryUrls con nuestra cuenta', () => {
  it('solo acepta nuestra cuenta (y demo fuera de producción)', () => {
    configureCloudinaryAccount({ cloudName: 'mi-cuenta', production: false });
    expect(passes(url('mi-cuenta'))).toBe(true);
    expect(passes(url('mi-cuenta', 'video/upload/libro/quiz-bg/v.mp4'))).toBe(true);
    expect(passes(url('demo'))).toBe(true); // semillas y E2E
    expect(passes(url('otra-cuenta'))).toBe(false);
    expect(passes(url('mi-cuenta-extra'))).toBe(false);
    expect(passes('https://res.cloudinary.com.malo.com/mi-cuenta/image/upload/a.jpg')).toBe(false);
    expect(passes('https://ejemplo.com/mi-cuenta/image/upload/a.jpg')).toBe(false);
    expect(passes('http://res.cloudinary.com/mi-cuenta/image/upload/a.jpg')).toBe(false);
  });

  it('en producción la cuenta demo tampoco vale', () => {
    configureCloudinaryAccount({ cloudName: 'mi-cuenta', production: true });
    expect(passes(url('mi-cuenta'))).toBe(true);
    expect(passes(url('demo'))).toBe(false);
    expect(passes(url('otra-cuenta'))).toBe(false);
  });

  it('sin cuenta configurada (desarrollo sin credenciales) basta con que sea de Cloudinary', () => {
    configureCloudinaryAccount({ production: false });
    expect(passes(url('cualquiera'))).toBe(true);
    expect(passes('https://ejemplo.com/a.jpg')).toBe(false);
  });

  it('ignora los valores ausentes y rechaza una lista que mezcle una URL ajena', () => {
    configureCloudinaryAccount({ cloudName: 'mi-cuenta', production: true });
    expect(() => assertCloudinaryUrls([undefined, url('mi-cuenta')])).not.toThrow();
    expect(() => assertCloudinaryUrls([url('mi-cuenta'), url('otra')])).toThrow();
  });
});
