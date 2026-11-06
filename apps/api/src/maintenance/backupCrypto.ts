import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Cifrado del archivo de respaldo que se descarga desde el panel: AES-256-GCM con una clave derivada por scrypt de la
 * contraseña que la administradora elige en el momento. Solo el módulo `crypto` de Node.
 *
 * Formato (`.tar.cifrado`):
 *   cabecera de 40 bytes  = «UMRESP» · versión (1) · 0 · log2(N) · r · p · 0 · sal (16) · iv (12)
 *   contenido cifrado     = el `.tar`, del mismo largo
 *   etiqueta GCM (16)     = comprueba la contraseña y que nada se alteró (la cabecera va como dato autenticado)
 *
 * Sin la contraseña el archivo no se puede abrir: no hay forma de recuperarla.
 */

const MAGIC = Buffer.from('UMRESP', 'ascii');
const VERSION = 1;
export const ARCHIVE_HEADER_BYTES = 40;
export const ARCHIVE_TAG_BYTES = 16;
/** Bytes que el cifrado añade al `.tar` (cabecera y etiqueta). */
export const ARCHIVE_OVERHEAD = ARCHIVE_HEADER_BYTES + ARCHIVE_TAG_BYTES;

export interface ScryptParams {
  logN: number;
  r: number;
  p: number;
}

/** N = 2^16, r = 8, p = 1: unos 64 MB de memoria y una fracción de segundo por derivación. */
export const DEFAULT_SCRYPT: ScryptParams = { logN: 16, r: 8, p: 1 };

/** Límites al leer un archivo: un archivo hecho a mano no puede pedir una derivación enorme. */
function assertSaneParams({ logN, r, p }: ScryptParams): void {
  if (logN < 14 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 4) {
    throw new Error('El archivo no es un respaldo cifrado válido.');
  }
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.logN;
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFC'),
      salt,
      32,
      { N, r: params.r, p: params.p, maxmem: 256 * N * params.r + 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function buildHeader(params: ScryptParams, salt: Buffer, iv: Buffer): Buffer {
  const header = Buffer.alloc(ARCHIVE_HEADER_BYTES, 0);
  MAGIC.copy(header, 0);
  header[6] = VERSION;
  header[8] = params.logN;
  header[9] = params.r;
  header[10] = params.p;
  salt.copy(header, 12);
  iv.copy(header, 28);
  return header;
}

function parseHeader(header: Buffer): { params: ScryptParams; salt: Buffer; iv: Buffer } {
  if (
    header.length !== ARCHIVE_HEADER_BYTES ||
    !header.subarray(0, 6).equals(MAGIC) ||
    header[6] !== VERSION
  ) {
    throw new Error('El archivo no es un respaldo cifrado de Universo Memorias.');
  }
  const params = { logN: header[8] ?? 0, r: header[9] ?? 0, p: header[10] ?? 0 };
  assertSaneParams(params);
  return {
    params,
    salt: Buffer.from(header.subarray(12, 28)),
    iv: Buffer.from(header.subarray(28, 40)),
  };
}

export interface ArchiveEncryptor {
  /** Cifra el contenido y produce el archivo completo: cabecera, contenido cifrado y etiqueta. */
  encrypt(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer>;
}

/**
 * Prepara el cifrado (deriva la clave antes de enviar nada: si falla, todavía se puede responder con un error normal).
 * La contraseña no se guarda: solo vive en esta llamada.
 */
export async function createArchiveEncryptor(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT,
): Promise<ArchiveEncryptor> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, params);
  const header = buildHeader(params, salt, iv);
  return {
    async *encrypt(source) {
      const cipher: CipherGCM = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(header);
      yield header;
      for await (const chunk of source) {
        const out = cipher.update(chunk);
        if (out.length > 0) yield out;
      }
      const rest = cipher.final();
      if (rest.length > 0) yield rest;
      yield cipher.getAuthTag();
    },
  };
}

/** ¿El archivo empieza con la marca del respaldo cifrado? */
export async function isEncryptedArchive(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    return bytesRead === MAGIC.length && head.equals(MAGIC);
  } finally {
    await handle.close();
  }
}

export const WRONG_KEY_MESSAGE =
  'No se pudo abrir el respaldo: la contraseña no es correcta o el archivo está dañado o alterado.';

/**
 * Descifra `input` en `output`. Si la contraseña no es la correcta o el archivo se alteró (aunque sea un byte), la
 * etiqueta GCM no coincide: se borra lo escrito y se lanza `WRONG_KEY_MESSAGE`. Solo con éxito queda `output`.
 */
export async function decryptArchiveFile(
  input: string,
  output: string,
  password: string,
): Promise<void> {
  const handle = await open(input, 'r');
  let header: Buffer;
  let tag: Buffer;
  let size: number;
  try {
    size = (await handle.stat()).size;
    if (size < ARCHIVE_OVERHEAD) throw new Error('El archivo no es un respaldo cifrado válido.');
    header = Buffer.alloc(ARCHIVE_HEADER_BYTES);
    await handle.read(header, 0, ARCHIVE_HEADER_BYTES, 0);
    tag = Buffer.alloc(ARCHIVE_TAG_BYTES);
    await handle.read(tag, 0, ARCHIVE_TAG_BYTES, size - ARCHIVE_TAG_BYTES);
  } finally {
    await handle.close();
  }
  const { params, salt, iv } = parseHeader(header);
  const key = await deriveKey(password, salt, params);
  const decipher: DecipherGCM = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const end = size - ARCHIVE_TAG_BYTES - 1;
  try {
    const source =
      end >= ARCHIVE_HEADER_BYTES
        ? createReadStream(input, { start: ARCHIVE_HEADER_BYTES, end })
        : Readable.from([]);
    await pipeline(
      source,
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          callback(null, decipher.update(chunk));
        },
        flush(callback) {
          try {
            callback(null, decipher.final());
          } catch {
            callback(new Error(WRONG_KEY_MESSAGE));
          }
        },
      }),
      createWriteStream(output),
    );
  } catch (error) {
    await rm(output, { force: true });
    throw error instanceof Error && error.message === WRONG_KEY_MESSAGE
      ? error
      : new Error(WRONG_KEY_MESSAGE);
  }
}
