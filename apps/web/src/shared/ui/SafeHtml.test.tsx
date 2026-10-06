import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeHtml, sanitizeForDisplay } from './SafeHtml';

describe('sanitizeForDisplay (el HTML siempre se trata como no confiable)', () => {
  const attacks = [
    '<script>alert(1)</script><p>hola</p>',
    '<img src="https://res.cloudinary.com/x/a.png" onerror="alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<p onclick="alert(1)">x</p>',
    '<iframe src="https://malo.com"></iframe>',
    '<svg onload="alert(1)"></svg>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    '<style>body{display:none}</style>',
    '<form action="https://malo.com"><input></form>',
  ];

  it.each(attacks)('neutraliza: %s', (html) => {
    const out = sanitizeForDisplay(html);
    expect(out).not.toMatch(/<script|<iframe|<svg|<form|<input|<style/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:|data:/i);
  });

  it('conserva el formato permitido', () => {
    const out = sanitizeForDisplay(
      '<h2>Título</h2><p><strong>negrita</strong> y <a href="https://ejemplo.com">enlace</a></p><ul><li>uno</li></ul>',
    );
    expect(out).toContain('<h2>Título</h2>');
    expect(out).toContain('<strong>negrita</strong>');
    expect(out).toContain('href="https://ejemplo.com"');
    expect(out).toContain('<li>uno</li>');
  });

  it('el componente no inyecta scripts en el DOM', () => {
    const { container } = render(
      <SafeHtml html={'<p>Hola</p><script>window.__hack = true</script>'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('Hola');
    expect((window as unknown as { __hack?: boolean }).__hack).toBeUndefined();
  });
});
