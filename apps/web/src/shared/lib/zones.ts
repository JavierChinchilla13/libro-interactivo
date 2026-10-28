export type Zone = 'site' | 'panel' | 'admin';

/** En qué zona está la persona según la ruta: el panel del lector, la administración o el sitio público. */
export function zoneOf(pathname: string): Zone {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/panel' || pathname.startsWith('/panel/')) return 'panel';
  return 'site';
}
