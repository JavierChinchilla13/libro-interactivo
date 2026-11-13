import { messageResponseSchema, newsletterStateSchema, type NewsletterState } from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Correos de novedades: la casilla de la cuenta, la confirmación y la baja (estas dos sin sesión). */
export const newsletterApi = {
  state: () => apiRequest('/me/newsletter', newsletterStateSchema),
  update: (subscribed: boolean) =>
    apiRequest('/me/newsletter', newsletterStateSchema, {
      method: 'PUT',
      body: { subscribed },
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
