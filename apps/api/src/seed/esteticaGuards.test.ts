import { describe, expect, it } from 'vitest';
import { isLocalMongoUri, parseEsteticaArgs } from './esteticaGuards.js';

describe('isLocalMongoUri', () => {
  it.each([
    'mongodb://127.0.0.1:27017/libro',
    'mongodb://localhost/libro',
    'mongodb://usuario:clave@localhost:27017/libro?authSource=admin',
    'mongodb://[::1]:27017/libro',
    'mongodb://127.0.0.1:27017,localhost:27018/libro',
  ])('«%s» es local', (uri) => {
    expect(isLocalMongoUri(uri)).toBe(true);
  });

  it.each([
    'mongodb+srv://usuario:clave@cluster0.abcde.mongodb.net/libro',
    'mongodb://cluster0-shard-00-00.abcde.mongodb.net:27017/libro',
    'mongodb://localhost.evil.com:27017/libro',
    'mongodb://127.0.0.1:27017,db.ejemplo.com:27017/libro',
    'mongodb://usuario:localhost@db.ejemplo.com/libro',
    '',
    'no es una uri',
  ])('«%s» NO es local', (uri) => {
    expect(isLocalMongoUri(uri)).toBe(false);
  });
});

describe('parseEsteticaArgs', () => {
  it('sin opciones carga; --quitar retira; --base-remota se pide expresamente', () => {
    expect(parseEsteticaArgs([])).toEqual({ remove: false, allowRemote: false });
    expect(parseEsteticaArgs(['--quitar'])).toEqual({ remove: true, allowRemote: false });
    expect(parseEsteticaArgs(['--quitar', '--base-remota'])).toEqual({
      remove: true,
      allowRemote: true,
    });
  });

  it('una opción mal escrita se rechaza en vez de caer en la carga', () => {
    for (const bad of ['-quitar', '--quitr', 'quitar', '--remove']) {
      const result = parseEsteticaArgs([bad]);
      expect('error' in result && result.error).toContain(bad);
    }
  });
});
