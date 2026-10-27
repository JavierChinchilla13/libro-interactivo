import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';

const person = (role: 'EDITOR' | 'ADMIN') => ({
  id: '670000000000000000000001',
  name: 'Marisol Quesada',
  email: 'marisol@ejemplo.com',
  role,
});

describe('marco de la administración', () => {
  it('agrupa el menú por tareas, marca la pantalla actual y titula la pestaña', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: person('ADMIN') });
    renderAt('/admin/quizzes');
    const menu = await screen.findByRole('navigation', { name: 'Administración' });
    for (const group of [
      'Mis libros y quizzes',
      'Contenido del universo',
      'Comunidad',
      'La página',
      'Administración',
    ]) {
      expect(within(menu).getByRole('group', { name: group })).toBeInTheDocument();
    }
    expect(within(menu).getByRole('link', { name: 'Quizzes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menu).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(document.title).toBe('Quizzes · Administración · Universo Memorias');
    expect(screen.getByRole('navigation', { name: 'Dónde estás' })).toHaveTextContent(
      'Mis libros y quizzes',
    );
  });

  it('la editora no ve Mensajes, Usuarios, Códigos QR ni Estadísticas, y tampoco queda nada «bloqueado»', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: person('EDITOR') });
    renderAt('/admin/libros');
    const menu = await screen.findByRole('navigation', { name: 'Administración' });
    for (const hidden of [
      'Mensajes',
      'Usuarios',
      'Códigos QR',
      'Estadísticas',
      'Contacto del sitio',
    ]) {
      expect(within(menu).queryByRole('link', { name: hidden })).toBeNull();
    }
    expect(within(menu).queryByRole('group', { name: 'Administración' })).toBeNull();
    expect(menu.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('el cajón del celular se abre con el botón de menú, atrapa el foco y se cierra con Escape devolviéndolo', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: person('ADMIN') });
    renderAt('/admin/libros');
    const open = await screen.findByRole('button', { name: 'Abrir el menú' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('admin-sidebar')).toHaveAttribute('data-open', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.getElementById('admin-sidebar')).toContainElement(
      document.activeElement as HTMLElement,
    );
    await userEvent.keyboard('{Escape}');
    expect(document.getElementById('admin-sidebar')).toHaveAttribute('data-open', 'false');
    expect(document.body.style.overflow).toBe('');
    expect(open).toHaveFocus();
  });

  it('elegir una pantalla en el cajón lo cierra', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: person('ADMIN') });
    renderAt('/admin/libros');
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir el menú' }));
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Administración' })).getByRole('link', {
        name: 'Wiki',
      }),
    );
    expect(document.getElementById('admin-sidebar')).toHaveAttribute('data-open', 'false');
  });
});
