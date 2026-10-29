import type {
  AdminMessageListQuery,
  AdminUserListQuery,
  CreateStaffUserRequest,
  UpdateUserRequest,
} from '@libro/shared';
import type { RequestHandler } from 'express';
import { describeNetwork } from '../lib/networkCheck.js';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { AdminMetricsService } from '../services/adminMetrics.service.js';
import type { AdminUsersService } from '../services/adminUsers.service.js';

interface UserParams {
  userId: string;
}
interface MessageParams {
  messageId: string;
}

/** `/admin/users`: solo administradoras. Lo sensible (correos, progreso) nunca se cachea. */
export function createAdminUsersController(users: AdminUsersService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, AdminUserListQuery>(res);
    res.set('Cache-Control', 'no-store').json(await users.list(query));
  };
  const get: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, UserParams>(res);
    res.set('Cache-Control', 'no-store').json(await users.get(params.userId));
  };
  const create: RequestHandler = async (_req, res) => {
    const { body } = getInput<CreateStaffUserRequest>(res);
    res.status(201).json(await users.createStaff(getAuth(res).userId, body));
  };
  const update: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<UpdateUserRequest, unknown, UserParams>(res);
    res.json(await users.update(getAuth(res).userId, params.userId, body));
  };
  const remove: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, UserParams>(res);
    await users.remove(getAuth(res).userId, params.userId);
    res.status(204).end();
  };
  return { list, get, create, update, remove };
}

/** `/admin/contact-messages` y `/admin/stats`: solo administradoras. */
export function createAdminMetricsController(metrics: AdminMetricsService) {
  const listMessages: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, AdminMessageListQuery>(res);
    res.set('Cache-Control', 'no-store').json(await metrics.listMessages(query));
  };
  const updateMessage: RequestHandler = async (_req, res) => {
    const { body, params } = getInput<{ handled: boolean }, unknown, MessageParams>(res);
    res.json(await metrics.setHandled(getAuth(res).userId, params.messageId, body.handled));
  };
  const removeMessage: RequestHandler = async (_req, res) => {
    const { params } = getInput<unknown, unknown, MessageParams>(res);
    await metrics.removeMessage(params.messageId);
    res.status(204).end();
  };
  const stats: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await metrics.stats());
  };
  return { listMessages, updateMessage, removeMessage, stats };
}

/**
 * `/admin/network-check`: describe la cadena de proxies de la propia petición de la administradora, con las
 * direcciones enmascaradas. No se guarda ni se registra nada, y nunca se cachea.
 */
export function createAdminNetworkController(
  configuredHops: number,
  trustCloudflareHeader: boolean,
) {
  const check: RequestHandler = (req, res) => {
    const cf = req.get('cf-connecting-ip');
    res.set('Cache-Control', 'no-store').json(
      describeNetwork({
        remote: req.socket.remoteAddress ?? '',
        forwardedFor: req.get('x-forwarded-for'),
        cfConnectingIp: cf,
        configuredHops,
        trustCloudflareHeader,
      }),
    );
  };
  return { check };
}
