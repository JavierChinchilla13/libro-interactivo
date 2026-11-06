/** Piezas de la línea de comandos de `restore:db` (separadas del script para poder probarlas). */

export interface RestoreArgs {
  /** Carpeta del respaldo, `.tar` o `.tar.cifrado`. */
  source: string;
  /** Base de destino (`--a`); falta con `--solo-verificar`. */
  target?: string;
  verifyOnly: boolean;
  empty: boolean;
  /** `--clave`: pedir la contraseña del archivo cifrado. */
  askKey: boolean;
}

const FLAGS = new Set(['--a', '--vaciar', '--solo-verificar', '--clave']);

/**
 * Lee los argumentos. La contraseña del archivo **nunca** va en la línea de comandos (quedaría en el historial de la
 * terminal): `--clave` no lleva valor y la pide en pantalla sin mostrarla.
 */
export function parseRestoreArgs(argv: string[]): RestoreArgs {
  const positionals: string[] = [];
  let target: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--')) {
      if (!FLAGS.has(arg)) throw new Error(`Opción desconocida: ${arg}`);
      if (arg === '--a') {
        target = argv[i + 1];
        if (!target || target.startsWith('--'))
          throw new Error('Falta la base de destino después de --a.');
        i += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  const askKey = argv.includes('--clave');
  if (positionals.length === 0) {
    throw new Error(
      'Indica el respaldo: la carpeta (con manifiesto.json), el .tar o el .tar.cifrado.',
    );
  }
  if (positionals.length > 1) {
    throw new Error(
      askKey
        ? 'Se indicó más de un respaldo. La contraseña no se escribe en la línea de comandos: --clave la pide en pantalla.'
        : 'Se indicó más de un respaldo: indica solo uno.',
    );
  }
  return {
    source: positionals[0] ?? '',
    ...(target ? { target } : {}),
    verifyOnly: argv.includes('--solo-verificar'),
    empty: argv.includes('--vaciar'),
    askKey,
  };
}

export interface HiddenInput extends NodeJS.EventEmitter {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume(): unknown;
  pause(): unknown;
}

/**
 * Pide una línea sin mostrar lo que se escribe (ni asteriscos). Acepta borrar con la tecla de retroceso; Ctrl+C
 * cancela. Con una terminal real pone el modo «crudo» para que la terminal no repita las teclas.
 */
export function readHidden(
  question: string,
  io: { input: HiddenInput; output: { write(text: string): unknown } },
): Promise<string> {
  const { input, output } = io;
  return new Promise((resolve, reject) => {
    let value = '';
    const raw = Boolean(input.isTTY && input.setRawMode);
    const finish = (error?: Error) => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      if (raw) input.setRawMode?.(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (data: Buffer | string) => {
      for (const char of String(data)) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('Cancelado.'));
        if (char === '\u007f' || char === '\b') {
          value = [...value].slice(0, -1).join('');
        } else if (char >= ' ') {
          value += char;
        }
      }
    };
    const onEnd = () => finish(new Error('Se cerró la entrada sin escribir la contraseña.'));
    output.write(question);
    if (raw) input.setRawMode?.(true);
    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}

/** Variable de entorno para usos sin terminal (por ejemplo, Git Bash sin `winpty`). */
export const KEY_ENV = 'RESPALDO_CLAVE';

/**
 * Consigue la contraseña del archivo: en pantalla si hay terminal; si no, de `RESPALDO_CLAVE`. Nunca la imprime.
 */
export async function askArchiveKey(
  io: { input: HiddenInput; output: { write(text: string): unknown } },
  env: Record<string, string | undefined>,
): Promise<string> {
  if (io.input.isTTY && io.input.setRawMode) {
    return readHidden('Contraseña del archivo (no se ve al escribirla): ', io);
  }
  const fromEnv = env[KEY_ENV];
  if (fromEnv) return fromEnv;
  throw new Error(
    `No hay una terminal para pedir la contraseña sin mostrarla. Usa PowerShell o cmd (en Git Bash: winpty npm run restore:db …), o define ${KEY_ENV} en el entorno.`,
  );
}
