/**
 * Las direcciones que sirven la aplicación en el sitio estático. Cualquier otra dirección recibe `404.html` con estado
 * 404 de verdad (en vez del `index.html` con 200 de un comodín, que los buscadores toman por una página válida). Esta
 * lista es la única fuente de `render.yaml`; la prueba de `routeList.test.ts` falla si el enrutador y la lista se
 * desfasan (una ruta nueva sin agregar aquí daría 404 en producción).
 *
 * `*` al final cubre todo lo que cuelga de esa dirección. Las rutas dinámicas de contenido que no existen
 * (`/libros/no-existe`) siguen devolviendo la aplicación con 200 y ella muestra su propio «no encontrada» con `noindex`.
 */
export const APP_ROUTES = [
  '/',
  '/estado',
  '/actualizaciones',
  '/actualizaciones/*',
  '/fan-arts',
  '/contacto',
  '/libros/*',
  '/wiki',
  '/wiki/*',
  '/ingresar',
  '/registro',
  '/olvide-mi-contrasena',
  '/restablecer/*',
  '/baja',
  '/confirmar-novedades',
  '/u/*',
  '/privacidad',
  '/terminos',
  '/cookies',
  '/panel',
  '/panel/*',
  '/admin',
  '/admin/*',
] as const;

/** Lo que el sitio estático reenvía al API en vez de servir la aplicación. */
export const PROXIED_ROUTES = [
  { source: '/api/*', destination: '/api/*' },
  { source: '/sitemap.xml', destination: '/api/sitemap.xml' },
] as const;

/** ¿La dirección `path` cae dentro de este patrón de la lista? */
export function covers(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(`${base}/`);
  }
  return pattern === path;
}
