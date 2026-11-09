import { NEWSLETTER_LABEL } from '@libro/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, json, mockApi, renderAt } from '../../test/mockApi';

const NOW = new Date('2026-11-09T12:00:00Z');
const NO_SESSION = { session: null };
const GOOD_PASSWORD = 'Nube-Azul-Cuatro-87';
const label = new RegExp(NEWSLETTER_LABEL);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('la casilla en el registro', () => {
  async function fill(month: string, year: string) {
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), month);
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), year);
  }
  async function acceptAll(ageCheck: RegExp) {
    await userEvent.click(screen.getByRole('checkbox', { name: ageCheck }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Acepto los términos de uso/ }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Autorizo el tratamiento de mis datos/ }),
    );
  }

  it('adulta: aparece desmarcada y, si no la marca, no se envía', async () => {
    const api = mockApi(
      { 'POST /api/auth/register': () => json({ user: READER }, 201) },
      NO_SESSION,
    );
    renderAt('/registro');
    await fill('6', '1990');
    expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked();
    await acceptAll(/Tengo 18 años o más/);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(api.called('POST /api/auth/register')).toHaveLength(1));
    expect(api.called('POST /api/auth/register')[0]?.body).not.toHaveProperty('newsletter');
  });

  it('adulta que la marca: se envía newsletter: true', async () => {
    const api = mockApi(
      { 'POST /api/auth/register': () => json({ user: READER }, 201) },
      NO_SESSION,
    );
    renderAt('/registro');
    await fill('6', '1990');
    await acceptAll(/Tengo 18 años o más/);
    await userEvent.click(screen.getByRole('checkbox', { name: label }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(api.called('POST /api/auth/register')).toHaveLength(1));
    expect(api.called('POST /api/auth/register')[0]?.body).toMatchObject({ newsletter: true });
  });

  it('de 16 a 17 años no se muestra; y si cambia la fecha a menor, se desmarca', async () => {
    const api = mockApi(
      { 'POST /api/auth/register': () => json({ user: READER }, 201) },
      NO_SESSION,
    );
    renderAt('/registro');
    await fill('6', '1990');
    await userEvent.click(screen.getByRole('checkbox', { name: label }));
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '2009');
    expect(screen.queryByRole('checkbox', { name: label })).toBeNull();
    await acceptAll(/Soy menor de 18/);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(api.called('POST /api/auth/register')).toHaveLength(1));
    expect(api.called('POST /api/auth/register')[0]?.body).not.toHaveProperty('newsletter');
  });
});

describe('«Correos de novedades» en la cuenta', () => {
  const section = async () => {
    const heading = await screen.findByRole('heading', { name: 'Correos de novedades' });
    return heading.closest('section') as HTMLElement;
  };

  it('no apuntada: la casilla desmarcada; al marcarla con el correo sin comprobar queda pendiente', async () => {
    const api = mockApi(
      {
        'GET /api/me/newsletter': () => json({ status: 'none', eligible: true }),
        'PUT /api/me/newsletter': () =>
          json({ status: 'pending', eligible: true, pendingSince: NOW.toISOString() }),
      },
      { session: READER },
    );
    renderAt('/panel/cuenta');
    const box = await within(await section()).findByRole('checkbox', { name: label });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(await screen.findByText('Falta confirmar tu correo')).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter')[0]?.body).toEqual({ subscribed: true });
  });

  it('apuntada: dice desde cuándo y al desmarcar se da de baja', async () => {
    const api = mockApi(
      {
        'GET /api/me/newsletter': () =>
          json({ status: 'subscribed', eligible: true, subscribedAt: '2026-11-01T10:00:00.000Z' }),
        'PUT /api/me/newsletter': () => json({ status: 'none', eligible: true }),
      },
      { session: READER },
    );
    renderAt('/panel/cuenta');
    const box = await within(await section()).findByRole('checkbox', { name: label });
    expect(box).toBeChecked();
    expect(screen.getByText(/Te apuntaste el 1 de noviembre de 2026/)).toBeInTheDocument();
    await userEvent.click(box);
    await waitFor(() => expect(box).not.toBeChecked());
    expect(api.called('PUT /api/me/newsletter')[0]?.body).toEqual({ subscribed: false });
  });

  it('quien no puede apuntarse (menor de 18 o sin fecha) no ve la casilla', async () => {
    mockApi(
      { 'GET /api/me/newsletter': () => json({ status: 'none', eligible: false }) },
      { session: READER },
    );
    renderAt('/panel/cuenta');
    const box = await section();
    expect(await within(box).findByText(/solo para personas de 18 años o más/)).toBeInTheDocument();
    expect(within(box).queryByRole('checkbox')).toBeNull();
  });

  it('un error del servidor al guardar se muestra', async () => {
    mockApi(
      {
        'GET /api/me/newsletter': () => json({ status: 'none', eligible: true }),
        'PUT /api/me/newsletter': () =>
          apiError('VALIDATION', 'Solo las personas mayores de 18 años pueden apuntarse.', 400),
      },
      { session: READER },
    );
    renderAt('/panel/cuenta');
    await userEvent.click(await within(await section()).findByRole('checkbox', { name: label }));
    expect(
      await screen.findByText('Solo las personas mayores de 18 años pueden apuntarse.'),
    ).toBeInTheDocument();
  });
});

describe('/baja (enlace visible del correo, sin sesión)', () => {
  it('da de baja sola al abrirse, una sola vez, y ofrece volver a apuntarse desde la cuenta', async () => {
    const api = mockApi(
      {
        'POST /api/newsletter/unsubscribe?t=abc.def&origen=enlace': () =>
          json({ message: 'Listo' }),
      },
      NO_SESSION,
    );
    renderAt('/baja?t=abc.def');
    expect(await screen.findByRole('heading', { name: 'Te diste de baja' })).toBeInTheDocument();
    expect(screen.getByText(/¿Fue un error\? Vuelve a apuntarte desde/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tu cuenta' })).toHaveAttribute(
      'href',
      '/panel/cuenta',
    );
    expect(api.called('POST /api/newsletter/unsubscribe?t=abc.def&origen=enlace')).toHaveLength(1);
  });

  it('sin token no llama al servidor y explica qué hacer', async () => {
    const api = mockApi({}, NO_SESSION);
    renderAt('/baja');
    expect(await screen.findByRole('heading', { name: 'Enlace incompleto' })).toBeInTheDocument();
    expect(api.calls.filter((call) => call.url.includes('unsubscribe'))).toHaveLength(0);
  });

  it('si el servidor no responde, lo dice y ofrece la cuenta', async () => {
    mockApi(
      {
        'POST /api/newsletter/unsubscribe?t=abc.def&origen=enlace': () =>
          apiError('INTERNAL', 'x', 500),
      },
      NO_SESSION,
    );
    renderAt('/baja?t=abc.def');
    expect(
      await screen.findByRole('heading', { name: 'No pudimos darte de baja' }),
    ).toBeInTheDocument();
  });
});

describe('/confirmar-novedades (doble confirmación, sin sesión)', () => {
  const TOKEN = 'a'.repeat(43);

  it('confirma sola al abrirse', async () => {
    const api = mockApi(
      {
        'POST /api/newsletter/confirm': () =>
          json({ status: 'subscribed', eligible: true, subscribedAt: NOW.toISOString() }),
      },
      NO_SESSION,
    );
    renderAt(`/confirmar-novedades?t=${TOKEN}`);
    expect(
      await screen.findByRole('heading', { name: '¡Listo! Ya te apuntaste' }),
    ).toBeInTheDocument();
    expect(api.called('POST /api/newsletter/confirm')[0]?.body).toEqual({ token: TOKEN });
  });

  it('un enlace caducado o usado: «Enlace no válido» con la salida a la cuenta', async () => {
    mockApi(
      {
        'POST /api/newsletter/confirm': () =>
          apiError('TOKEN_INVALID', 'El enlace no es válido o ya caducó.', 400),
      },
      NO_SESSION,
    );
    renderAt(`/confirmar-novedades?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tu cuenta' })).toHaveAttribute(
      'href',
      '/panel/cuenta',
    );
  });
});
