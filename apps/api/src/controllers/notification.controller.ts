import type { NotificationParams, NotificationTarget } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { NotificationService } from '../services/notification.service.js';

/** `/admin/notifications`: avisos por correo (solo administradoras). Nada se cachea. */
export function createNotificationController(notifications: NotificationService) {
  const list: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ jobs: await notifications.list() });
  };
  const preview: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, NotificationTarget>(res);
    res.set('Cache-Control', 'no-store').json(await notifications.preview(query));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<NotificationTarget>(res);
    const result = await notifications.create(getAuth(res).userId, body);
    res.status(result.created ? 201 : 200).json(result);
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, NotificationParams>(res);
    res.set('Cache-Control', 'no-store').json(await notifications.get(params.notificationId));
  };
  const cancel: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, NotificationParams>(res);
    res.json(await notifications.cancel(params.notificationId));
  };
  return { list, preview, create, get, cancel };
}
