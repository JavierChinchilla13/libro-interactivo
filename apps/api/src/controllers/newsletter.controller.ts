import type {
  ConfirmNewsletterRequest,
  UnsubscribeQuery,
  UpdateNewsletterRequest,
} from '@libro/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { NewsletterService } from '../services/newsletter.service.js';

/** Correos de novedades: la casilla de la cuenta, la confirmación y la baja sin sesión, y el webhook de Resend. */
export function createNewsletterController(newsletter: NewsletterService) {
  const state: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await newsletter.state(getAuth(res).userId));
  };

  const update: RequestHandler = async (_req, res) => {
    const { body } = getInput<UpdateNewsletterRequest>(res);
    res
      .set('Cache-Control', 'no-store')
      .json(await newsletter.setFromAccount(getAuth(res).userId, body.subscribed));
  };

  const declineInvitation: RequestHandler = async (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json(await newsletter.declineInvitation(getAuth(res).userId));
  };

  const confirm: RequestHandler = async (_req, res) => {
    const { body } = getInput<ConfirmNewsletterRequest>(res);
    res.set('Cache-Control', 'no-store').json(await newsletter.confirm(body.token));
  };

  /**
   * Baja en un clic (RFC 8058): el cliente de correo hace `POST` con el token en la dirección. Responde siempre lo
   * mismo, sea cual sea el token.
   */
  const unsubscribe: RequestHandler = async (_req, res) => {
    const { query } = getInput<unknown, UnsubscribeQuery>(res);
    await newsletter.unsubscribeByToken(query.t, query.origen === 'enlace' ? 'link' : 'header');
    res.set('Cache-Control', 'no-store').status(200).json({ message: 'Listo' });
  };

  const resendWebhook: RequestHandler = async (req, res) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    await newsletter.handleResendWebhook(raw, {
      id: req.get('svix-id'),
      timestamp: req.get('svix-timestamp'),
      signature: req.get('svix-signature'),
    });
    res.status(204).end();
  };

  return { state, update, declineInvitation, confirm, unsubscribe, resendWebhook };
}
