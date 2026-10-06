import { describe, expect, it } from 'vitest';
import { escapeHtml, singleLine } from '../lib/html.js';
import {
  contactMessageEmail,
  passwordChangedEmail,
  passwordResetEmail,
} from './email.templates.js';

describe('escapeHtml / singleLine', () => {
  it('escapa los caracteres peligrosos', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('deja una sola línea sin caracteres de control y la recorta', () => {
    expect(singleLine('Ana\r\nBcc: x@y.co\u0000')).toBe('Ana Bcc: x@y.co');
    expect(singleLine('x'.repeat(200))).toHaveLength(80);
  });
});

describe('plantillas de correo', () => {
  it('recuperación: incluye el enlace en HTML y texto, el plazo y escapa el nombre', () => {
    const mail = passwordResetEmail({
      name: 'Ana <b>López</b>',
      link: 'https://app.ejemplo.com/restablecer/abc123',
      ttlMinutes: 30,
    });
    expect(mail.subject).toContain('Restablece tu contraseña');
    expect(mail.text).toContain('https://app.ejemplo.com/restablecer/abc123');
    expect(mail.text).toContain('30 minutos');
    expect(mail.html).toContain('href="https://app.ejemplo.com/restablecer/abc123"');
    expect(mail.html).not.toContain('<b>López</b>');
    expect(mail.html).toContain('&lt;b&gt;L');
  });

  it('el enlace se escapa dentro del atributo href (no permite romper el HTML)', () => {
    const mail = passwordResetEmail({
      name: 'Ana',
      link: 'https://x.co/"><script>alert(1)</script>',
      ttlMinutes: 30,
    });
    expect(mail.html).not.toContain('<script>');
  });

  it('cambio de contraseña: confirma la acción, con hora de Costa Rica y sin datos sensibles', () => {
    const mail = passwordChangedEmail({ name: 'Ana', changedAt: new Date('2026-10-05T18:30:00Z') });
    expect(mail.subject).toContain('fue cambiada');
    expect(mail.text).toContain('hora de Costa Rica');
    expect(mail.text).toMatch(/2026/);
    expect(mail.html).toContain('Si no fuiste tú');
  });

  it('contacto: escapa el mensaje, conserva saltos de línea y limpia el asunto', () => {
    const mail = contactMessageEmail({
      name: 'Ana\r\nBcc: x@y.co',
      email: 'ana@ejemplo.com',
      message: 'Línea 1\nLínea 2 <script>alert(1)</script>',
      receivedAt: new Date('2026-10-05T18:30:00Z'),
    });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).toContain('Línea 1<br>Línea 2');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('Línea 1\nLínea 2');
    expect(mail.text).toContain('ana@ejemplo.com');
  });
});
