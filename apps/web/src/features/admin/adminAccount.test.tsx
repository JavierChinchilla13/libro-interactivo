import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { READER, json, mockApi, renderAt } from '../../test/mockApi';
import { crumbsFor, documentTitle, locate } from './adminNav';

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Admin', role: 'ADMIN' };
const EDITOR = { ...READER, id: '670000000000000000000003', name: 'Editora', role: 'EDITOR' };
const site = { universe: { introHtml: '' }, author: { bioHtml: '' }, social: [], lockMessage: 'x' };
const handlers = {
  'GET /api/site': () => json(site),
  'GET /api/books': () => json({ books: [] }),
  'GET /api/me/library': () => json({ books: [] }),
  'GET /api/admin/overview': () => json({}),
};

describe('migas y título de /admin/cuenta', () => {
  it('no es un elemento del menú: lleva la miga «Mi cuenta» y su propio título', () => {
    expect(locate('/admin/cuenta')).toBeNull();
    expect(crumbsFor('/admin/cuenta')).toEqual([{ label: 'Mi cuenta' }]);
    expect(crumbsFor('/admin/cuenta/')).toEqual([{ label: 'Mi cuenta' }]);
    expect(documentTitle('/admin/cuenta')).toBe('Mi cuenta · Administración · Universo Memorias');
    // Lo demás no cambia.
    expect(documentTitle('/admin/quizzes')).toBe('Quizzes · Administración · Universo Memorias');
  });
});

describe('/admin/cuenta (la cuenta propia del equipo, sin salir de administración)', () => {
  it.each([
    ['ADMIN', ADMIN],
    ['EDITOR', EDITOR],
  ])(
    'una cuenta %s la abre dentro de administración, con migas y sin botón de eliminar',
    async (_r, user) => {
      mockApi(handlers, { session: user });
      renderAt('/admin/cuenta');
      expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument();
      // Sigue en la estructura de administración (menú lateral y migas).
      expect(screen.getByRole('navigation', { name: 'Dónde estás' })).toHaveTextContent(
        'Mi cuenta',
      );
      expect(screen.getByRole('link', { name: /Libros/ })).toBeInTheDocument();
      expect(document.title).toBe('Mi cuenta · Administración · Universo Memorias');
      // Cambiar el nombre y la contraseña siguen disponibles…
      expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
      // …pero eliminar la cuenta no se ofrece (el servidor lo rechaza para el equipo): se explica.
      expect(screen.queryByRole('button', { name: /Eliminar mi cuenta/ })).toBeNull();
      expect(screen.getByText('Tu cuenta es de administración')).toBeInTheDocument();
    },
  );

  it('una lectora recibe «sin permiso» y sin sesión se pide ingresar', async () => {
    mockApi(handlers, { session: READER });
    const view = renderAt('/admin/cuenta');
    expect(await screen.findByText('No tienes permiso para ver esta página')).toBeInTheDocument();
    view.unmount();

    mockApi(handlers, { session: null });
    renderAt('/admin/cuenta');
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('a las lectoras en /panel/cuenta se les sigue ofreciendo eliminar su cuenta', async () => {
    mockApi(handlers, { session: READER });
    renderAt('/panel/cuenta');
    expect(await screen.findByRole('button', { name: 'Eliminar mi cuenta…' })).toBeInTheDocument();
    expect(screen.queryByText('Tu cuenta es de administración')).toBeNull();
  });
});

describe('«Ajustes» del menú de usuario se queda en la zona', () => {
  it.each([
    ['/admin', '/admin/cuenta'],
    ['/admin/libros', '/admin/cuenta'],
    ['/panel', '/panel/cuenta'],
    ['/', '/panel/cuenta'],
  ])('desde %s lleva a %s', async (from, expected) => {
    mockApi({ ...handlers, 'GET /api/admin/books': () => json({ books: [] }) }, { session: ADMIN });
    renderAt(from);
    await userEvent.click(await screen.findByRole('button', { name: ADMIN.name }));
    const item = await screen.findByRole('menuitem', { name: 'Ajustes' });
    expect(item).toHaveAttribute('href', expected);
  });

  it('una lectora (que no ve administración) siempre va a /panel/cuenta', async () => {
    mockApi(handlers, { session: READER });
    renderAt('/panel');
    await userEvent.click(await screen.findByRole('button', { name: READER.name }));
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Ajustes' })).toHaveAttribute(
        'href',
        '/panel/cuenta',
      ),
    );
  });
});
