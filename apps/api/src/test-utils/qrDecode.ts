import { createRequire } from 'node:module';

type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const loaded = createRequire(import.meta.url)('jsqr') as JsQr | { default: JsQr };
const jsQR: JsQr = typeof loaded === 'function' ? loaded : loaded.default;

/** Convierte una matriz de módulos en píxeles (con margen) y la lee con un decodificador de QR independiente. */
export function decodeMatrix(matrix: boolean[][]): string | undefined {
  const scale = 6;
  const quiet = 4;
  const side = (matrix.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const at = (((r + quiet) * scale + y) * side + (c + quiet) * scale + x) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
      }
    }),
  );
  return jsQR(data, side, side)?.data;
}

/** Reconstruye la matriz de módulos a partir de los rectángulos vectoriales del PDF. */
export function matrixFromPdf(pdf: Buffer): boolean[][] {
  const text = pdf.toString('latin1');
  const rects = [...text.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re$/gm)].map(
    (m) => m.slice(1).map(Number) as [number, number, number, number],
  );
  const unit = Math.min(...rects.map(([, , , h]) => h));
  const minX = Math.min(...rects.map(([x]) => x));
  const maxX = Math.max(...rects.map(([x, , w]) => x + w));
  const maxY = Math.max(...rects.map(([, y, , h]) => y + h));
  // Los tres cuadros de las esquinas hacen que el borde de lo dibujado sea el borde del QR.
  const modules = Math.round((maxX - minX) / unit);
  const grid = Array.from({ length: modules }, () => Array<boolean>(modules).fill(false));
  for (const [x, y, w, h] of rects) {
    const row = Math.round((maxY - (y + h)) / unit);
    const col0 = Math.round((x - minX) / unit);
    for (let i = 0; i < Math.round(w / unit); i += 1) {
      const target = grid[row];
      if (target) target[col0 + i] = true;
    }
  }
  return grid;
}

/** Lee el texto que codifica el QR de un PDF generado por la app. */
export function decodePdfQr(pdf: Buffer): string | undefined {
  return decodeMatrix(matrixFromPdf(pdf));
}
