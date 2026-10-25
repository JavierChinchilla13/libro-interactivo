import { luminance } from './color';

const cache = new Map<string, Promise<string | undefined>>();

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/**
 * Color de la zona más clara de una imagen (percentil 95 de luminancia), para decidir cuánto velo necesita el texto.
 * Se lee una miniatura de ~48 px en un lienzo; si el navegador no puede leerla (CORS, imagen rota, sin lienzo), da
 * `undefined` y quien llama usa el piso de seguridad. Una sola lectura por URL.
 */
export function measureBackdrop(url: string): Promise<string | undefined> {
  const known = cache.get(url);
  if (known) return known;
  const promise = new Promise<string | undefined>((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(undefined);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onerror = () => resolve(undefined);
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(
          1,
          Math.round((width * image.naturalHeight) / Math.max(1, image.naturalWidth)),
        );
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(undefined);
        context.drawImage(image, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        const pixels: { hex: string; light: number }[] = [];
        for (let i = 0; i + 3 < data.length; i += 4) {
          // Los píxeles transparentes no cuentan.
          if ((data[i + 3] ?? 0) < 128) continue;
          const hex = toHex(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
          pixels.push({ hex, light: luminance(hex) });
        }
        if (pixels.length === 0) return resolve(undefined);
        pixels.sort((a, b) => a.light - b.light);
        resolve(pixels[Math.min(pixels.length - 1, Math.floor(pixels.length * 0.95))]?.hex);
      } catch {
        // Lienzo «contaminado» (sin CORS) o sin memoria: sin medida.
        resolve(undefined);
      }
    };
    image.src = url;
  });
  cache.set(url, promise);
  return promise;
}
