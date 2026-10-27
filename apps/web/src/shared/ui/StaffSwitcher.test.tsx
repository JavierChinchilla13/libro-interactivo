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

describe('zonas dentro del menú de usuario', { timeout: 30_000 }, () => {
  const ZONES = ['Ver sitio', 'Mi panel', 'Admin', 'Ajustes', 'Salir'];

  it.each([
    ['ADMIN', ADMIN],
    ['EDITOR', EDITOR],
  ])(
    'una cuenta %s ve el mismo desplegable en el panel y en la administración, con la zona marcada y sin selector suelto',
    async (_role, user) => {
      for (const [path, active] of [
        ['/panel', 'Mi panel'],
        ['/admin', 'Admin'],
      ] as const) {
        mockApi(handlers, { session: user });
        const view = renderAt(path);
        await userEvent.click(await screen.findByRole('button', { name: user.name }));
        expect(switcher()).not.toBeInTheDocument();
        const items = screen.getAllByRole('menuitem');
        expect(items.map((item) => item.textContent)).toEqual(ZONES);
        expect(items.slice(0, 3).map((item) => item.getAttribute('href'))).toEqual([
          '/',
          '/panel',
          '/admin',
        ]);
        expect(screen.getByRole('menuitem', { current: 'page' })).toHaveTextContent(active);
        // Ninguna de las tres opciones lleva la clase que las oculta en pantallas anchas.
        expect(items.slice(0, 3).every((item) => !item.className.includes('2xl:hidden'))).toBe(
          true,
        );
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

  it('una lectora normal no ve las tres zonas en ninguna parte', async () => {
    for (const path of ['/', '/panel']) {
      mockApi(handlers, { session: READER });
      const view = renderAt(path);
      await screen.findByRole('banner');
      expect(switcher()).not.toBeInTheDocument();
      const button = await screen.findByRole('button', { name: READER.name });
      await userEvent.click(button);
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Ajustes',
        'Salir',
      ]);
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
