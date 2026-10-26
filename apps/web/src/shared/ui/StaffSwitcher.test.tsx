import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { READER, json, mockApi, renderAt } from '../../test/mockApi';
import { zoneOf } from './StaffSwitcher';

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Admin', role: 'ADMIN' };
const EDITOR = { ...READER, id: '670000000000000000000003', name: 'Editora', role: 'EDITOR' };
const site = { universe: { introHtml: '' }, author: { bioHtml: '' }, social: [], lockMessage: 'x' };
const handlers = {
  'GET /api/site': () => json(site),
  'GET /api/books': () => json({ books: [] }),
};
const switcher = () => screen.queryByRole('navigation', { name: 'Cambiar de zona' });

describe('zoneOf', () => {
  it('reconoce la zona por la ruta', () => {
    expect(zoneOf('/')).toBe('site');
    expect(zoneOf('/wiki')).toBe('site');
    expect(zoneOf('/panel')).toBe('panel');
    expect(zoneOf('/panel/quiz/1')).toBe('panel');
    expect(zoneOf('/admin')).toBe('admin');
    expect(zoneOf('/admin/libros')).toBe('admin');
    expect(zoneOf('/administrador')).toBe('site');
  });
});

describe('StaffSwitcher', { timeout: 30_000 }, () => {
  it.each([
    ['ADMIN', ADMIN],
    ['EDITOR', EDITOR],
  ])(
    'una cuenta %s lo ve suelto en el panel y la administración con la zona marcada',
    async (_role, user) => {
      for (const [path, active] of [
        ['/panel', 'Mi panel'],
        ['/admin', 'Admin'],
      ] as const) {
        mockApi(handlers, { session: user });
        const view = renderAt(path);
        // En el panel hay dos (una en la cabecera y otra bajo ella para el celular; el CSS muestra una según el ancho).
        const [nav] = await screen.findAllByRole('navigation', { name: 'Cambiar de zona' });
        if (!nav) throw new Error('Falta el selector');
        const links = within(nav).getAllByRole('link');
        expect(links.map((link) => link.textContent)).toEqual(['Ver sitio', 'Mi panel', 'Admin']);
        expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/panel', '/admin']);
        expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent(active);
        view.unmount();
      }
    },
  );

  it('en el sitio no hay selector suelto: las zonas van dentro del menú de usuario, con la actual marcada en el panel', async () => {
    mockApi(handlers, { session: ADMIN });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Menú' }));
    expect(switcher()).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Admin' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Ver sitio',
      'Mi panel',
      'Admin',
      'Ajustes',
      'Salir',
    ]);
    expect(items.slice(0, 3).map((item) => item.getAttribute('href'))).toEqual([
      '/',
      '/panel',
      '/admin',
    ]);
  });

  it('una lectora normal no lo ve en ninguna zona', async () => {
    for (const path of ['/', '/panel']) {
      mockApi(handlers, { session: READER });
      const view = renderAt(path);
      await screen.findByRole('banner');
      expect(switcher()).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('sin sesión no se ve', async () => {
    mockApi(handlers, { session: null });
    renderAt('/');
    await screen.findByRole('banner');
    expect(switcher()).not.toBeInTheDocument();
  });

  it('no aparece dentro de un quiz en curso', async () => {
    mockApi(
      { ...handlers, 'GET /api/quizzes/670000000000000000000099': () => json({}, 404) },
      { session: ADMIN },
    );
    renderAt('/panel/quiz/670000000000000000000099');
    await screen.findByRole('banner');
    expect(switcher()).not.toBeInTheDocument();
  });
});
