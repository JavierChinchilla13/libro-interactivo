import { describe, expect, it } from 'vitest';
import { createTestClock } from '../test-utils/app.js';
import { AGE_REJECTION_LIMIT, createAgeGate } from './ageGate.service.js';

const START = new Date('2026-10-28T12:00:00Z');

describe('createAgeGate', () => {
  it('se cierra al llegar al tope de rechazos y no antes', () => {
    const gate = createAgeGate({ clock: createTestClock(START) });
    for (let i = 0; i < AGE_REJECTION_LIMIT - 1; i += 1) {
      gate.recordRejection('203.0.113.7');
      expect(gate.isClosed('203.0.113.7')).toBe(false);
    }
    gate.recordRejection('203.0.113.7');
    expect(gate.isClosed('203.0.113.7')).toBe(true);
  });

  it('cada red tiene su propia cuenta', () => {
    const gate = createAgeGate({ clock: createTestClock(START), limit: 1 });
    gate.recordRejection('203.0.113.7');
    expect(gate.isClosed('203.0.113.7')).toBe(true);
    expect(gate.isClosed('203.0.113.8')).toBe(false);
  });

  it('en IPv6 cuenta por la red /56, no por cada dirección', () => {
    const gate = createAgeGate({ clock: createTestClock(START), limit: 1 });
    gate.recordRejection('2800:4f0:1a2:ff00::1');
    expect(gate.isClosed('2800:4f0:1a2:ff00::2')).toBe(true);
    expect(gate.isClosed('2800:4f0:9999:ff00::1')).toBe(false);
  });

  it('se reabre al pasar la hora', () => {
    const clock = createTestClock(START);
    const gate = createAgeGate({ clock, limit: 1 });
    gate.recordRejection('203.0.113.7');
    clock.advance(59 * 60_000);
    expect(gate.isClosed('203.0.113.7')).toBe(true);
    clock.advance(2 * 60_000);
    expect(gate.isClosed('203.0.113.7')).toBe(false);
  });

  it('no crece sin tope: con la memoria llena suelta las entradas viejas', () => {
    const clock = createTestClock(START);
    const gate = createAgeGate({ clock, limit: 1, maxTracked: 3 });
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4']) gate.recordRejection(ip);
    // La más antigua cedió su lugar; las recientes siguen contadas.
    expect(gate.isClosed('1.1.1.1')).toBe(false);
    expect(gate.isClosed('4.4.4.4')).toBe(true);
  });

  it('sin IP conocida usa una cuenta común en lugar de fallar', () => {
    const gate = createAgeGate({ clock: createTestClock(START), limit: 1 });
    gate.recordRejection(undefined);
    expect(gate.isClosed(undefined)).toBe(true);
  });
});
