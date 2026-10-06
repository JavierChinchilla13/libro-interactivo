import { describe, expect, it, vi } from 'vitest';
import { S3StorageProvider } from './S3StorageProvider.js';

/** Ejemplo oficial de AWS para una URL prefirmada de GET (Signature V4). */
const AWS_EXAMPLE = {
  endpoint: 'https://s3.amazonaws.com',
  bucket: 'examplebucket',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  forcePathStyle: false,
  clock: () => new Date('2013-05-24T00:00:00Z'),
};

describe('S3StorageProvider (firma AWS Signature V4)', () => {
  it('reproduce EXACTAMENTE la firma del ejemplo oficial de AWS', () => {
    const url = new S3StorageProvider(AWS_EXAMPLE).presign('GET', 'test.txt', 86400);
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  const r2 = {
    endpoint: 'https://cuenta.r2.cloudflarestorage.com',
    bucket: 'libro-privado',
    accessKeyId: 'clave',
    secretAccessKey: 'secreto',
    region: 'auto',
    forcePathStyle: true,
    clock: () => new Date('2026-10-06T12:00:00Z'),
  };

  it('con estilo de ruta pone el bucket en la ruta, sin filtrar el secreto', async () => {
    const storage = new S3StorageProvider(r2);
    const url = await storage.createDownloadUrl('extras/libro-1/capitulo extra.pdf', 180);
    expect(
      url.startsWith(
        'https://cuenta.r2.cloudflarestorage.com/libro-privado/extras/libro-1/capitulo%20extra.pdf?',
      ),
    ).toBe(true);
    expect(url).toContain('X-Amz-Expires=180');
    expect(url).toContain('X-Amz-Date=20261006T120000Z');
    expect(url).not.toContain('secreto');
  });

  it('el permiso de subida firma el tipo de contenido (cambiarlo invalida la firma)', async () => {
    const storage = new S3StorageProvider(r2);
    const target = await storage.createUploadUrl('extras/a.pdf', 'application/pdf');
    expect(target.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(target.url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    const other = await storage.createUploadUrl('extras/a.pdf', 'text/html');
    expect(other.url).not.toBe(target.url);
    const signature = (url: string) => /X-Amz-Signature=([0-9a-f]+)/.exec(url)?.[1];
    expect(signature(other.url)).not.toBe(signature(target.url));
  });

  it('la caducidad se limita a una hora y es determinista para la misma hora', async () => {
    const storage = new S3StorageProvider(r2);
    expect(await storage.createDownloadUrl('k', 999_999)).toContain('X-Amz-Expires=3600');
    expect(await storage.createDownloadUrl('k', 60)).toBe(await storage.createDownloadUrl('k', 60));
  });

  it('head devuelve tipo y tamaño, null si no existe y falla con otros errores', async () => {
    const fetchFn = vi.fn();
    const storage = new S3StorageProvider({ ...r2, fetchFn: fetchFn as unknown as typeof fetch });
    fetchFn.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': '1234' },
      }),
    );
    expect(await storage.head('k')).toEqual({ key: 'k', mime: 'application/pdf', size: 1234 });
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await storage.head('k')).toBeNull();
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(storage.head('k')).rejects.toThrow();
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: 'HEAD' });
  });

  it('remove borra y tolera que ya no exista', async () => {
    const fetchFn = vi.fn();
    const storage = new S3StorageProvider({ ...r2, fetchFn: fetchFn as unknown as typeof fetch });
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await storage.remove('k');
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await storage.remove('k');
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(storage.remove('k')).rejects.toThrow();
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
