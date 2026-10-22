import { describe, expect, it } from 'vitest';
import { heightUrl, thumbUrl } from './cloudinary';

const url = 'https://res.cloudinary.com/demo/image/upload/v1/libro/misc/a.jpg';

describe('cloudinary', () => {
  it('thumbUrl acota el ancho', () => {
    expect(thumbUrl(url, 480)).toContain('/upload/f_auto,q_auto,w_480/');
  });

  it('heightUrl acota el alto sin ampliar (c_limit)', () => {
    expect(heightUrl(url, 560)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,h_560/v1/libro/misc/a.jpg',
    );
  });

  it('una URL que no es de Cloudinary se devuelve igual', () => {
    expect(heightUrl('https://ejemplo.com/a.jpg')).toBe('https://ejemplo.com/a.jpg');
    expect(thumbUrl('https://ejemplo.com/a.jpg')).toBe('https://ejemplo.com/a.jpg');
  });
});
