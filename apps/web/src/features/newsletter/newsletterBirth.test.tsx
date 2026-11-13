import { NEWSLETTER_MINOR_MESSAGE } from '@libro/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, json, mockApi, renderAt } from '../../test/mockApi';

/** Cuentas anteriores al paso de edad: sin fecha de nacimiento guardada, se les pide al apuntarse a las novedades. */
const NOW = new Date('2026-11-13T12:00:00Z');
const NO_BIRTH = { status: 'none', eligible: true, needsBirth: true, invitation: true };
const SUBSCRIBED = {
  status: 'subscribed',
  eligible: true,
  needsBirth: false,
  invitation: false,
  subscribedAt: NOW.toISOString(),
};
const label = /Quiero recibir correos con novedades de la autora/;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function pick(month: string, year: string) {
  await userEvent.selectOptions(screen.getByLabelText(/^Mes/), month);
  await userEvent.selectOptions(screen.getByLabelText(/^Año/), year);
}
const save = () => screen.getByRole('button', { name: 'Guardar y apuntarme' });

describe('/panel/cuenta: una cuenta sin fecha de nacimiento', () => {
  const account = (extra: Parameters<typeof mockApi>[0] = {}) =>
    mockApi(
      {
        'GET /api/me/newsletter': () =>
          json({ status: 'none', eligible: true, needsBirth: true, invitation: true }),
        ...extra,
      },
      { session: READER },
    );
  const open = async () => {
    renderAt('/panel/cuenta');
    const box = await screen.findByRole('checkbox', { name: label });
    await userEvent.click(box);
    return box;
  };

  it('ve la casilla (no el aviso de «solo mayores de 18»); al marcarla pide el mes y el año y todavía no manda nada', async () => {
    const api = account();
    const box = await open();
    expect(screen.queryByText(/solo para personas de 18 años o más/)).toBeNull();
    expect(box).toBeChecked();
    expect(screen.getByText(/necesitamos tu mes y año de nacimiento/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mes/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Año/)).toBeInTheDocument();
    expect(screen.getByText('Solo guardamos el mes y el año, no el día.')).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('18 o más: manda la fecha junto con el alta y queda apuntada', async () => {
    const api = account({ 'PUT /api/me/newsletter': () => json(SUBSCRIBED) });
    await open();
    await pick('6', '1990');
    expect(screen.queryByText(NEWSLETTER_MINOR_MESSAGE)).toBeNull();
    await userEvent.click(save());
    expect(await screen.findByText(/Te apuntaste el 13 de noviembre de 2026/)).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter')[0]?.body).toEqual({
      subscribed: true,
      birth: { year: 1990, month: 6 },
    });
    expect(screen.queryByLabelText(/^Mes/)).toBeNull();
  });

  it.each([
    ['de 16 a 17 años', '1', '2009'],
    ['menor de 16', '1', '2015'],
  ])(
    '%s: mensaje claro de mayores de 18 y no se manda nada al servidor',
    async (_n, month, year) => {
      const api = account();
      await open();
      await pick(month, year);
      expect(screen.getByText(NEWSLETTER_MINOR_MESSAGE)).toBeInTheDocument();
      await userEvent.click(save());
      expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
    },
  );

  it('sin elegir mes y año, lo pide y no manda nada', async () => {
    const api = account();
    await open();
    await userEvent.click(save());
    expect(await screen.findByText('Elige el mes y el año de tu nacimiento.')).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('cancelar vuelve a la casilla desmarcada, sin mandar nada (ni una baja)', async () => {
    const api = account();
    const box = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText(/^Mes/)).toBeNull();
    expect(box).not.toBeChecked();
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('desmarcar la casilla antes de dar la fecha cierra el paso sin mandar nada', async () => {
    const api = account();
    const box = await open();
    await userEvent.click(box);
    expect(screen.queryByLabelText(/^Mes/)).toBeNull();
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('si el servidor rechaza la fecha, lo muestra en el mismo paso y deja corregirla', async () => {
    account({
      'PUT /api/me/newsletter': () => apiError('VALIDATION', 'Revisa tu fecha de nacimiento.', 400),
    });
    await open();
    await pick('6', '1990');
    await userEvent.click(save());
    const group = await screen.findByRole('group', { name: /necesitamos tu mes y año/ });
    expect(await within(group).findByText('Revisa tu fecha de nacimiento.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mes/)).toBeInTheDocument();
  });

  it('el paso de fecha recibe el foco al abrirse (el teclado no se pierde)', async () => {
    account();
    await open();
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /necesitamos tu mes y año/ })).toHaveFocus(),
    );
  });
});

describe('/panel: la invitación única a una cuenta sin fecha de nacimiento', () => {
  const panel = (extra: Parameters<typeof mockApi>[0] = {}) =>
    mockApi(
      {
        'GET /api/me/library': () => json({ books: [] }),
        'GET /api/me/newsletter': () => json(NO_BIRTH),
        ...extra,
      },
      { session: READER },
    );

  it('se muestra; «Sí» abre el paso de la fecha en la misma tarjeta, sin mandar nada todavía', async () => {
    const api = panel();
    renderAt('/panel');
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, apuntarme' }));
    expect(await screen.findByLabelText(/^Mes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'No, gracias' })).toBeNull();
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('con una fecha de 18 o más manda el alta con la fecha y la tarjeta confirma', async () => {
    const api = panel({ 'PUT /api/me/newsletter': () => json(SUBSCRIBED) });
    renderAt('/panel');
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, apuntarme' }));
    await pick('3', '1985');
    await userEvent.click(save());
    expect(await screen.findByText(/Te apuntaste a los correos de novedades/)).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter')[0]?.body).toEqual({
      subscribed: true,
      birth: { year: 1985, month: 3 },
    });
  });

  it('con una fecha de menor: el mensaje claro y nada se manda; cancelar devuelve las dos opciones', async () => {
    const api = panel();
    renderAt('/panel');
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, apuntarme' }));
    await pick('1', '2009');
    expect(screen.getByText(NEWSLETTER_MINOR_MESSAGE)).toBeInTheDocument();
    await userEvent.click(save());
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Sí, apuntarme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, gracias' })).toBeInTheDocument();
  });

  it('«No, gracias» la da por respondida sin pedir ninguna fecha', async () => {
    const api = panel({
      'PUT /api/me/newsletter/invitation': () =>
        json({ status: 'none', eligible: true, needsBirth: true, invitation: false }),
    });
    renderAt('/panel');
    await userEvent.click(await screen.findByRole('button', { name: 'No, gracias' }));
    expect(await screen.findByRole('heading', { name: 'Entendido' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Mes/)).toBeNull();
    expect(api.called('PUT /api/me/newsletter/invitation')[0]?.body).toEqual({
      answer: 'declined',
    });
    expect(api.called('PUT /api/me/newsletter')).toHaveLength(0);
  });

  it('una cuenta que ya tiene fecha sigue con «Sí» directo, sin pedir nada', async () => {
    const api = panel({
      'GET /api/me/newsletter': () =>
        json({ status: 'none', eligible: true, needsBirth: false, invitation: true }),
      'PUT /api/me/newsletter': () => json(SUBSCRIBED),
    });
    renderAt('/panel');
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, apuntarme' }));
    expect(await screen.findByText(/Te apuntaste a los correos de novedades/)).toBeInTheDocument();
    expect(api.called('PUT /api/me/newsletter')[0]?.body).toEqual({ subscribed: true });
  });
});
