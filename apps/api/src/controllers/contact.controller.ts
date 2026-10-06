import type { ContactRequest, MessageResponse } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getInput } from '../middleware/validate.js';
import type { ContactService } from '../services/contact.service.js';

export function createContactController(contact: ContactService) {
  /** 202: se acepta siempre (los bots descartados reciben la misma respuesta que las personas). */
  const submit: RequestHandler = async (req, res) => {
    const { body } = getInput<ContactRequest>(res);
    await contact.submit(body, { ip: req.ip, userAgent: req.get('user-agent') });
    const response: MessageResponse = { message: 'Gracias, recibimos tu mensaje.' };
    res.status(202).json(response);
  };

  return { submit };
}
