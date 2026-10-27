import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, crumbsFor, documentTitle, locate, navForRole } from './adminNav';

const labels = (role: 'EDITOR' | 'ADMIN') =>
  navForRole(role).flatMap((group) => group.items.map((item) => item.label));

describe('menú de administración por rol', () => {
  it('la editora no ve nada de lo que solo puede usar una administradora (y no queda un grupo vacío)', () => {
    const names = labels('EDITOR');
    expect(names).toEqual(
      expect.arrayContaining([
        'Inicio',
        'Libros',
        'Quizzes',
        'Wiki',
        'Fan arts',
        'Portada y autora',
      ]),
    );
    for (const hidden of [
      'Mensajes',
      'Contacto del sitio',
      'Usuarios',
      'Códigos QR',
      'Estadísticas',
    ]) {
      expect(names).not.toContain(hidden);
    }
    expect(navForRole('EDITOR').map((group) => group.id)).not.toContain('administracion');
  });

  it('la administradora ve todo, en los cinco grupos más Inicio', () => {
    expect(labels('ADMIN')).toHaveLength(ADMIN_NAV.flatMap((group) => group.items).length);
    expect(navForRole('ADMIN').map((group) => group.label)).toEqual([
      undefined,
      'Mis libros y quizzes',
      'Contenido del universo',
      'Comunidad',
      'La página',
      'Administración',
    ]);
  });

  it('sin sesión no se ofrece nada que requiera rol', () => {
    expect(labels('ADMIN')).toContain('Usuarios');
    expect(
      navForRole(undefined).flatMap((group) => group.items.map((item) => item.label)),
    ).not.toContain('Usuarios');
  });

  it('cada ruta del menú es única y cuelga de /admin', () => {
    const routes = ADMIN_NAV.flatMap((group) => group.items.map((item) => item.to));
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((to) => to === '/admin' || to.startsWith('/admin/'))).toBe(true);
  });
});

describe('migas y título', () => {
  it('Inicio no lleva migas; una lista lleva grupo y pantalla; un alta, «Nuevo»', () => {
    expect(crumbsFor('/admin')).toEqual([]);
    expect(crumbsFor('/admin/quizzes')).toEqual([
      { label: 'Mis libros y quizzes' },
      { label: 'Quizzes' },
    ]);
    expect(crumbsFor('/admin/quizzes/nuevo')).toEqual([
      { label: 'Mis libros y quizzes' },
      { label: 'Quizzes', to: '/admin/quizzes' },
      { label: 'Nuevo' },
    ]);
    expect(crumbsFor('/admin/wiki/nueva').at(-1)).toEqual({ label: 'Nueva' });
  });

  it('un detalle dice «Editar» hasta que la pantalla pone su nombre real', () => {
    expect(crumbsFor('/admin/quizzes/670000000000000000000010').at(-1)).toEqual({
      label: 'Editar',
    });
    expect(crumbsFor('/admin/quizzes/670000000000000000000010', 'Quiz 3').at(-1)).toEqual({
      label: 'Quiz 3',
    });
  });

  it('una ruta conocida se ubica por el elemento más específico y la desconocida no rompe', () => {
    expect(locate('/admin/actualizaciones/abc')?.item.id).toBe('actualizaciones');
    expect(locate('/admin/qr/')?.item.id).toBe('qr');
    expect(locate('/otra-cosa')).toBeNull();
    expect(crumbsFor('/otra-cosa')).toEqual([]);
  });

  it('el título del documento nombra la pantalla y el sitio', () => {
    expect(documentTitle('/admin/quizzes')).toBe('Quizzes · Administración · Universo Memorias');
    expect(documentTitle('/admin')).toBe('Administración · Universo Memorias');
    expect(documentTitle('/admin/desconocida')).toBe('Administración · Universo Memorias');
  });
});
