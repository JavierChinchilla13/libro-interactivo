import { AGE_RESTRICTED_MESSAGE } from '@libro/shared';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt, READER } from '../../test/mockApi';
import { GoogleProfileStep } from './GoogleProfileStep';
import { resolveConsent, birthState, EMPTY_CONSENT } from './ConsentFields';
import { useGoogleAccess } from './useGoogleAccess';

const NOW = new Date('2026-10-28T12:00:00Z');
const NO_SESSION = { session: null };
const GOOD_PASSWORD = 'Nube-Azul-Cuatro-87';

beforeEach(() => {
  // Solo la fecha: los temporizadores siguen reales para que userEvent y las esperas funcionen.
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('resolveConsent y birthState', () => {
  const values = (month: string, year: string, change = {}) => ({
    ...EMPTY_CONSENT,
    month,
    year,
    ageCheck: true,
    acceptTerms: true,
    acceptPrivacy: true,
    ...change,
  });

  it('adulta: casilla «adult»; de 16 a 17: «minor_with_guardian»; menor de 16: no devuelve nada que enviar', () => {
    const adult = resolveConsent(values('6', '1990'), NOW);
    expect(adult).toMatchObject({ ok: true, consent: { ageDeclaration: 'adult' } });
    const teen = resolveConsent(values('3', '2009'), NOW);
    expect(teen).toMatchObject({ ok: true, consent: { ageDeclaration: 'minor_with_guardian' } });
    const child = resolveConsent(values('5', '2012'), NOW);
    expect(child.ok).toBe(false);
    if (!child.ok) expect(child.errors.birth).toBe(AGE_RESTRICTED_MESSAGE);
  });

  it('el límite es el final del mes de nacimiento (10/2010 aún cuenta 15 en octubre de 2026)', () => {
    expect(birthState(values('10', '2010'), NOW).kind).toBe('under');
    expect(birthState(values('9', '2010'), NOW).kind).toBe('minor');
    expect(birthState(values('', '2010'), NOW).kind).toBe('empty');
  });

  it('pide cada casilla que falta y no deja pasar sin los dos consentimientos', () => {
    const result = resolveConsent(
      values('6', '1990', { ageCheck: false, acceptTerms: false, acceptPrivacy: false }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'acceptPrivacy',
        'acceptTerms',
        'ageCheck',
      ]);
    }
  });
});

describe('registro con edad y consentimientos', () => {
  async function start() {
    const api = mockApi({}, NO_SESSION);
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    return api;
  }

  it('sin elegir la fecha no se envía nada y se avisa por campo, junto con los demás avisos', async () => {
    const { called } = mockApi({}, NO_SESSION);
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Elige el mes y el año de tu nacimiento.')).toBeInTheDocument();
    expect(screen.getByText('Acepta los términos de uso para continuar.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un correo válido')).toBeInTheDocument();
    expect(called('POST /api/auth/register')).toHaveLength(0);
  });

  it('adulta: aparece «Tengo 18 años o más», los dos consentimientos van aparte y se envía todo', async () => {
    const api = mockApi(
      { 'POST /api/auth/register': () => json({ user: READER }, 201) },
      NO_SESSION,
    );
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), '6');
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '1990');

    expect(screen.queryByRole('checkbox', { name: /Soy menor de 18/ })).toBeNull();
    // Las casillas de términos y de datos son dos, cada una con su enlace.
    const terms = screen.getByRole('checkbox', { name: /Acepto los términos de uso/ });
    const privacy = screen.getByRole('checkbox', { name: /Autorizo el tratamiento de mis datos/ });
    expect(terms).not.toBe(privacy);
    expect(screen.getByRole('link', { name: /términos de uso/ })).toHaveAttribute(
      'href',
      '/terminos',
    );
    expect(screen.getByRole('link', { name: /política de privacidad/ })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    expect(screen.getByText(/borrador pendiente de revisión legal/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Tengo 18 años o más/ }));
    await userEvent.click(terms);
    await userEvent.click(privacy);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(api.called('POST /api/auth/register')).toHaveLength(1));
    expect(api.called('POST /api/auth/register')[0]?.body).toMatchObject({
      name: 'Lectora Prueba',
      email: 'lectora@ejemplo.com',
      birth: { year: 1990, month: 6 },
      ageDeclaration: 'adult',
      acceptTerms: true,
      acceptPrivacy: true,
    });
  });

  it('de 16 a 17 años cambia la casilla: la autorización de madre, padre o tutor', async () => {
    const api = mockApi(
      { 'POST /api/auth/register': () => json({ user: READER }, 201) },
      NO_SESSION,
    );
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), '3');
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '2009');

    expect(screen.queryByRole('checkbox', { name: /Tengo 18 años o más/ })).toBeNull();
    // Sin marcar la autorización no se envía.
    await userEvent.click(screen.getByRole('checkbox', { name: /Acepto los términos de uso/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Autorizo el tratamiento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(
      await screen.findByText('Marca la autorización de tu madre, padre o tutor para continuar.'),
    ).toBeInTheDocument();
    expect(api.called('POST /api/auth/register')).toHaveLength(0);

    await userEvent.click(
      screen.getByRole('checkbox', { name: /mi madre, padre o tutor autoriza/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(api.called('POST /api/auth/register')).toHaveLength(1));
    expect(api.called('POST /api/auth/register')[0]?.body).toMatchObject({
      birth: { year: 2009, month: 3 },
      ageDeclaration: 'minor_with_guardian',
    });
  });

  it('menor de 16: mensaje amable, ninguna casilla más y no se manda nada al servidor', async () => {
    const api = await start();
    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), '5');
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '2012');
    expect(screen.getByText(AGE_RESTRICTED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(api.called('POST /api/auth/register')).toHaveLength(0);
    // Se avisa una sola vez, no con un mensaje distinto por campo.
    expect(screen.getAllByText(AGE_RESTRICTED_MESSAGE)).toHaveLength(1);
  });

  it('si el servidor rechaza por edad se muestra su mismo mensaje, sin tono de error', async () => {
    mockApi(
      { 'POST /api/auth/register': () => apiError('AGE_RESTRICTED', AGE_RESTRICTED_MESSAGE, 403) },
      NO_SESSION,
    );
    renderAt('/registro');
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Lectora Prueba');
    await userEvent.type(screen.getByLabelText(/Correo/), 'lectora@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), '6');
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '1990');
    await userEvent.click(screen.getByRole('checkbox', { name: /Tengo 18 años o más/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Acepto los términos de uso/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Autorizo el tratamiento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent(AGE_RESTRICTED_MESSAGE);
  });
});

describe('segundo paso de Google (persona nueva)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  it('el primer paso no crea sesión: muestra el segundo con el nombre y el correo verificados', async () => {
    const api = mockApi(
      {
        'POST /api/auth/google': () =>
          json({ status: 'needs_profile', name: 'Lola Pérez', email: 'lola@ejemplo.com' }),
      },
      NO_SESSION,
    );
    const signedIn = vi.fn();
    const { result } = renderHook(() => useGoogleAccess(signedIn), { wrapper });
    result.current.start('credencial-de-google');
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    expect(result.current.pending).toEqual({
      credential: 'credencial-de-google',
      name: 'Lola Pérez',
      email: 'lola@ejemplo.com',
    });
    expect(signedIn).not.toHaveBeenCalled();
    expect(api.called('POST /api/auth/google')[0]?.body).toEqual({
      credential: 'credencial-de-google',
    });
  });

  it('al confirmar reenvía la misma credencial con el perfil y entra', async () => {
    const api = mockApi(
      {
        'POST /api/auth/google': ({ body }) =>
          (body as { profile?: unknown }).profile
            ? json({ status: 'ok', user: READER })
            : json({ status: 'needs_profile', name: 'Lola Pérez', email: 'lola@ejemplo.com' }),
      },
      NO_SESSION,
    );
    const signedIn = vi.fn();
    const { result } = renderHook(() => useGoogleAccess(signedIn), { wrapper });
    result.current.start('credencial-de-google');
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    const profile = {
      birth: { year: 1990, month: 6 },
      ageDeclaration: 'adult' as const,
      acceptTerms: true as const,
      acceptPrivacy: true as const,
    };
    result.current.submitProfile(profile);
    await waitFor(() => expect(signedIn).toHaveBeenCalledWith(READER));
    expect(api.called('POST /api/auth/google')[1]?.body).toEqual({
      credential: 'credencial-de-google',
      profile,
    });
  });

  it('una cuenta que ya existe entra directo, sin segundo paso', async () => {
    mockApi({ 'POST /api/auth/google': () => json({ status: 'ok', user: READER }) }, NO_SESSION);
    const signedIn = vi.fn();
    const { result } = renderHook(() => useGoogleAccess(signedIn), { wrapper });
    result.current.start('credencial-de-google');
    await waitFor(() => expect(signedIn).toHaveBeenCalledWith(READER));
    expect(result.current.pending).toBeNull();
  });

  it('GoogleProfileStep: pide la edad, no envía a una menor y envía el perfil a una adulta', async () => {
    const onSubmit = vi.fn();
    render(
      <MemoryRouter>
        <GoogleProfileStep
          name="Lola Pérez"
          email="lola@ejemplo.com"
          pending={false}
          error={null}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Lola Pérez')).toBeInTheDocument();
    expect(screen.getByText(/lola@ejemplo.com/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), '5');
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '2012');
    expect(screen.getByText(AGE_RESTRICTED_MESSAGE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '1990');
    const form = screen
      .getByRole('button', { name: 'Crear mi cuenta' })
      .closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('checkbox', { name: /Tengo 18 años o más/ }));
    await userEvent.click(
      within(form).getByRole('checkbox', { name: /Acepto los términos de uso/ }),
    );
    await userEvent.click(within(form).getByRole('checkbox', { name: /Autorizo el tratamiento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(onSubmit).toHaveBeenCalledWith({
      birth: { year: 1990, month: 5 },
      ageDeclaration: 'adult',
      acceptTerms: true,
      acceptPrivacy: true,
    });
  });
});

describe('ingreso con contraseña: volver a declarar la edad', () => {
  it('si el servidor pide el perfil no hay sesión: se muestra el paso y el reenvío lleva el perfil', async () => {
    const api = mockApi(
      {
        'POST /api/auth/login': ({ body }) =>
          (body as { profile?: unknown }).profile
            ? json({ status: 'ok', user: READER })
            : json({ status: 'needs_profile', name: 'Lola Pérez', email: 'lola@ejemplo.com' }),
      },
      NO_SESSION,
    );
    renderAt('/ingresar');
    await userEvent.type(await screen.findByLabelText(/Correo/), 'lola@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText(/Antes de entrar necesitamos/)).toBeInTheDocument();
    expect(screen.getByText('Lola Pérez')).toBeInTheDocument();
    expect(api.called('POST /api/auth/login')).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText(/^Mes/), '6');
    await userEvent.selectOptions(screen.getByLabelText(/^Año/), '1990');
    const form = screen.getByRole('button', { name: 'Continuar' }).closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('checkbox', { name: /Tengo 18 años o más/ }));
    await userEvent.click(
      within(form).getByRole('checkbox', { name: /Acepto los términos de uso/ }),
    );
    await userEvent.click(within(form).getByRole('checkbox', { name: /Autorizo el tratamiento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(api.called('POST /api/auth/login')).toHaveLength(2));
    expect(api.called('POST /api/auth/login')[1]?.body).toMatchObject({
      email: 'lola@ejemplo.com',
      password: GOOD_PASSWORD,
      profile: {
        birth: { year: 1990, month: 6 },
        ageDeclaration: 'adult',
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });
  });

  it('un ingreso normal sigue entrando directo, sin ese paso', async () => {
    mockApi({ 'POST /api/auth/login': () => json({ status: 'ok', user: READER }) }, NO_SESSION);
    renderAt('/ingresar');
    await userEvent.type(await screen.findByLabelText(/Correo/), 'lola@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), GOOD_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.queryByText(/Antes de entrar necesitamos/)).toBeNull());
  });
});
