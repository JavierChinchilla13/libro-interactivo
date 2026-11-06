import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { KEY_ENV, askArchiveKey, parseRestoreArgs, readHidden } from './restoreCli.js';

describe('parseRestoreArgs', () => {
  it('lee el respaldo, el destino y las opciones', () => {
    expect(
      parseRestoreArgs([
        'r.tar.cifrado',
        '--clave',
        '--a',
        'mongodb://127.0.0.1/libro-prueba',
        '--vaciar',
      ]),
    ).toEqual({
      source: 'r.tar.cifrado',
      target: 'mongodb://127.0.0.1/libro-prueba',
      verifyOnly: false,
      empty: true,
      askKey: true,
    });
    expect(parseRestoreArgs(['--solo-verificar', 'carpeta'])).toEqual({
      source: 'carpeta',
      verifyOnly: true,
      empty: false,
      askKey: false,
    });
  });

  it('la contraseña nunca va en la línea de comandos: un segundo argumento suelto es un error', () => {
    expect(() => parseRestoreArgs(['r.tar.cifrado', '--clave', 'MiClaveSecreta123'])).toThrow(
      /no se escribe en la línea de comandos/,
    );
    expect(() => parseRestoreArgs(['a', 'b'])).toThrow(/solo uno/);
  });

  it('pide el respaldo, el valor de --a y rechaza opciones desconocidas', () => {
    expect(() => parseRestoreArgs(['--solo-verificar'])).toThrow(/Indica el respaldo/);
    expect(() => parseRestoreArgs(['r.tar', '--a'])).toThrow(/después de --a/);
    expect(() => parseRestoreArgs(['r.tar', '--a', '--vaciar'])).toThrow(/después de --a/);
    expect(() => parseRestoreArgs(['r.tar', '--clave=secreto'])).toThrow(/desconocida/);
  });
});

/** Entrada falsa que se comporta como una terminal (o no). */
function fakeInput(tty: boolean) {
  const input = Object.assign(new EventEmitter(), {
    isTTY: tty,
    rawModes: [] as boolean[],
    resumed: 0,
    paused: 0,
    resume() {
      input.resumed += 1;
    },
    pause() {
      input.paused += 1;
    },
    ...(tty
      ? {
          setRawMode(mode: boolean) {
            input.rawModes.push(mode);
          },
        }
      : {}),
  });
  return input;
}

function fakeOutput() {
  const written: string[] = [];
  return { written, write: (text: string) => written.push(text) };
}

describe('readHidden', () => {
  it('no repite lo que se escribe, borra con retroceso y termina con Enter', async () => {
    const input = fakeInput(true);
    const output = fakeOutput();
    const answer = readHidden('Contraseña: ', { input, output });
    input.emit('data', Buffer.from('Faro-Lejx'));
    input.emit('data', '\u007f'); // retroceso (terminales Unix y Windows Terminal)
    input.emit('data', 'ano\b'); // retroceso clásico
    input.emit('data', 'o-Ocho\r\n');
    await expect(answer).resolves.toBe('Faro-Lejano-Ocho');
    expect(output.written.join('')).toBe('Contraseña: \n');
    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(1);
    expect(input.listenerCount('data')).toBe(0);
  });

  it('Ctrl+C cancela y una entrada que se cierra sin Enter es un error', async () => {
    const a = fakeInput(true);
    const cancelled = readHidden('? ', { input: a, output: fakeOutput() });
    a.emit('data', 'abc\u0003');
    await expect(cancelled).rejects.toThrow('Cancelado.');
    expect(a.rawModes).toEqual([true, false]);

    const b = fakeInput(false);
    const closed = readHidden('? ', { input: b, output: fakeOutput() });
    b.emit('data', 'abc');
    b.emit('end');
    await expect(closed).rejects.toThrow(/Se cerró la entrada/);
  });
});

describe('askArchiveKey', () => {
  it('con terminal la pide en pantalla', async () => {
    const input = fakeInput(true);
    const answer = askArchiveKey({ input, output: fakeOutput() }, { [KEY_ENV]: 'ignorada' });
    input.emit('data', 'Desde-La-Terminal-1\r');
    await expect(answer).resolves.toBe('Desde-La-Terminal-1');
  });

  it('sin terminal la toma de RESPALDO_CLAVE, y si no está explica qué hacer', async () => {
    const input = fakeInput(false);
    await expect(
      askArchiveKey({ input, output: fakeOutput() }, { [KEY_ENV]: 'Desde-El-Entorno-1' }),
    ).resolves.toBe('Desde-El-Entorno-1');
    await expect(askArchiveKey({ input, output: fakeOutput() }, {})).rejects.toThrow(
      /winpty.*RESPALDO_CLAVE/,
    );
  });
});
