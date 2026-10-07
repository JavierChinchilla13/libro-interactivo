import { describe, expect, it } from 'vitest';
import { decodeMatrix, matrixFromPdf } from '../test-utils/qrDecode.js';
import { qrMatrix, qrPdf, qrSvg } from './qr.js';

const URL_TEXT =
  'https://libro.ejemplo.com/u/670000000000000000000030.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aaaa';

describe('QR imprimible', () => {
  it('el SVG es vectorial (sin imágenes incrustadas) y no tiene scripts', async () => {
    const svg = await qrSvg(URL_TEXT);
    expect(svg).toMatch(/^<\?xml|^<svg/);
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/<image|<script|data:image|onload/i);
  });

  it('la matriz se decodifica con un lector independiente y devuelve exactamente la URL', () => {
    expect(decodeMatrix(qrMatrix(URL_TEXT))).toBe(URL_TEXT);
  });

  it('el PDF es un PDF válido: cabecera, xref con desplazamientos exactos, fin de archivo y sin imágenes', () => {
    const pdf = qrPdf(URL_TEXT, { title: 'Libro 1 — Quiz 2', subtitle: 'Escanea con la cámara' });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).not.toMatch(/\/Image|\/XObject|\/DCTDecode|\/FlateDecode/);

    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
    expect(entries.length).toBe(6);
    entries.slice(1).forEach((entry, index) => {
      const offset = Number(entry[1]);
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
    const length = Number(/\/Length (\d+) >>\nstream\n/.exec(text)?.[1]);
    const from = text.indexOf('stream\n') + 'stream\n'.length;
    expect(text.slice(from + length, from + length + 'endstream'.length)).toBe('endstream');
  });

  it('el dibujo vectorial del PDF reproduce fielmente el QR y este se lee con la URL', () => {
    const pdf = qrPdf(URL_TEXT, { title: 'Quiz' });
    const matrix = qrMatrix(URL_TEXT);
    const drawn = matrixFromPdf(pdf);
    expect(drawn).toEqual(matrix);
    expect(decodeMatrix(drawn)).toBe(URL_TEXT);
  });

  it('es idéntico al regenerarlo (re-descarga) y escapa paréntesis y acentos del rótulo', () => {
    const a = qrPdf(URL_TEXT, { title: 'Libro (1) — Aventura \\ ñandú' });
    const b = qrPdf(URL_TEXT, { title: 'Libro (1) — Aventura \\ ñandú' });
    expect(a.equals(b)).toBe(true);
    const text = a.toString('latin1');
    expect(text).toContain('Libro \\(1\\)');
    expect(text).toContain('\\\\');
  });
});
