import { assertValidStory, type Story } from '@libro/game-core';
import { canonicalJson } from '../lib/canonicalJson.js';
import { sha256Hex } from '../lib/crypto.js';
import { GameStory } from '../models/GameStory.js';

/**
 * Carga una historia de `@libro/game-core` como versión publicada del libro. Idempotente: si ya hay una publicada con el
 * mismo contenido (mismo hash) no hace nada; si cambió, archiva la anterior y publica la siguiente versión (una versión
 * publicada es inmutable). Valida el grafo antes de guardar.
 */
export async function seedGameStory(input: {
  bookId: string;
  story: Story;
}): Promise<{ id: string; version: number; created: boolean }> {
  assertValidStory(input.story);
  const sourceHash = `sha256:${sha256Hex(canonicalJson(input.story))}`;

  const current = await GameStory.findOne({ bookId: input.bookId, status: 'published' });
  if (current && current.sourceHash === sourceHash) {
    return { id: current.id, version: current.version, created: false };
  }
  const last = await GameStory.findOne({ bookId: input.bookId }).sort({ version: -1 }).lean();
  if (current) {
    current.status = 'archived';
    await current.save();
  }
  const created = await GameStory.create({
    bookId: input.bookId,
    version: (last?.version ?? 0) + 1,
    status: 'published',
    title: input.story.title,
    startSceneId: input.story.startSceneId,
    scenes: input.story.scenes,
    endings: input.story.endings,
    sourceHash,
  });
  return { id: created.id, version: created.version, created: true };
}
