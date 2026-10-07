import { describe, expect, it } from 'vitest';
import { buildAccessToken, hashAccessToken, parseAccessToken } from './accessToken.js';

const SECRET = 'secreto-de-prueba-de-al-menos-treinta-y-dos-caracteres';
const ID = '6700000000000000000000af';

describe('token de acceso (QR)', () => {
  it('tiene el formato id.firma y es determinista (el QR se puede regenerar idéntico)', () => {
    const token = buildAccessToken(ID, SECRET);
    expect(token).toMatch(/^6700000000000000000000af\.[A-Za-z0-9_-]{43}$/);
    expect(buildAccessToken(ID, SECRET)).toBe(token);
  });

  it('el token auténtico devuelve su id', () => {
    expect(parseAccessToken(buildAccessToken(ID, SECRET), SECRET)).toBe(ID);
  });

  it('rechaza una firma alterada, otro id con la firma de este, otro secreto y formatos raros', () => {
    const token = buildAccessToken(ID, SECRET);
    const [id, sig] = token.split('.') as [string, string];
    const flipped = `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    const cases = [
      `${id}.${flipped}`,
      `670000000000000000000031.${sig}`,
      `${id}.`,
      `.${sig}`,
      id,
      `${token}.extra`,
      `${id}.${sig}${sig}`,
      `${id.toUpperCase()}.${sig}`,
      `zzzzzzzzzzzzzzzzzzzzzzzz.${sig}`,
      '',
      'a'.repeat(500),
    ];
    for (const bad of cases) expect(parseAccessToken(bad, SECRET), bad).toBeNull();
    expect(parseAccessToken(token, `${SECRET}-otro`)).toBeNull();
  });

  it('el hash guardado no contiene el token y es estable', () => {
    const token = buildAccessToken(ID, SECRET);
    const hash = hashAccessToken(token);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hash).not.toContain(token.split('.')[1]);
    expect(hashAccessToken(token)).toBe(hash);
    expect(hashAccessToken(`${token}x`)).not.toBe(hash);
  });
});
