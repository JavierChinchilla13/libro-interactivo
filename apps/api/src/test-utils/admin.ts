import type { BookInputPayload, ImageRef, WikiEntryInputPayload } from '@libro/shared';
import { createTestHarness } from './app.js';
import { createUser, loginAgent } from './auth.js';

/** Imagen de ejemplo con la forma de un `ImageRef` de Cloudinary. */
export function image(name = 'demo', over: Partial<ImageRef> = {}): ImageRef {
  return {
    provider: 'cloudinary',
    publicId: `libro/${name}`,
    url: `https://res.cloudinary.com/demo/image/upload/libro/${name}`,
    width: 1200,
    height: 800,
    alt: `[PLACEHOLDER] ${name}`,
    deliveryType: 'upload',
    ...over,
  };
}

export function validBook(over: Partial<BookInputPayload> = {}): BookInputPayload {
  return {
    slug: 'libro-1',
    title: '[PLACEHOLDER] Libro 1',
    synopsis: '<p>[PLACEHOLDER] Sinopsis.</p>',
    order: 1,
    status: 'draft',
    ...over,
  };
}

export function validEntry(over: Partial<WikiEntryInputPayload> = {}): WikiEntryInputPayload {
  return {
    kind: 'term',
    slug: 'termino-1',
    name: '[PLACEHOLDER] Término 1',
    status: 'published',
    ...over,
  };
}

/** Mundo de pruebas del panel: una administradora, una editora y una lectora, ya con sesión iniciada. */
export async function staffWorld(options: Parameters<typeof createTestHarness>[0] = {}) {
  const harness = createTestHarness(options);
  const adminUser = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const editorUser = await createUser({ email: 'editora@ejemplo.com', role: 'EDITOR' });
  await createUser();
  return {
    ...harness,
    adminUser,
    editorUser,
    admin: await loginAgent(harness.app, 'admin@ejemplo.com'),
    editor: await loginAgent(harness.app, 'editora@ejemplo.com'),
    reader: await loginAgent(harness.app),
  };
}
