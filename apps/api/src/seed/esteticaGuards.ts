/** Guardias de `scripts/seed-estetica.ts` (datos de prueba de la estética): puras, para poder probarlas. */

/** ¿La URI de MongoDB apunta a esta misma máquina? (`mongodb+srv://` nunca es local: es un clúster remoto). */
export function isLocalMongoUri(uri: string): boolean {
  if (uri.startsWith('mongodb+srv://')) return false;
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  if (!match?.[1]) return false;
  // Puede haber varios anfitriones separados por comas: todos deben ser locales.
  return match[1].split(',').every((host) => {
    const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
    return name === 'localhost' || name === '127.0.0.1' || name === '[::1]';
  });
}

export type EsteticaArgs = { remove: boolean; allowRemote: boolean } | { error: string };

/** Solo se aceptan opciones conocidas: un error de escritura no debe caer en la rama de carga. */
export function parseEsteticaArgs(argv: readonly string[]): EsteticaArgs {
  const known = new Set(['--quitar', '--base-remota']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    return {
      error: `Opción desconocida: ${unknown.join(', ')}. Opciones: --quitar (retira los datos de prueba), --base-remota (permite una base que no es local).`,
    };
  }
  return { remove: argv.includes('--quitar'), allowRemote: argv.includes('--base-remota') };
}
