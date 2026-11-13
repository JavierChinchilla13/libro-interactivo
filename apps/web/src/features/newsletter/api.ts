import { messageResponseSchema, newsletterStateSchema, type NewsletterState } from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Correos de novedades: la casilla de la cuenta, la confirmación y la baja (estas dos sin sesión). */
export const newsletterApi = {
  state: () => apiRequest('/me/newsletter', newsletterStateSchema),
  /** `birth`: solo para apuntarse una cuenta sin fecha de nacimiento (el servidor la valida y decide). */
  update: (subscribed: boolean, birth?: { year: number; month: number }) =>
    apiRequest('/me/newsletter', newsletterStateSchema, {
      method: 'PUT',
      body: { subscribed, ...(birth ? { birth } : {}) },
    }),
  /** «No, gracias» a la invitación única del panel («Sí» es `update(true)`). */
  declineInvitation: () =>
    apiRequest('/me/newsletter/invitation', newsletterStateSchema, {
      method: 'PUT',
      body: { answer: 'declined' },
    }),
  confirm: (token: string): Promise<NewsletterState> =>
    apiRequest('/newsletter/confirm', newsletterStateSchema, {
      method: 'POST',
      body: { token },
    }),
  unsubscribe: (token: string) =>
    apiRequest(
      `/newsletter/unsubscribe?t=${encodeURIComponent(token)}&origen=enlace`,
      messageResponseSchema,
      { method: 'POST' },
    ),
};

export const NEWSLETTER_KEY = ['me', 'newsletter'] as const;
