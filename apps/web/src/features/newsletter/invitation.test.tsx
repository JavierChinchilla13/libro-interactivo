import { NEWSLETTER_INVITATION_QUESTION } from '@libro/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const NOW = '2026-11-12T12:00:00.000Z';
const OFFER = { status: 'none', eligible: true, invitation: true };
const withOffer = (extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi(
    {
      'GET /api/me/library': () => json({ books: [] }),
      'GET /api/me/newsletter': () => json(OFFER),
      ...extra,
    },
    { session: READER },
  );

const question = () => screen.findByRole('heading', { name: NEWSLETTER_INVITATION_QUESTION });

describe('invitación única a los correos de novedades en /panel', { timeout: 30_000 }, () => {
  it('se muestra con la pregunta y dos botones del mismo peso, sin casilla marcada de antemano', async () => {
    withOffer();
    renderAt('/panel');
    await question();
    const yes = screen.getByRole('button', { name: 'Sí, apuntarme' });
    const no = screen.getByRole('button', { name: 'No, gracias' });
    // Mismo estilo (los dos secundarios, ninguno es el primario) y el mismo tamaño de botón.
    expect(yes.className).toBe(no.className);
    expect(yes).toHaveClass('btn-secondary');
    expect(yes).not.toHaveClass('btn-primary');
    expect(screen.queryByRole('checkbox')).toBeNull();
    // La sección está nombrada por la pregunta (para lectores de pantalla) y lleva la salida a la cuenta.
    expect(
      screen.getByRole('region', { name: NEWSLETTER_INVITATION_QUESTION }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Panel › Cuenta' })).toHaveAttribute(
      'href',
      '/panel/cuenta',
    );
  });

  it('«Sí»: usa el mismo alta de la cuenta, avisa del enlace de confirmación y mueve el foco al mensaje', async () => {
    const api = withOffer({
      'PUT /api/me/newsletter': () =>
        json({ status: 'pending', eligible: true, invitation: false, pendingSince: NOW }),
    });
    renderAt('/panel');
    await question();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, apuntarme' }));
    const message = await screen.findByText(/Te enviamos un enlace a tu correo/);
    const status = message.closest('[role="status"]') as HTMLElement;
    await waitFor(() => expect(status).toHaveFocus());
    expect(api.called('PUT /api/me/newsletter')[0]?.body).toEqual({ subscribed: true });
    expect(api.called('PUT /api/me/newsletter/invitation')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'No, gracias' })).toBeNull();
  });

  it('«Sí» con el correo comprobado: queda apuntada al instante', async () => {
    withOffer({
      'PUT /api/me/newsletter': () =>
        json({ status: 'subscribed', eligible: true, invitation: false, subscribedAt: NOW }),
    });
    renderAt('/panel');
    await question();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, apuntarme' }));
    expect(await screen.findByText(/Te apuntaste a los correos de novedades/)).toBeInTheDocument();
  });

  it('«No, gracias»: guarda la respuesta sin apuntarla, lo confirma y deja dónde cambiar de idea', async () => {
    const api = withOffer({
      'PUT /api/me/newsletter/invitation': () =>
        json({ status: 'none', eligible: true, invitation: false }),
    });
    renderAt('/panel');
    await question();
    await userEvent.click(screen.getByRole('button', { name: 'No, gracias' }));
    expect(await screen.findByRole('heading', { name: 'Entendido' })).toBeInTheDocument();
    expect(screen.getByText(/No te escribiremos/)).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter/invitation')[0]?.body).toEqual({
      answer: 'declined',
    });
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('se contesta con el teclado (Tab hasta el botón y Enter)', async () => {
    const api = withOffer({
      'PUT /api/me/newsletter/invitation': () =>
        json({ status: 'none', eligible: true, invitation: false }),
    });
    renderAt('/panel');
    await question();
    screen.getByRole('button', { name: 'No, gracias' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Entendido' })).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter/invitation')).toHaveLength(1);
  });

  it('un doble clic no manda la respuesta dos veces', async () => {
    const api = withOffer({
      'PUT /api/me/newsletter/invitation': async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return json({ status: 'none', eligible: true, invitation: false });
      },
    });
    renderAt('/panel');
    await question();
    const no = screen.getByRole('button', { name: 'No, gracias' });
    await userEvent.dblClick(no);
    await screen.findByRole('heading', { name: 'Entendido' });
    expect(api.called('PUT /api/me/newsletter/invitation')).toHaveLength(1);
  });

  it('si el servidor falla, lo dice y deja volver a intentarlo', async () => {
    withOffer({
      'PUT /api/me/newsletter': () => apiError('INTERNAL', 'x', 500),
    });
    renderAt('/panel');
    await question();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, apuntarme' }));
    expect(
      await screen.findByText('Algo salió mal en el servidor. Inténtalo de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, apuntarme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, gracias' })).toBeInTheDocument();
  });

  it.each([
    ['menor de 18 o sin fecha', { status: 'none', eligible: false, invitation: false }],
    ['ya apuntada', { status: 'subscribed', eligible: true, invitation: false, subscribedAt: NOW }],
    ['alta pendiente', { status: 'pending', eligible: true, invitation: false, pendingSince: NOW }],
    ['ya respondió o se dio de baja', { status: 'none', eligible: true, invitation: false }],
  ])('no se muestra: %s', async (_name, state) => {
    const api = withOffer({ 'GET /api/me/newsletter': () => json(state) });
    renderAt('/panel');
    await screen.findByRole('heading', { name: 'Tus libros' });
    await waitFor(() => expect(api.called('GET /api/me/newsletter')).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: NEWSLETTER_INVITATION_QUESTION })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sí, apuntarme' })).toBeNull();
  });

  it('si no se puede consultar el estado, no se muestra nada ni estorba al panel', async () => {
    withOffer({ 'GET /api/me/newsletter': () => apiError('INTERNAL', 'x', 500) });
    renderAt('/panel');
    await screen.findByRole('heading', { name: 'Tus libros' });
    expect(screen.queryByRole('button', { name: 'No, gracias' })).toBeNull();
  });

  it('no aparece en el panel de administración', async () => {
    const api = mockApi(
      { 'GET /api/me/newsletter': () => json(OFFER) },
      { session: { ...READER, role: 'ADMIN' } },
    );
    renderAt('/admin');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { name: NEWSLETTER_INVITATION_QUESTION })).toBeNull();
    expect(api.called('GET /api/me/newsletter')).toHaveLength(0);
  });
});
