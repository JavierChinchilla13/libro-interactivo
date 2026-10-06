import { describe, expect, it } from 'vitest';
import { sanitizeRichHtml } from './sanitize.js';

describe('sanitizeRichHtml', () => {
  it('conserva el formato permitido', () => {
    const html =
      '<h2>Título</h2><p>Texto con <strong>negrita</strong>, <em>cursiva</em> y <a href="https://ejemplo.com">enlace</a>.</p><ul><li>uno</li></ul><blockquote>cita</blockquote>';
    const out = sanitizeRichHtml(html);
    expect(out).toContain('<h2>Título</h2>');
    expect(out).toContain('<strong>negrita</strong>');
    expect(out).toContain('<li>uno</li>');
    expect(out).toContain('<blockquote>cita</blockquote>');
    expect(out).toContain('<a href="https://ejemplo.com" rel="noopener noreferrer">enlace</a>');
  });

  const vectors: [string, string][] = [
    ['script', '<p>hola</p><script>alert(1)</script>'],
    ['script con mayúsculas mezcladas', '<ScRiPt>alert(1)</sCrIpT>'],
    ['onerror en img', '<img src="x" onerror="alert(1)">'],
    ['onerror en img de Cloudinary', '<img src="https://res.cloudinary.com/x/a.png" onerror="alert(1)">'],
    ['onclick', '<p onclick="alert(1)">clic</p>'],
    ['onmouseover en enlace', '<a href="https://a.com" onmouseover="alert(1)">x</a>'],
    ['javascript: en enlace', '<a href="javascript:alert(1)">x</a>'],
    ['javascript: con espacios y mayúsculas', '<a href="  JaVaScRiPt:alert(1)">x</a>'],
    ['javascript: con entidades', '<a href="&#106;avascript:alert(1)">x</a>'],
    ['data: en enlace', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
    ['iframe', '<iframe src="https://malo.com"></iframe>'],
    ['object/embed', '<object data="x"></object><embed src="x">'],
    ['svg con script', '<svg onload="alert(1)"><script>alert(1)</script></svg>'],
    ['style', '<style>body{display:none}</style><p style="background:url(javascript:alert(1))">x</p>'],
    ['form', '<form action="https://malo.com"><input name="a"></form>'],
    ['img con data:', '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">'],
    ['img de otro host', '<img src="https://malo.com/a.png">'],
    ['img http (sin TLS) de Cloudinary', '<img src="http://res.cloudinary.com/x/a.png">'],
    ['base y meta', '<base href="https://malo.com"><meta http-equiv="refresh" content="0;url=https://malo.com">'],
    ['atributos con comillas rotas', '<p title="x" onfocus=alert(1) autofocus>x</p>'],
    ['etiqueta sin cerrar', '<p>hola<script>alert(1)'],
  ];

  it.each(vectors)('neutraliza: %s', (_name, input) => {
    const out = sanitizeRichHtml(input);
    expect(out).not.toMatch(/<script|<iframe|<object|<embed|<svg|<form|<input|<style|<base|<meta/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:/i);
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('malo.com');
  });

  it('todo enlace queda con rel="noopener noreferrer" aunque traiga otro rel', () => {
    const out = sanitizeRichHtml('<a href="https://a.com" rel="opener" target="_blank">x</a>');
    expect(out).toBe('<a href="https://a.com" rel="noopener noreferrer">x</a>');
  });

  it('deja pasar mailto y las imágenes de Cloudinary, y quita estilos y clases', () => {
    const out = sanitizeRichHtml(
      '<p class="a" style="color:red"><a href="mailto:autora@ejemplo.com">escríbeme</a></p><img src="https://res.cloudinary.com/demo/image/upload/a.png" alt="Dibujo">',
    );
    expect(out).toContain('href="mailto:autora@ejemplo.com"');
    expect(out).toContain('<img src="https://res.cloudinary.com/demo/image/upload/a.png" alt="Dibujo" />');
    expect(out).not.toContain('class=');
    expect(out).not.toContain('style=');
  });

  it('es idempotente (sanear dos veces da lo mismo) y no rompe el texto con símbolos', () => {
    const once = sanitizeRichHtml('<p>5 &lt; 6 &amp; "comillas" <b>ok</b></p><script>x</script>');
    expect(sanitizeRichHtml(once)).toBe(once);
    expect(once).toContain('5 &lt; 6 &amp;');
  });

  it('un texto vacío o solo con etiquetas prohibidas queda vacío', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(sanitizeRichHtml('<script>x</script>')).toBe('');
  });
});
