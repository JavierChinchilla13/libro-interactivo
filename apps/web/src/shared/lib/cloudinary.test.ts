import { describe, expect, it } from 'vitest';
import { heightUrl, posterUrl, thumbUrl, videoUrl } from './cloudinary';

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

  const video = 'https://res.cloudinary.com/demo/video/upload/v1/libro/quiz-bg/v.mp4';
  const poster =
    'https://res.cloudinary.com/demo/video/upload/so_0,f_auto,q_auto/v1/libro/quiz-bg/v.jpg';

  it('videoUrl pide formato y calidad automáticos con el ancho acotado, sin ampliar', () => {
    expect(videoUrl(video, 540)).toBe(
      'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto,c_limit,w_540/v1/libro/quiz-bg/v.mp4',
    );
    expect(videoUrl(video)).toContain('w_720/');
  });

  it('posterUrl acota el ancho y conserva el primer fotograma (so_0) del póster', () => {
    expect(posterUrl(poster, 480)).toBe(
      'https://res.cloudinary.com/demo/video/upload/c_limit,w_480/so_0,f_auto,q_auto/v1/libro/quiz-bg/v.jpg',
    );
  });

  it('videoUrl y posterUrl devuelven igual lo que no es de Cloudinary; videoUrl ignora las imágenes', () => {
    expect(videoUrl('https://ejemplo.com/v.mp4')).toBe('https://ejemplo.com/v.mp4');
    expect(posterUrl('https://ejemplo.com/p.jpg')).toBe('https://ejemplo.com/p.jpg');
    expect(videoUrl(url)).toBe(url);
  });
});
