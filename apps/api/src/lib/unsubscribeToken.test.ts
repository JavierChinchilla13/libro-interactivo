import { describe, expect, it } from 'vitest';
import { maskAccessToken } from './maskUrl.js';
import { signSvix, verifySvix } from './svix.js';
import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribeToken.js';

const SECRET = 'Vb7nP2qLx9TzR4mKs8HdW1cFj6YgAe3uNo5QiErT';
const USER = '670000000000000000000001';

describe('token de baja', () => {
  it('ida y vuelta con el mismo secreto', () => {
    const token = createUnsubscribeToken(USER, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER);
  });

  it('rechaza otro secreto, la firma de otra cuenta, alteraciones y basura', () => {
    const token = createUnsubscribeToken(USER, SECRET);
    expect(verifyUnsubscribeToken(token, `${SECRET}x`)).toBeNull();
    const [, mac] = token.split('.');
    const otherId = Buffer.from('670000000000000000000002').toString('base64url');
    expect(verifyUnsubscribeToken(`${otherId}.${mac}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}.extra`, SECRET)).toBeNull();
    for (const junk of [
      '',
      '.',
      'abc',
      'a.b',
      `${Buffer.from('no-es-un-id').toString('base64url')}.${mac}`,
    ]) {
      expect(verifyUnsubscribeToken(junk, SECRET), junk).toBeNull();
    }
  });
});

describe('firma Svix (webhook de Resend)', () => {
  // Secreto con la forma real (`whsec_` + base64).
  const secret = `whsec_${Buffer.from('clave-de-prueba-del-webhook-1234').toString('base64')}`;
  const now = new Date('2026-11-09T12:00:00Z');
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = '{"type":"email.bounced","data":{"to":["a@ejemplo.com"]}}';
  const headers = (signature: string, timestamp = ts, id = 'msg_1') => ({
    id,
    timestamp,
    signature,
  });

  it('acepta la firma correcta (también entre varias, como al rotar el secreto)', () => {
    const sig = signSvix(secret, 'msg_1', ts, body);
    expect(verifySvix(secret, headers(`v1,${sig}`), body, now)).toBe(true);
    expect(verifySvix(secret, headers(`v1,AAAA v1,${sig}`), body, now)).toBe(true);
  });

  it('rechaza el cuerpo alterado, otro id, otro secreto, otra versión y cabeceras que faltan', () => {
    const sig = signSvix(secret, 'msg_1', ts, body);
    expect(verifySvix(secret, headers(`v1,${sig}`), `${body} `, now)).toBe(false);
    expect(verifySvix(secret, headers(`v1,${sig}`, ts, 'msg_2'), body, now)).toBe(false);
    const other = `whsec_${Buffer.from('otra-clave-del-webhook-56789012').toString('base64')}`;
    expect(verifySvix(other, headers(`v1,${sig}`), body, now)).toBe(false);
    expect(verifySvix(secret, headers(`v2,${sig}`), body, now)).toBe(false);
    expect(
      verifySvix(secret, { id: undefined, timestamp: ts, signature: `v1,${sig}` }, body, now),
    ).toBe(false);
    expect(verifySvix(secret, headers(`v1,${sig}`, 'no-es-numero'), body, now)).toBe(false);
  });

  it('rechaza una marca de tiempo de hace más de 5 minutos (reenvíos viejos) o del futuro', () => {
    const old = String(Number(ts) - 6 * 60);
    const future = String(Number(ts) + 6 * 60);
    expect(
      verifySvix(secret, headers(`v1,${signSvix(secret, 'msg_1', old, body)}`, old), body, now),
    ).toBe(false);
    expect(
      verifySvix(
        secret,
        headers(`v1,${signSvix(secret, 'msg_1', future, body)}`, future),
        body,
        now,
      ),
    ).toBe(false);
    const recent = String(Number(ts) - 4 * 60);
    expect(
      verifySvix(
        secret,
        headers(`v1,${signSvix(secret, 'msg_1', recent, body)}`, recent),
        body,
        now,
      ),
    ).toBe(true);
  });
});

describe('los registros no guardan los tokens de las direcciones', () => {
  it('oculta el token de baja y el del QR', () => {
    expect(maskAccessToken('/api/newsletter/unsubscribe?t=abc.def')).toBe(
      '/api/newsletter/unsubscribe?t=[REDACTADO]',
    );
    expect(maskAccessToken('/api/newsletter/unsubscribe?origen=enlace&t=abc.def')).toBe(
      '/api/newsletter/unsubscribe?origen=enlace&t=[REDACTADO]',
    );
    expect(maskAccessToken('/api/access/resolve/abc123')).toBe('/api/access/resolve/[REDACTADO]');
    expect(maskAccessToken('/api/books?t=1')).toBe('/api/books?t=1');
  });
});
