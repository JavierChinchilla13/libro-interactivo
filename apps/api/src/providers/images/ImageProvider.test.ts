import { describe, expect, it, vi } from 'vitest';
import { CloudinaryImageProvider, DisabledImageProvider } from './ImageProvider.js';

const credentials = { cloudName: 'mi-cuenta', apiKey: '123', apiSecret: 'secreto-de-prueba' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('firma de subida para fondos de quiz (quiz-bg)', () => {
  const provider = new CloudinaryImageProvider(credentials);
  it('admite imagen y video, en su propia carpeta', () => {
    const image = provider.signUpload({ purpose: 'quiz-bg', resource: 'image', timestamp: 1 });
    expect(image.params['folder']).toBe('libro/quiz-bg');
    expect(image.params['allowed_formats']).toBe('jpg,jpeg,png,webp,gif');
    const video = provider.signUpload({ purpose: 'quiz-bg', resource: 'video', timestamp: 1 });
    expect(video.params['folder']).toBe('libro/quiz-bg');
    expect(video.params['allowed_formats']).toBe('mp4,webm');
    expect(video.maxBytes).toBe(5 * 1024 * 1024);
    expect(video.uploadUrl).toBe('https://api.cloudinary.com/v1_1/mi-cuenta/video/upload');
  });

  it('el video sigue sin admitirse en otros propósitos', () => {
    for (const purpose of ['cover', 'wiki', 'theme', 'post', 'misc'] as const) {
      expect(() => provider.signUpload({ purpose, resource: 'video', timestamp: 1 })).toThrow();
    }
    expect(() =>
      provider.signUpload({ purpose: 'quiz', resource: 'video', timestamp: 1 }),
    ).not.toThrow();
  });
});

describe('consulta de archivos (API de administración)', () => {
  it('inspect pide el recurso con autenticación básica y devuelve lo que mide Cloudinary', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        public_id: 'libro/quiz-bg/abc',
        bytes: 3_200_000,
        format: 'MP4',
        width: 1280,
        height: 720,
        duration: 9.04,
        created_at: '2026-10-20T10:00:00Z',
      }),
    );
    const provider = new CloudinaryImageProvider(credentials, fetchImpl);
    const info = await provider.inspect({ publicId: 'libro/quiz-bg/abc', resource: 'video' });
    expect(info).toEqual({
      publicId: 'libro/quiz-bg/abc',
      resource: 'video',
      bytes: 3_200_000,
      format: 'mp4',
      width: 1280,
      height: 720,
      durationSeconds: 9.04,
      createdAt: '2026-10-20T10:00:00Z',
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudinary.com/v1_1/mi-cuenta/resources/video/upload/libro/quiz-bg/abc?media_metadata=true',
    );
    const auth = (init.headers as Record<string, string>)['Authorization'];
    expect(auth).toBe(`Basic ${Buffer.from('123:secreto-de-prueba').toString('base64')}`);
  });

  it('en un video pide los metadatos de medios (sin ellos Cloudinary no devuelve la duración); en una imagen, no', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ public_id: 'x', bytes: 1, format: 'mp4', width: 1, height: 1, duration: 13.4134 }),
    );
    const provider = new CloudinaryImageProvider(credentials, fetchImpl);
    await provider.inspect({ publicId: 'libro/quiz-bg/abc', resource: 'video' });
    await provider.inspect({ publicId: 'libro/quiz-bg/abc', resource: 'image' });
    const urls = fetchImpl.mock.calls.map((call) => (call as unknown as [string])[0]);
    expect(urls[0]).toBe(
      'https://api.cloudinary.com/v1_1/mi-cuenta/resources/video/upload/libro/quiz-bg/abc?media_metadata=true',
    );
    expect(urls[1]).not.toContain('media_metadata');
  });

  it('la respuesta real de un video sin metadatos no trae duración: queda sin duración, nunca inventada', async () => {
    // Forma real observada en la cuenta: sin `?media_metadata=true` faltaba `duration`.
    const without = new CloudinaryImageProvider(credentials, async () =>
      json({
        public_id: 'libro/quiz-bg/abc',
        bytes: 3_000_000,
        format: 'mp4',
        width: 1280,
        height: 720,
        created_at: '2026-10-25T10:00:00Z',
      }),
    );
    const info = await without.inspect({ publicId: 'libro/quiz-bg/abc', resource: 'video' });
    expect(info?.durationSeconds).toBeUndefined();
    const withMetadata = new CloudinaryImageProvider(credentials, async () =>
      json({
        public_id: 'libro/quiz-bg/abc',
        bytes: 3_000_000,
        format: 'mp4',
        width: 1280,
        height: 720,
        duration: 13.4134,
        created_at: '2026-10-25T10:00:00Z',
      }),
    );
    expect(
      (await withMetadata.inspect({ publicId: 'libro/quiz-bg/abc', resource: 'video' }))
        ?.durationSeconds,
    ).toBe(13.4134);
    // Una duración que no es un número positivo tampoco cuenta como medida.
    for (const duration of [0, -1, null, 'abc']) {
      const odd = new CloudinaryImageProvider(credentials, async () =>
        json({ public_id: 'x', bytes: 1, format: 'mp4', width: 1, height: 1, duration }),
      );
      expect(
        (await odd.inspect({ publicId: 'x', resource: 'video' }))?.durationSeconds,
      ).toBeUndefined();
    }
  });

  it('un archivo que no existe da null; un error de Cloudinary o de red da 503 sin revelar secretos', async () => {
    const missing = new CloudinaryImageProvider(credentials, async () => json({}, 404));
    expect(await missing.inspect({ publicId: 'x', resource: 'video' })).toBeNull();
    const broken = new CloudinaryImageProvider(credentials, async () => json({ error: 'x' }, 500));
    await expect(broken.inspect({ publicId: 'x', resource: 'video' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const offline = new CloudinaryImageProvider(credentials, async () => {
      throw new Error('ECONNREFUSED');
    });
    const error = await offline
      .inspect({ publicId: 'x', resource: 'video' })
      .catch((e: Error) => e);
    expect(error).toMatchObject({ code: 'UNAVAILABLE' });
    expect(String((error as Error).message)).not.toContain('secreto-de-prueba');
  });

  it('list recorre todas las páginas del prefijo', async () => {
    const pages = [
      {
        resources: [
          {
            public_id: 'libro/quiz-bg/a',
            bytes: 1,
            format: 'jpg',
            width: 1,
            height: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        next_cursor: 'c2',
      },
      {
        resources: [
          {
            public_id: 'libro/quiz-bg/b',
            bytes: 2,
            format: 'jpg',
            width: 1,
            height: 1,
            created_at: '2026-01-02T00:00:00Z',
          },
        ],
      },
    ];
    const fetchImpl = vi.fn(async () => json(pages.shift()));
    const provider = new CloudinaryImageProvider(credentials, fetchImpl);
    const all = await provider.list({ prefix: 'libro/quiz-bg/', resource: 'image' });
    expect(all.map((a) => a.publicId)).toEqual(['libro/quiz-bg/a', 'libro/quiz-bg/b']);
    const urls = fetchImpl.mock.calls.map((call) => (call as unknown as [string])[0]);
    expect(urls[0]).toContain('prefix=libro%2Fquiz-bg%2F');
    expect(urls[1]).toContain('next_cursor=c2');
  });

  it('destroy usa DELETE sobre ese archivo', async () => {
    const fetchImpl = vi.fn(async () => json({ deleted: {} }));
    const provider = new CloudinaryImageProvider(credentials, fetchImpl);
    await provider.destroy({ publicId: 'libro/quiz-bg/a', resource: 'image' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(decodeURIComponent(url)).toContain('public_ids[]=libro/quiz-bg/a');
  });

  it('sin credenciales, todo responde 503', async () => {
    const off = new DisabledImageProvider();
    await expect(off.inspect()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(off.list()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(off.destroy()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
