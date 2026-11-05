/**
 * Escritor y lector mínimos de archivos `.tar` (formato ustar), sin dependencias. Solo lo que necesita el respaldo:
 * carpetas y archivos normales con nombres cortos en ASCII. El `.tar` resultante lo abre `tar -xf` de Windows 10/11,
 * macOS y Linux.
 *
 * Cada entrada es una cabecera de 512 bytes seguida del contenido rellenado con ceros hasta un múltiplo de 512; el
 * archivo termina con dos bloques de ceros.
 */

export const BLOCK = 512;
/** Largo máximo del nombre (campo `name` de ustar; no se usa `prefix` para no complicar el lector). */
export const TAR_NAME_MAX = 100;
const SAFE_NAME = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?$/;

export interface TarEntry {
  /** Ruta dentro del `.tar` con `/`; las carpetas terminan en `/`. */
  name: string;
  /** Tamaño exacto del contenido (0 para carpetas). */
  size: number;
  mtime: Date;
  /** Contenido (no se pide para carpetas). Debe producir exactamente `size` bytes. */
  content?: () => AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}

function isDir(name: string): boolean {
  return name.endsWith('/');
}

function assertSafeName(name: string): void {
  if (
    Buffer.byteLength(name) > TAR_NAME_MAX ||
    !SAFE_NAME.test(name) ||
    name.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error(`Nombre no válido para el archivo tar: ${JSON.stringify(name)}`);
  }
}

function padding(size: number): number {
  return (BLOCK - (size % BLOCK)) % BLOCK;
}

/** Tamaño total del `.tar` (sirve para `Content-Length` antes de empezar a enviar). */
export function tarSize(entries: Pick<TarEntry, 'size'>[]): number {
  return (
    entries.reduce((sum, entry) => sum + BLOCK + entry.size + padding(entry.size), 0) + 2 * BLOCK
  );
}

function writeString(buf: Buffer, offset: number, length: number, value: string): void {
  buf.write(value, offset, length, 'ascii');
}

function writeOctal(buf: Buffer, offset: number, length: number, value: number): void {
  // `length - 1` dígitos octales y un NUL al final.
  const digits = Math.floor(value)
    .toString(8)
    .padStart(length - 1, '0');
  if (digits.length > length - 1) throw new Error('Valor demasiado grande para la cabecera tar.');
  writeString(buf, offset, length, `${digits}\0`);
}

/** Cabecera ustar de 512 bytes para una entrada. */
export function tarHeader(entry: Pick<TarEntry, 'name' | 'size' | 'mtime'>): Buffer {
  assertSafeName(entry.name);
  const dir = isDir(entry.name);
  if (dir && entry.size !== 0) throw new Error('Una carpeta no tiene contenido.');
  const buf = Buffer.alloc(BLOCK, 0);
  writeString(buf, 0, 100, entry.name);
  writeOctal(buf, 100, 8, dir ? 0o755 : 0o644);
  writeOctal(buf, 108, 8, 0); // uid
  writeOctal(buf, 116, 8, 0); // gid
  writeOctal(buf, 124, 12, entry.size);
  writeOctal(buf, 136, 12, Math.floor(entry.mtime.getTime() / 1000));
  buf.fill(0x20, 148, 156); // la suma se calcula con el campo lleno de espacios
  writeString(buf, 156, 1, dir ? '5' : '0');
  writeString(buf, 257, 6, 'ustar\0');
  writeString(buf, 263, 2, '00');
  let sum = 0;
  for (const byte of buf) sum += byte;
  writeString(buf, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  return buf;
}

/**
 * Produce el `.tar` en trozos, entrada por entrada (sin cargar los archivos en memoria). Comprueba que cada contenido
 * tenga exactamente el tamaño anunciado: si no, el `.tar` quedaría corrupto y se corta con un error.
 */
export async function* tarStream(entries: TarEntry[]): AsyncGenerator<Buffer> {
  for (const entry of entries) {
    yield tarHeader(entry);
    if (isDir(entry.name)) continue;
    let written = 0;
    for await (const chunk of entry.content?.() ?? []) {
      written += chunk.length;
      if (written > entry.size) break;
      yield Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }
    if (written !== entry.size) {
      throw new Error(`El contenido de «${entry.name}» no tiene el tamaño anunciado.`);
    }
    const pad = padding(entry.size);
    if (pad > 0) yield Buffer.alloc(pad, 0);
  }
  yield Buffer.alloc(2 * BLOCK, 0);
}

export interface ParsedTarEntry {
  name: string;
  size: number;
  type: 'file' | 'dir';
  /** Posición del contenido dentro del `.tar`. */
  offset: number;
}

function readOctal(buf: Buffer, offset: number, length: number): number {
  const text = buf
    .toString('ascii', offset, offset + length)
    .replace(/[\0 ]+$/g, '')
    .trim();
  if (!/^[0-7]+$/.test(text)) throw new Error('Cabecera tar dañada.');
  return parseInt(text, 8);
}

/** Lee y valida una cabecera; devuelve `null` en el bloque de ceros del final. */
export function parseTarHeader(block: Buffer): Omit<ParsedTarEntry, 'offset'> | null {
  if (block.length !== BLOCK) throw new Error('Cabecera tar incompleta.');
  if (block.every((byte) => byte === 0)) return null;
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
  if (readOctal(block, 148, 8) !== sum) throw new Error('Cabecera tar dañada (suma de control).');
  const name = block.toString('ascii', 0, 100).replace(/\0.*$/s, '');
  const typeflag = block.toString('ascii', 156, 157);
  const type = typeflag === '5' ? 'dir' : typeflag === '0' || typeflag === '\0' ? 'file' : null;
  if (!type) throw new Error(`Tipo de entrada tar no admitido en «${name}».`);
  assertSafeName(type === 'dir' && !name.endsWith('/') ? `${name}/` : name);
  return { name, size: readOctal(block, 124, 12), type };
}

/**
 * Lista las entradas de un `.tar` ya en memoria o leído por partes: recibe una función que lee `length` bytes desde
 * `position`. Rechaza nombres con `..`, rutas absolutas, enlaces y cualquier otro tipo que no sea archivo o carpeta.
 */
export async function listTar(
  read: (position: number, length: number) => Promise<Buffer>,
  totalSize: number,
): Promise<ParsedTarEntry[]> {
  const entries: ParsedTarEntry[] = [];
  let position = 0;
  while (position + BLOCK <= totalSize) {
    const header = parseTarHeader(await read(position, BLOCK));
    if (!header) return entries;
    position += BLOCK;
    if (position + header.size > totalSize) throw new Error('El archivo tar está cortado.');
    entries.push({ ...header, offset: position });
    position += header.size + padding(header.size);
  }
  throw new Error('El archivo tar está cortado (falta el final).');
}
