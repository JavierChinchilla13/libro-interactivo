import { describe, expect, it } from 'vitest';
import {
  addressForHops,
  describeNetwork,
  looksInternal,
  maskIp,
  parseForwardedFor,
} from './networkCheck.js';

describe('maskIp', () => {
  it('IPv4: oculta el último número; IPv4 mapeada en IPv6 se trata como IPv4', () => {
    expect(maskIp('190.12.34.56')).toBe('190.12.34.x');
    expect(maskIp('::ffff:190.12.34.56')).toBe('190.12.34.x');
  });

  it('IPv6: muestra solo los tres primeros grupos, con y sin «::»', () => {
    expect(maskIp('2800:4f0:1a2:ff:1:2:3:4')).toBe('2800:4f0:1a2::x');
    expect(maskIp('2800:4f0::1')).toBe('2800:4f0:0::x');
    expect(maskIp('::1')).toBe('0:0:0::x');
  });

  it('no repite texto que no es una dirección (podría venir inventado en la cabecera)', () => {
    expect(maskIp('hola, soy un ataque')).toBe('(no es una dirección válida)');
    expect(maskIp('')).toBe('(no es una dirección válida)');
  });

  it('nunca devuelve la dirección completa', () => {
    for (const ip of ['190.12.34.56', '2800:4f0:1a2:ff:1:2:3:4']) {
      expect(maskIp(ip)).not.toBe(ip);
      expect(maskIp(ip)).not.toContain('34.56');
      expect(maskIp(ip)).not.toContain('ff:1:2');
    }
  });
});

describe('looksInternal', () => {
  it.each([
    '10.1.2.3',
    '127.0.0.1',
    '172.16.0.9',
    '172.31.255.1',
    '192.168.1.5',
    '169.254.1.1',
    '100.64.0.1',
    '::1',
    'fd12::1',
    '::ffff:10.0.0.1',
  ])('%s es interna', (ip) => expect(looksInternal(ip)).toBe(true));

  it.each(['190.12.34.56', '172.32.0.1', '8.8.8.8', '2800:4f0::1', 'texto'])('%s no lo es', (ip) =>
    expect(looksInternal(ip)).toBe(false),
  );
});

describe('addressForHops', () => {
  const chain = ['203.0.113.7', '10.0.0.2']; // cliente y proxy 1; el socket es el proxy 2
  it('0 saltos es la conexión directa; cada salto retrocede un lugar; se detiene en la más a la izquierda', () => {
    expect(addressForHops('10.0.0.3', chain, 0)).toBe('10.0.0.3');
    expect(addressForHops('10.0.0.3', chain, 1)).toBe('10.0.0.2');
    expect(addressForHops('10.0.0.3', chain, 2)).toBe('203.0.113.7');
    expect(addressForHops('10.0.0.3', chain, 5)).toBe('203.0.113.7');
    expect(addressForHops('10.0.0.3', [], 3)).toBe('10.0.0.3');
  });
});

describe('describeNetwork', () => {
  it('cuenta las entradas, marca el salto actual y solo muestra direcciones enmascaradas', () => {
    const out = describeNetwork({
      remote: '::ffff:10.0.0.3',
      forwardedFor: '203.0.113.7, 10.0.0.2',
      cfConnectingIp: '203.0.113.7',
      configuredHops: 2,
    });
    expect(out.forwardedForEntries).toBe(2);
    expect(out.hasCfConnectingIp).toBe(true);
    expect(out.cfConnectingIpMasked).toBe('203.0.113.x');
    expect(out.resolvedMasked).toBe('203.0.113.x');
    expect(out.candidates.map((c) => c.masked)).toEqual([
      '10.0.0.x',
      '10.0.0.x',
      '203.0.113.x',
      '203.0.113.x',
      '203.0.113.x',
    ]);
    expect(out.candidates.filter((c) => c.current).map((c) => c.hops)).toEqual([2]);
    expect(out.candidates.map((c) => c.looksInternal)).toEqual([true, true, false, false, false]);
    expect(JSON.stringify(out)).not.toMatch(/203\.0\.113\.7|10\.0\.0\.[23]\b/);
  });

  it('sin X-Forwarded-For ni CF-Connecting-IP lo dice claramente', () => {
    const out = describeNetwork({
      remote: '10.0.0.3',
      forwardedFor: undefined,
      cfConnectingIp: undefined,
      configuredHops: 1,
    });
    expect(out).toMatchObject({
      forwardedForEntries: 0,
      hasCfConnectingIp: false,
      cfConnectingIpMasked: null,
    });
  });
});

describe('parseForwardedFor', () => {
  it('separa por comas, recorta espacios y descarta vacíos', () => {
    expect(parseForwardedFor(' 1.1.1.1 ,, 2.2.2.2 ')).toEqual(['1.1.1.1', '2.2.2.2']);
    expect(parseForwardedFor(undefined)).toEqual([]);
  });
});
