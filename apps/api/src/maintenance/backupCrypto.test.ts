import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARCHIVE_HEADER_BYTES,
  ARCHIVE_OVERHEAD,
  DEFAULT_SCRYPT,
  WRONG_KEY_MESSAGE,
  createArchiveEncryptor,
  decryptArchiveFile,
  isEncryptedArchive,
} from './backupCrypto.js';

const FAST = { logN: 14, r: 8, p: 1 };
const KEY = 'Faro-Lejano-Ocho-2026';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cifrado-prueba-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function encrypt(plain: Buffer, password = KEY, chunkSize = 1000): Promise<Buffer> {
  const encryptor = await createArchiveEncryptor(password, FAST);
  async function* source() {
    for (let i = 0; i < plain.length; i += chunkSize) yield plain.subarray(i, i + chunkSize);
  }
  const out: Buffer[] = [];
  for await (const chunk of encryptor.encrypt(source())) out.push(chunk);
  return Buffer.concat(out);
}

async function roundTrip(sealed: Buffer, password = KEY): Promise<Buffer> {
  const input = join(dir, 'r.tar.cifrado');
  const output = join(dir, 'r.tar');
  await writeFile(input, sealed);
  await decryptArchiveFile(input, output, password);
  return readFile(output);
}

describe('cifrado del respaldo (AES-256-GCM + scrypt)', () => {
  it('ida y vuelta con la contraseña correcta; el tamaño es el del contenido más 56 bytes', async () => {
    const plain = randomBytes(70_000);
    const sealed = await encrypt(plain);
    expect(sealed.length).toBe(plain.length + ARCHIVE_OVERHEAD);
    expect(sealed.subarray(0, 6).toString('ascii')).toBe('UMRESP');
    expect((await roundTrip(sealed)).equals(plain)).toBe(true);
  });

  it('también con contenido vacío', async () => {
    const sealed = await encrypt(Buffer.alloc(0));
    expect(sealed.length).toBe(ARCHIVE_OVERHEAD);
    expect((await roundTrip(sealed)).length).toBe(0);
  });

  it('el contenido no aparece en claro y cada cifrado es distinto (sal e iv nuevos)', async () => {
    const plain = Buffer.from('correo@ejemplo.com '.repeat(200));
    const a = await encrypt(plain);
    const b = await encrypt(plain);
    expect(a.includes(Buffer.from('correo@ejemplo.com'))).toBe(false);
    expect(a.includes(Buffer.from(KEY))).toBe(false);
    expect(a.subarray(12, ARCHIVE_HEADER_BYTES).equals(b.subarray(12, ARCHIVE_HEADER_BYTES))).toBe(
      false,
    );
  });

  it('con otra contraseña falla, no deja el archivo descifrado y da un mensaje claro', async () => {
    const sealed = await encrypt(randomBytes(5000));
    await expect(roundTrip(sealed, 'Otra-Clave-Distinta-99')).rejects.toThrow(WRONG_KEY_MESSAGE);
    expect(await readdir(dir)).toEqual(['r.tar.cifrado']);
  });

  it('un solo byte alterado (cabecera, contenido o etiqueta) se detecta', async () => {
    const sealed = await encrypt(randomBytes(5000));
    // 13: sal; 30: iv; después, un byte del contenido; el último: la etiqueta.
    for (const position of [13, 30, ARCHIVE_HEADER_BYTES + 2000, sealed.length - 1]) {
      const altered = Buffer.from(sealed);
      altered[position] = (altered[position] ?? 0) ^ 0x01;
      await expect(roundTrip(altered), `byte ${position}`).rejects.toThrow(WRONG_KEY_MESSAGE);
    }
    // Cortado (falta el final) tampoco pasa.
    await expect(roundTrip(sealed.subarray(0, sealed.length - 100))).rejects.toThrow(
      WRONG_KEY_MESSAGE,
    );
  });

  it('rechaza un archivo que no es un respaldo cifrado y parámetros de scrypt fuera de rango', async () => {
    await expect(roundTrip(randomBytes(500))).rejects.toThrow(/no es un respaldo cifrado/);
    await expect(roundTrip(Buffer.from('UMRESP'))).rejects.toThrow(/no es un respaldo cifrado/);
    const sealed = await encrypt(Buffer.from('hola'));
    const greedy = Buffer.from(sealed);
    greedy[8] = 30; // N = 2^30: un archivo hecho a mano no puede pedir eso
    await expect(roundTrip(greedy)).rejects.toThrow(/no es un respaldo cifrado válido/);
  });

  it('isEncryptedArchive reconoce la marca', async () => {
    const yes = join(dir, 'si');
    const no = join(dir, 'no');
    await writeFile(yes, await encrypt(Buffer.from('x')));
    await writeFile(no, Buffer.from('ustar...'));
    expect(await isEncryptedArchive(yes)).toBe(true);
    expect(await isEncryptedArchive(no)).toBe(false);
  });

  it('en producción usa N = 2^16, r = 8, p = 1', async () => {
    expect(DEFAULT_SCRYPT).toEqual({ logN: 16, r: 8, p: 1 });
    const encryptor = await createArchiveEncryptor(KEY);
    const out: Buffer[] = [];
    for await (const chunk of encryptor.encrypt((async function* () {})())) out.push(chunk);
    const header = Buffer.concat(out).subarray(0, ARCHIVE_HEADER_BYTES);
    expect([header[8], header[9], header[10]]).toEqual([16, 8, 1]);
  });
});
