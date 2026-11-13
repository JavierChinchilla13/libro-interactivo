import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';

/** Lo que cada servicio de contenido ofrece (ver `services/lifecycle.ts`). */
export interface LifecycleService<T> {
  archive(id: string): Promise<T>;
  restore(id: string): Promise<T>;
  remove(id: string, actorId: string): Promise<void>;
}

/**
 * Archivar, restaurar y eliminar: los tres manejadores son iguales para todo el contenido del panel. `param` es el
 * nombre del parámetro de la ruta con el id (`postId`, `cardId`…). Archivar y restaurar devuelven el elemento ya
 * actualizado; eliminar responde `204`.
 */
export function createLifecycleHandlers<T>(service: LifecycleService<T>, param: string) {
  const idOf = (res: Parameters<RequestHandler>[1]) =>
    getInput<unknown, unknown, Record<string, string>>(res).params[param] ?? '';
  const archive: RequestHandler = async (_req, res) => {
    res.json(await service.archive(idOf(res)));
  };
  const restore: RequestHandler = async (_req, res) => {
    res.json(await service.restore(idOf(res)));
  };
  const remove: RequestHandler = async (_req, res) => {
    await service.remove(idOf(res), getAuth(res).userId);
    res.status(204).end();
  };
  return { archive, restore, remove };
}
