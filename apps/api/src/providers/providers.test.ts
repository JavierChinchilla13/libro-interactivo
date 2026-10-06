import { describe, expect, it } from 'vitest';
import { MemoryMailProvider } from './mail/MailProvider.js';
import { MemoryStorageProvider } from './storage/StorageProvider.js';

describe('adaptadores en memoria', () => {
  it('MailProvider guarda los correos enviados', async () => {
    const mail = new MemoryMailProvider();
    await mail.send({ to: 'a@ejemplo.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe('a@ejemplo.com');
  });

  it('StorageProvider emite URLs temporales y gestiona objetos', async () => {
    const storage = new MemoryStorageProvider();
    const upload = await storage.createUploadUrl('extras/libro-1/e1.pdf', 'application/pdf');
    expect(upload.url).toContain('upload');
    expect(upload.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(await storage.head('extras/libro-1/e1.pdf')).toBeNull(); // aún no se subió nada
    storage.putObject({ key: 'extras/libro-1/e1.pdf', mime: 'application/pdf', size: 10 });
    expect(await storage.head('extras/libro-1/e1.pdf')).toMatchObject({ mime: 'application/pdf' });
    expect(await storage.createDownloadUrl('extras/libro-1/e1.pdf', 120)).toContain('ttl=120');
    await storage.remove('extras/libro-1/e1.pdf');
    expect(await storage.head('extras/libro-1/e1.pdf')).toBeNull();
  });
});
