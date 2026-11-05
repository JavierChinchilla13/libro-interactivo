import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { apiErrorSchema, backupStatusResponseSchema } from '@libro/shared';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackgroundTasks } from '../lib/background.js';
import { createLogger, LOG_REDACTION } from '../lib/logger.js';
import { listTar } from '../lib/tar.js';
import { verifyBackup } from '../maintenance/backup.js';
import { decryptArchiveFile } from '../maintenance/backupCrypto.js';
import { BackupDownload } from '../models/BackupDownload.js';
import { User } from '../models/User.js';
import { MemoryMailProvider } from '../providers/mail/MailProvider.js';
import { createBackupDownloadService } from '../services/backupDownload.service.js';
import { staffWorld } from '../test-utils/admin.js';
import { createTestClock } from '../test-utils/app.js';
import { PASSWORD } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const FAST = { logN: 14, r: 8, p: 1 };
const ARCHIVE = 'Faro-Lejano-Ocho-2026';
const BODY = { password: PASSWORD, archivePassword: ARCHIVE, archivePasswordConfirm: ARCHIVE };
const DAY = 86_400_000;

let tmp: string;
let work: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'respaldo-panel-prueba-'));
  work = await mkdtemp(join(tmpdir(), 'respaldo-panel-salida-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
  await rm(work, { recursive: true, force: true });
});

/** Lee la respuesta como bytes (supertest la trataría como texto). */
const binary = ((
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}) as unknown as (
  res: request.Response,
  callback: (error: Error | null, body: unknown) => void,
) => void;

async function world(options: Parameters<typeof staffWorld>[0] = {}) {
  return staffWorld({ backup: { tmpDir: tmp, scrypt: FAST }, ...options });
}

/** Descifra el archivo descargado, lo extrae y devuelve la carpeta del respaldo y la lista del `.tar`. */
async function openDownload(body: Buffer, password = ARCHIVE) {
  const sealed = join(work, 'descarga.tar.cifrado');
  const tarFile = join(work, 'descarga.tar');
  await writeFile(sealed, body);
  await decryptArchiveFile(sealed, tarFile, password);
  const handle = await open(tarFile, 'r');
  try {
    const size = (await handle.stat()).size;
    const read = async (position: number, length: number) => {
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, position);
      return buf;
    };
    const entries = await listTar(read, size);
    const out = join(work, 'extraido');
    for (const entry of entries) {
      const target = join(out, entry.name);
      if (entry.type === 'dir') {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await read(entry.offset, entry.size));
    }
    const folder = entries[0]!.name.replace(/\/$/, '');
    return { folder: join(out, folder), entries };
  } finally {
    await handle.close();
  }
}

describe('permisos', () => {
  it('sin sesión 401; lectora y editora 403, para ver el estado y para descargar', async () => {
    const { app, reader, editor } = await world();
    expect((await request(app).get('/api/admin/backups')).status).toBe(401);
    expect((await request(app).post('/api/admin/backups').send(BODY)).status).toBe(401);
    for (const who of [reader, editor]) {
      const get = await who.get('/api/admin/backups');
      expect(get.status).toBe(403);
      const post = await who.post('/api/admin/backups').send(BODY);
      expect(post.status).toBe(403);
      expect(apiErrorSchema.parse(post.body).error.code).toBe('FORBIDDEN');
    }
    expect(await BackupDownload.countDocuments()).toBe(0);
  });
});

describe('validación del formulario', () => {
  it('rechaza cuerpos inválidos sin gastar cupo', async () => {
    const { app, admin } = await world({
      limits: { backupHour: { windowMs: 60_000, limit: 1, by: 'user' } },
    });
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ password: PASSWORD }, /archivePassword/],
      [
        { ...BODY, archivePassword: 'Corta-2026', archivePasswordConfirm: 'Corta-2026' },
        /12 caracteres/,
      ],
      [{ ...BODY, archivePasswordConfirm: 'Faro-Lejano-Ocho-2027' }, /no coinciden/],
      [
        { password: PASSWORD, archivePassword: PASSWORD, archivePasswordConfirm: PASSWORD },
        /distinta de la de tu cuenta/,
      ],
      [
        { ...BODY, archivePassword: 'qwertyuiop123', archivePasswordConfirm: 'qwertyuiop123' },
        /común/,
      ],
    ];
    for (const [body, message] of bad) {
      const res = await admin.post('/api/admin/backups').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(apiErrorSchema.parse(res.body).error.message).toMatch(message);
      // Nunca devuelve lo que se escribió.
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    }
    void app;
    const ok = await admin.post('/api/admin/backups').send(BODY).buffer(true).parse(binary);
    expect(ok.status).toBe(200);
  });

  it('la contraseña del archivo no puede llevar el nombre ni el correo de la cuenta', async () => {
    const { admin } = await world();
    const personal = 'Admin-Respaldo-2026';
    const res = await admin
      .post('/api/admin/backups')
      .send({ ...BODY, archivePassword: personal, archivePasswordConfirm: personal });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/nombre ni tu correo/);
  });
});

describe('contraseña de la cuenta y límites', () => {
  it('una contraseña incorrecta da 400 genérico, no descarga nada y gasta cupo', async () => {
    const { admin, mail, flush } = await world({
      limits: { backupHour: { windowMs: 60_000, limit: 2, by: 'user' } },
    });
    for (let i = 0; i < 2; i += 1) {
      const res = await admin
        .post('/api/admin/backups')
        .send({ ...BODY, password: 'No-Es-La-Mia-123' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('La contraseña no es correcta.');
    }
    const third = await admin.post('/api/admin/backups').send(BODY);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    await flush();
    expect(mail.sent).toHaveLength(0);
    expect(await BackupDownload.countDocuments()).toBe(0);
    expect(await readdir(tmp)).toEqual([]);
  });

  it('el límite por día también corta (con el de la hora todavía libre)', async () => {
    const { admin } = await world({
      limits: {
        backupHour: { windowMs: 60_000, limit: 100, by: 'user' },
        backupDay: { windowMs: DAY, limit: 2, by: 'user' },
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const res = await admin.post('/api/admin/backups').send(BODY).buffer(true).parse(binary);
      expect(res.status, String(res.body)).toBe(200);
    }
    const third = await admin.post('/api/admin/backups').send(BODY);
    expect(third.status).toBe(429);
    expect(third.body.error.message).toMatch(/varios respaldos/);
  });

  it('los límites de producción son 3 por hora y 10 por día, por usuaria', async () => {
    const { DEFAULT_LIMITS } = await import('../config/limits.js');
    expect(DEFAULT_LIMITS.backupHour).toEqual({ windowMs: 3_600_000, limit: 3, by: 'user' });
    expect(DEFAULT_LIMITS.backupDay).toEqual({ windowMs: DAY, limit: 10, by: 'user' });
  });
});

describe('la descarga', () => {
  it('entrega un .tar cifrado completo, sin sesiones ni enlaces de recuperación, con las cabeceras correctas', async () => {
    const { admin, adminUser, mail, flush } = await world();
    const db = mongoose.connection.db!;
    await db.collection('passwordResets').insertOne({ tokenHash: 'x', userId: adminUser._id });
    expect(await db.collection('refreshTokens').countDocuments()).toBeGreaterThan(0);

    const res = await admin.post('/api/admin/backups').send(BODY).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="universo-memorias-respaldo-\d{4}-\d{2}-\d{2}-\d{4}\.tar\.cifrado"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const body = res.body as Buffer;
    // Por trozos: la respuesta termina cuando el servidor ya limpió (ver el controlador).
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.headers['transfer-encoding']).toBe('chunked');

    // Sin la contraseña del archivo no se abre.
    await expect(openDownload(body, 'Otra-Clave-Distinta-99')).rejects.toThrow(/contraseña/);
    const { folder, entries } = await openDownload(body);
    expect(entries[0]?.type).toBe('dir');
    expect(entries.at(-1)?.name).toMatch(/\/manifiesto\.json$/);
    const { manifest, problems } = await verifyBackup(folder);
    expect(problems).toEqual([]);
    const names = manifest.collections.map((c) => c.name);
    expect(names).toContain('users');
    expect(names).not.toContain('refreshTokens');
    expect(names).not.toContain('passwordResets');
    expect(manifest.excluded).toEqual(['refreshTokens', 'passwordResets']);
    expect(manifest.collections.find((c) => c.name === 'users')?.count).toBe(
      await User.countDocuments(),
    );
    expect(entries.some((e) => /refreshTokens|passwordResets/.test(e.name))).toBe(false);

    // Registro sin datos personales.
    const records = await BackupDownload.find().lean();
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(Object.keys(record).sort()).toEqual(
      ['_id', 'at', 'by', 'bytes', 'collections', 'documents', 'encrypted', 'ok'].sort(),
    );
    expect(record).toMatchObject({ ok: true, encrypted: true, bytes: body.length });
    expect(String(record.by)).toBe(String(adminUser._id));
    expect(record.collections).toBe(manifest.collections.length);

    // Aviso por correo a la administradora.
    await flush();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: 'admin@ejemplo.com',
      subject: 'Se descargó un respaldo de Universo Memorias',
    });
    expect(mail.sent[0]?.text).toMatch(/Si no fuiste tú/);

    // Nada queda en el servidor.
    expect(await readdir(tmp)).toEqual([]);
  });

  it('pasado el tope de tamaño responde 503 antes de enviar nada, sin registro ni correo', async () => {
    const { admin, mail, flush } = await staffWorld({
      backup: { tmpDir: tmp, scrypt: FAST, maxBytes: 1000 },
    });
    const res = await admin.post('/api/admin/backups').send(BODY);
    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: 'UNAVAILABLE',
      message: expect.stringMatching(/no se puede descargar desde el panel/),
    });
    await flush();
    expect(mail.sent).toHaveLength(0);
    expect(await BackupDownload.countDocuments()).toBe(0);
    expect(await readdir(tmp)).toEqual([]);
  });

  it('el registro del servidor anota la descarga sin contraseñas ni correo', async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: 'info', redact: LOG_REDACTION },
      { write: (line: string) => void lines.push(line) },
    );
    const { admin } = await world({ logger });
    await admin.post('/api/admin/backups').send(BODY).buffer(true).parse(binary);
    const log = lines.join('\n');
    expect(log).toContain('Respaldo descargado');
    for (const secret of [PASSWORD, ARCHIVE, 'admin@ejemplo.com']) {
      expect(log).not.toContain(secret);
    }
  });

  it('se conservan solo las últimas 50 descargas', async () => {
    const { admin, adminUser } = await world();
    const base = Date.now() - 100 * DAY;
    await BackupDownload.insertMany(
      Array.from({ length: 55 }, (_, i) => ({
        at: new Date(base + i * DAY),
        by: adminUser._id,
        ok: true,
        bytes: 10,
        collections: 1,
        documents: 1,
      })),
    );
    await admin.post('/api/admin/backups').send(BODY).buffer(true).parse(binary);
    expect(await BackupDownload.countDocuments()).toBe(50);
    const oldest = await BackupDownload.findOne().sort({ at: 1 }).lean();
    expect(oldest?.at.getTime()).toBe(base + 6 * DAY);
  });
});

describe('estado (GET)', () => {
  it('sin respaldos: nunca; después: hace 0 días; hace 8 días; una descarga cortada no cuenta como respaldo', async () => {
    const clock = createTestClock();
    const { admin, adminUser } = await world({ clock });
    const empty = await admin.get('/api/admin/backups');
    expect(empty.status).toBe(200);
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(backupStatusResponseSchema.parse(empty.body)).toEqual({
      lastAt: null,
      daysAgo: null,
      staleAfterDays: 7,
      downloads: [],
    });

    const at = clock().toISOString();
    await admin.post('/api/admin/backups').send(BODY).buffer(true).parse(binary);
    const fresh = backupStatusResponseSchema.parse((await admin.get('/api/admin/backups')).body);
    expect(fresh.lastAt).toBe(at);
    expect(fresh.daysAgo).toBe(0);
    expect(fresh.downloads).toEqual([
      {
        at,
        by: { id: String(adminUser._id), name: adminUser.name },
        ok: true,
        bytes: expect.any(Number),
      },
    ]);

    // El último completo fue hace 8 días; después hubo una descarga cortada (no cuenta).
    await BackupDownload.deleteMany({});
    const old = new Date(clock().getTime() - 8 * DAY - 60_000);
    const doc = { by: adminUser._id, bytes: 5, collections: 1, documents: 1 };
    await BackupDownload.create({ ...doc, at: old, ok: true });
    await BackupDownload.create({ ...doc, at: clock(), ok: false });
    const later = backupStatusResponseSchema.parse((await admin.get('/api/admin/backups')).body);
    expect(later.lastAt).toBe(old.toISOString());
    expect(later.daysAgo).toBe(8);
    expect(later.downloads.map((d) => d.ok)).toEqual([false, true]);
  });

  it('muestra como mucho 10 descargas y «null» si la cuenta ya no existe', async () => {
    const { admin, adminUser } = await world();
    const ghost = new mongoose.Types.ObjectId();
    await BackupDownload.insertMany(
      Array.from({ length: 12 }, (_, i) => ({
        at: new Date(Date.now() - i * 60_000),
        by: i === 0 ? ghost : adminUser._id,
        ok: true,
        bytes: 1,
        collections: 1,
        documents: 1,
      })),
    );
    const status = backupStatusResponseSchema.parse((await admin.get('/api/admin/backups')).body);
    expect(status.downloads).toHaveLength(10);
    expect(status.downloads[0]?.by).toBeNull();
    expect(status.downloads[1]?.by?.name).toBe(adminUser.name);
  });
});

describe('servicio: uno a la vez y descargas cortadas', () => {
  it('mientras hay un respaldo en curso, otro recibe 429; una descarga cortada queda registrada como incompleta y limpia los temporales', async () => {
    await staffWorld(); // crea las cuentas (admin@ejemplo.com)
    const adminUser = await User.findOne({ email: 'admin@ejemplo.com' }).orFail();
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const mail = new MemoryMailProvider();
    const tasks = createBackgroundTasks(createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    const service = createBackupDownloadService({
      clock: () => new Date(),
      mail,
      tasks,
      logger,
      tmpDir: tmp,
      scrypt: FAST,
    });
    const id = String(adminUser._id);

    const first = await service.prepare(id, BODY);
    await expect(service.prepare(id, BODY)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: expect.stringMatching(/Ya se está preparando un respaldo/),
    });
    expect((await readdir(tmp)).length).toBe(1);

    // La conexión se corta después del primer trozo.
    let seen = 0;
    const broken = new Writable({
      write(_chunk, _encoding, callback) {
        seen += 1;
        callback(seen > 1 ? new Error('conexión cortada') : null);
      },
    });
    await expect(first.writeTo(broken)).rejects.toThrow();
    await first.dispose();
    expect(await readdir(tmp)).toEqual([]);
    const record = await BackupDownload.findOne().lean();
    expect(record?.ok).toBe(false);
    expect(lines.join('\n')).toContain('Respaldo cortado antes de terminar');
    await tasks.idle();
    expect(mail.sent).toHaveLength(1); // el aviso sale igual: una descarga cortada también se avisa

    // Suelto el candado, se puede volver a preparar.
    const again = await service.prepare(id, BODY);
    await again.dispose();
    expect(await readdir(tmp)).toEqual([]);
  });

  it('borra carpetas temporales viejas que dejó una descarga interrumpida', async () => {
    await staffWorld();
    const adminUser = await User.findOne({ email: 'admin@ejemplo.com' }).orFail();
    const stale = join(tmp, 'um-respaldo-viejo');
    const other = join(tmp, 'otra-cosa');
    await mkdir(stale);
    await mkdir(other);
    const { utimes } = await import('node:fs/promises');
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await utimes(stale, old, old);
    await utimes(other, old, old);
    const service = createBackupDownloadService({
      clock: () => new Date(),
      mail: new MemoryMailProvider(),
      tasks: createBackgroundTasks(createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })),
      logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      tmpDir: tmp,
      scrypt: FAST,
    });
    const prepared = await service.prepare(String(adminUser._id), BODY);
    await prepared.dispose();
    expect(await readdir(tmp)).toEqual(['otra-cosa']);
  });
});
