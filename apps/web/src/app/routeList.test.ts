import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './router';
import { APP_ROUTES, covers } from './routeList';

/** Todas las direcciones del enrutador, con `:parámetro` convertido en un valor de ejemplo (el comodín `*` no cuenta). */
function routerPaths(list: RouteObject[], prefix = ''): string[] {
  const out: string[] = [];
  for (const route of list) {
    if (route.path === '*') continue;
    const here = route.path ? `${prefix}/${route.path}`.replace(/\/+/g, '/') : prefix;
    if (route.path || route.index) out.push((here || '/').replace(/:[A-Za-z]+/g, 'ejemplo'));
    if (route.children) out.push(...routerPaths(route.children, here));
  }
  return out;
}

describe('lista de rutas del sitio estático', () => {
  const paths = [...new Set(routerPaths(routes))];

  it('el enrutador tiene las rutas públicas y privadas que se esperan', () => {
    expect(paths).toEqual(
      expect.arrayContaining(['/', '/wiki', '/libros/ejemplo', '/panel', '/admin', '/privacidad']),
    );
  });

  it('cada ruta del enrutador está en la lista (si no, daría 404 en producción)', () => {
    const missing = paths.filter((path) => !APP_ROUTES.some((pattern) => covers(pattern, path)));
    expect(missing).toEqual([]);
  });

  it('cada entrada de la lista corresponde a una ruta real (nada de direcciones fantasma)', () => {
    const ghosts = APP_ROUTES.filter((pattern) => !paths.some((path) => covers(pattern, path)));
    expect(ghosts).toEqual([]);
  });

  it('sin comodines que den 200 a cualquier dirección', () => {
    expect(APP_ROUTES).not.toContain('/*');
    expect(APP_ROUTES.every((pattern) => pattern.startsWith('/'))).toBe(true);
  });

  it('covers: el comodín cubre la base y lo de abajo, pero no direcciones vecinas', () => {
    expect(covers('/wiki/*', '/wiki')).toBe(true);
    expect(covers('/wiki/*', '/wiki/entrada/1')).toBe(true);
    expect(covers('/wiki/*', '/wikipedia')).toBe(false);
    expect(covers('/estado', '/estado/otro')).toBe(false);
  });
});
