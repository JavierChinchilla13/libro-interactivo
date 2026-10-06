import QRCode from 'qrcode';

/**
 * QR imprimible. Ambos formatos son **vectoriales** (aptos para imprenta): el SVG lo genera `qrcode` y el PDF se
 * escribe a mano con un rectángulo por tramo de módulos oscuros (sin imágenes ni rasterizado).
 */
const OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 4 };

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...OPTIONS, type: 'svg' });
}

/** Matriz de módulos del QR (`true` = oscuro). */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: OPTIONS.errorCorrectionLevel });
  const size = modules.size;
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => modules.get(row, col) === 1),
  );
}

// Página A6 vertical, en puntos (1 pt = 1/72 in).
const PAGE_W = 297.64;
const PAGE_H = 419.53;
const QR_SIDE = 220;
const QUIET_MODULES = 4;

/** Texto para un literal de PDF en WinAnsi (Latin-1): escapa `\ ( )` y reemplaza lo que no cabe. */
function pdfText(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63;
    if (char === '\\' || char === '(' || char === ')') out += `\\${char}`;
    else if (code >= 32 && code <= 255) out += char;
    else out += '?';
  }
  return out;
}

const num = (value: number) => value.toFixed(3).replace(/\.?0+$/, '') || '0';

/** Texto centrado aproximado con Helvetica (ancho medio ≈ 0,5 em); suficiente para un rótulo corto. */
function centeredText(text: string, size: number, y: number): string {
  const width = text.length * size * 0.5;
  const x = Math.max(12, (PAGE_W - width) / 2);
  return `BT /F1 ${num(size)} Tf ${num(x)} ${num(y)} Td (${pdfText(text)}) Tj ET\n`;
}

export function qrPdf(text: string, labels: { title: string; subtitle?: string }): Buffer {
  const matrix = qrMatrix(text);
  const modules = matrix.length;
  const unit = QR_SIDE / (modules + QUIET_MODULES * 2);
  const left = (PAGE_W - QR_SIDE) / 2;
  const top = PAGE_H - 70;

  // Un rectángulo por tramo horizontal de módulos oscuros.
  let content = 'q 0 0 0 rg\n';
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < modules) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      let end = c;
      while (end + 1 < modules && row[end + 1]) end += 1;
      const x = left + (QUIET_MODULES + c) * unit;
      const y = top - (QUIET_MODULES + r + 1) * unit;
      content += `${num(x)} ${num(y)} ${num((end - c + 1) * unit)} ${num(unit)} re\n`;
      c = end + 1;
    }
  });
  content += 'f Q\n';
  content += centeredText(labels.title, 14, PAGE_H - 40);
  if (labels.subtitle) content += centeredText(labels.subtitle, 9, top - QR_SIDE - 22);

  const stream = Buffer.from(content, 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    null, // flujo de contenido (abajo)
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let length = chunks[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const head = Buffer.from(`${index + 1} 0 obj\n`, 'latin1');
    const tail = Buffer.from('\nendobj\n', 'latin1');
    const middle =
      body === null
        ? Buffer.concat([
            Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
            stream,
            Buffer.from('endstream', 'latin1'),
          ])
        : Buffer.from(body, 'latin1');
    const piece = Buffer.concat([head, middle, tail]);
    chunks.push(piece);
    length += piece.length;
  });

  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}
