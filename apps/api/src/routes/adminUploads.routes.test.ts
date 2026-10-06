import { createHash } from 'node:crypto';
import { apiErrorSchema, imageSignatureResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const CLOUD = { CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'secreto-de-prueba' };
const url = '/api/admin/uploads/image-signature';

describe('POST /api/admin/uploads/image-signature', () => {
  it('exige sesión y rol de editora o administradora', async () => {
    const { app, reader, editor, admin } = await staffWorld({ env: CLOUD });
    await request(app).post(url).send({ purpose: 'cover' }).expect(401);
    expect((await reader.post(url).send({ purpose: 'cover' })).status).toBe(403);
    await editor.post(url).send({ purpose: 'cover' }).expect(200);
    await admin.post(url).send({ purpose: 'cover' }).expect(200);
  });

  it('firma como Cloudinary (SHA-1 de los parámetros ordenados + secreto) y no revela el secreto', async () => {
    const { editor } = await staffWorld({ env: CLOUD });
    const before = Math.floor(Date.now() / 1000);
    const res = await editor.post(url).send({ purpose: 'cover' }).expect(200);
    const body = imageSignatureResponseSchema.parse(res.body);

    const timestamp = body.params['timestamp'] ?? '';
    expect(Number(timestamp)).toBeGreaterThanOrEqual(before);
    expect(Number(timestamp)).toBeLessThanOrEqual(before + 5);
    expect(body.params).toEqual({
      allowed_formats: 'jpg,jpeg,png,webp,gif',
      folder: 'libro/cover',
      timestamp,
    });
    const expected = createHash('sha1')
      .update(`allowed_formats=jpg,jpeg,png,webp,gif&folder=libro/cover&timestamp=${timestamp}${CLOUD.CLOUDINARY_API_SECRET}`)
      .digest('hex');
    expect(body.signature).toBe(expected);
    expect(body).toMatchObject({
      cloudName: 'demo',
      apiKey: '123456',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
    });
    expect(JSON.stringify(res.body)).not.toContain(CLOUD.CLOUDINARY_API_SECRET);
  });

  it('la carpeta depende del propósito y el video solo se admite para resultados de quiz', async () => {
    const { editor } = await staffWorld({ env: CLOUD });
    const wiki = imageSignatureResponseSchema.parse((await editor.post(url).send({ purpose: 'wiki' }).expect(200)).body);
    expect(wiki.params['folder']).toBe('libro/wiki');

    const video = imageSignatureResponseSchema.parse(
      (await editor.post(url).send({ purpose: 'quiz', resource: 'video' }).expect(200)).body,
    );
    expect(video.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/video/upload');
    expect(video.params['allowed_formats']).toBe('mp4,webm');
    expect(video.maxBytes).toBe(5 * 1024 * 1024);

    const notQuiz = await editor.post(url).send({ purpose: 'cover', resource: 'video' });
    expect(notQuiz.status).toBe(400);
    expect(apiErrorSchema.parse(notQuiz.body).error.code).toBe('VALIDATION');
  });

  it('valida el cuerpo (propósito desconocido, recurso desconocido)', async () => {
    const { editor } = await staffWorld({ env: CLOUD });
    expect((await editor.post(url).send({ purpose: 'otro' })).status).toBe(400);
    expect((await editor.post(url).send({ purpose: 'cover', resource: 'audio' })).status).toBe(400);
    expect((await editor.post(url).send({})).status).toBe(400);
  });

  it('sin credenciales de Cloudinary responde 503 UNAVAILABLE con un mensaje claro', async () => {
    const { editor } = await staffWorld();
    const res = await editor.post(url).send({ purpose: 'cover' });
    expect(res.status).toBe(503);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({ code: 'UNAVAILABLE' });
  });
});
