import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '../../app/providers';
import { READER, apiError, empty, json, mockApi, renderAt } from '../../test/mockApi';
import { UserMenu, firstNameOf, initialsOf, type UserMenuItem } from './UserMenu';

afterEach(() => vi.unstubAllGlobals());

const LONG =
  'Alejandra Montserrat-Wiśniewska de la Vega y Fernández-Kowalczyk de los Ángeles Borbón Pérez';
const withName = (name: string, role = 'USER') => ({ ...READER, name, role });
const trigger = (name: string) => screen.findByRole('button', { name });

describe('initialsOf', () => {
  it('toma la primera y la última palabra, también con tildes y emojis', () => {
    expect(initialsOf('María José de la Vega')).toBe('MV');
    expect(initialsOf('Ana')).toBe('A');
    expect(initialsOf('  álvaro   ñandú ')).toBe('ÁÑ');
    expect(initialsOf('👩‍🎤 Ana')).toBe('A');
    expect(initialsOf('Ana 🌙')).toBe('A');
    expect(initialsOf('🌙')).toBe('🌙');
  });

  it('sin nombre queda un signo de interrogación', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf(undefined)).toBe('?');
  });
});

describe('firstNameOf', () => {
  it('es la primera palabra con letra y vacío sin nombre', () => {
    expect(firstNameOf('María José de la Vega')).toBe('María');
    expect(firstNameOf('🌙 Luna Nueva')).toBe('Luna');
    expect(firstNameOf('🌙✨')).toBe('🌙✨');
    expect(firstNameOf('  ')).toBe('');
    expect(firstNameOf(undefined)).toBe('');
  });
});

describe('UserMenu en el panel', { timeout: 30_000 }, () => {
  it('muestra el nombre de la sesión (no un texto fijo) y reemplaza a «Cuenta» y al botón «Salir»', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const button = await trigger('Lectora Prueba');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Cuenta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salir' })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('abre con clic, pone el foco en la primera opción y se cierra con Escape devolviendo el foco', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const user = userEvent.setup();
    const button = await trigger('Lectora Prueba');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Menú de usuario' })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('menuitem');
    expect(first).toHaveTextContent('Ajustes');
    expect(second).toHaveTextContent('Salir');
    expect(first).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('se maneja con el teclado: ↓ abre, ↑ ↓ Inicio y Fin se mueven en círculo y Tab cierra', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const user = userEvent.setup();
    const button = await trigger('Lectora Prueba');
    button.focus();
    await user.keyboard('{ArrowDown}');
    const [ajustes, salir] = screen.getAllByRole('menuitem');
    expect(ajustes).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(salir).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(ajustes).toHaveFocus();
    await user.keyboard('{End}');
    expect(salir).toHaveFocus();
    await user.keyboard('{Home}');
    expect(ajustes).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(salir).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Tab cierra el menú y deja el foco en el botón (no en el documento), para seguir desde ahí', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const user = userEvent.setup();
    const button = await trigger('Lectora Prueba');
    await user.click(button);
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.body).not.toHaveFocus();
  });

  it('↑ sobre el botón abre con el foco en la última opción', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const user = userEvent.setup();
    (await trigger('Lectora Prueba')).focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('menuitem')[1]).toHaveFocus();
  });

  it('un clic fuera lo cierra', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const user = userEvent.setup();
    await user.click(await trigger('Lectora Prueba'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('«Ajustes» lleva a la cuenta y cierra el menú', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    renderAt('/panel');
    const user = userEvent.setup();
    await user.click(await trigger('Lectora Prueba'));
    await user.click(screen.getByRole('menuitem', { name: 'Ajustes' }));
    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('«Salir» cierra la sesión con el cierre actual y lleva a ingresar', async () => {
    const { called } = mockApi(
      { 'POST /api/auth/logout': () => empty() },
      { session: withName('Lectora Prueba') },
    );
    renderAt('/panel');
    const user = userEvent.setup();
    await user.click(await trigger('Lectora Prueba'));
    await user.click(screen.getByRole('menuitem', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(called('POST /api/auth/logout')).toHaveLength(1);
  });

  it('con un nombre larguísimo y con emojis: el botón lleva el nombre completo para lectores de pantalla y las iniciales cortas; el menú lo envuelve', async () => {
    const name = `${LONG} 🌙✨`;
    mockApi({}, { session: withName(name) });
    renderAt('/panel');
    const user = userEvent.setup();
    const button = await trigger(name);
    expect(button.querySelector('.user-menu-name')).toHaveTextContent(name);
    expect(button.querySelector('.user-menu-avatar')).toHaveTextContent('AP');
    await user.click(button);
    expect(document.querySelector('.user-menu-who-name')).toHaveTextContent(name);
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('en celular lleva el primer nombre (decorativo) y el nombre accesible sigue siendo el completo', async () => {
    mockApi({}, { session: withName('María José de la Vega') });
    renderAt('/panel');
    const button = await trigger('María José de la Vega');
    const first = button.querySelector('.user-menu-first');
    expect(first).toHaveTextContent('María');
    expect(first).toHaveAttribute('aria-hidden', 'true');
  });

  it('un nombre que empieza con emoji da iniciales con emoji', async () => {
    mockApi({}, { session: withName('🌙 Luna Nueva') });
    renderAt('/panel');
    const button = await trigger('🌙 Luna Nueva');
    expect(button.querySelector('.user-menu-avatar')).toHaveTextContent('LN');
  });

  it('sin nombre queda «Mi cuenta» con «?» y sigue funcionando', async () => {
    mockApi({}, { session: withName('') });
    renderAt('/panel');
    const user = userEvent.setup();
    const button = await trigger('Mi cuenta');
    expect(button.querySelector('.user-menu-avatar')).toHaveTextContent('?');
    await user.click(button);
    expect(screen.getByRole('menuitem', { name: 'Salir' })).toBeInTheDocument();
  });

  it('muestra el rol de editoras y administradoras dentro del menú, con las tres zonas y sin selector suelto', async () => {
    mockApi({}, { session: withName('Admin Prueba', 'ADMIN') });
    renderAt('/admin');
    const user = userEvent.setup();
    await user.click(await trigger('Admin Prueba'));
    expect(screen.getByText('Administradora')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Cambiar de zona' })).toBeNull();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Ver sitio',
      'Mi panel',
      'Admin',
      'Ajustes',
      'Salir',
    ]);
  });
});

describe('UserMenu en el sitio público', { timeout: 30_000 }, () => {
  it('con sesión de lectora muestra «Mi panel» y el menú; sin sesión no hay menú', async () => {
    const view = (() => {
      mockApi({ 'GET /api/site': () => json({}) }, { session: withName('Lectora Prueba') });
      return renderAt('/');
    })();
    expect(await trigger('Lectora Prueba')).toBeInTheDocument();
    view.unmount();
    mockApi(
      {
        'GET /api/site': () => json({}),
        'GET /api/me': () => apiError('UNAUTHENTICATED', 'x', 401),
      },
      { session: null },
    );
    renderAt('/');
    await screen.findByRole('link', { name: 'Ingresar' });
    expect(screen.queryByRole('button', { name: /menú de usuario|Lectora/i })).toBeNull();
  });
});

describe('UserMenu: lista de opciones', { timeout: 30_000 }, () => {
  const ITEMS: UserMenuItem[] = [
    { id: 'a', label: 'Para todas', to: '/panel/cuenta' },
    { id: 'b', label: 'Solo administradoras', to: '/admin', roles: ['ADMIN'] },
  ];
  const harness = () =>
    render(
      <AppProviders client={createQueryClient()}>
        <RouterProvider
          router={createMemoryRouter([{ path: '*', element: <UserMenu items={ITEMS} /> }])}
        />
      </AppProviders>,
    );

  it('cada opción respeta sus roles', async () => {
    mockApi({}, { session: withName('Lectora Prueba') });
    harness();
    const user = userEvent.setup();
    await user.click(await trigger('Lectora Prueba'));
    expect(screen.getByRole('menuitem', { name: 'Para todas' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Solo administradoras' })).toBeNull();
  });

  it('una administradora ve todas', async () => {
    mockApi({}, { session: withName('Admin Prueba', 'ADMIN') });
    harness();
    const user = userEvent.setup();
    await user.click(await trigger('Admin Prueba'));
    await waitFor(() => expect(screen.getAllByRole('menuitem')).toHaveLength(2));
  });
});
