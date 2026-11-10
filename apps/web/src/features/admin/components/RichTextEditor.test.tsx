import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from './RichTextEditor';

function Harness({
  pages = false,
  onChange,
}: {
  pages?: boolean;
  onChange: (html: string) => void;
}) {
  const [value, setValue] = useState('<p>Hola, lectora</p>');
  return (
    <RichTextEditor
      label="Mensaje"
      pages={pages}
      value={value}
      onChange={(html) => {
        setValue(html);
        onChange(html);
      }}
    />
  );
}

// ProseMirror mide el texto al mover la selección; jsdom no tiene esas medidas.
beforeAll(() => {
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  Object.assign(Text.prototype, { getClientRects: empty, getBoundingClientRect: rect });
  Object.assign(Range.prototype, { getClientRects: empty, getBoundingClientRect: rect });
});

const last = (spy: ReturnType<typeof vi.fn>) => String(spy.mock.calls.at(-1)?.[0] ?? '');

describe('RichTextEditor: alineación y páginas', () => {
  it('solo ofrece alinear a la izquierda y centrar; centrar y volver a la izquierda', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const toolbar = await screen.findByRole('toolbar', { name: 'Formato de Mensaje' });
    expect(toolbar).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /derecha|justific/i })).toBeNull();
    const left = screen.getByRole('button', { name: 'Alinear a la izquierda' });
    const center = screen.getByRole('button', { name: 'Centrar' });
    expect(left).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(center);
    await waitFor(() => expect(last(onChange)).toContain('style="text-align: center'));
    expect(center).toHaveAttribute('aria-pressed', 'true');
    expect(left).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(left);
    await waitFor(() => expect(last(onChange)).not.toContain('text-align: center'));
  });

  it('«Nueva página» inserta un separador, y solo aparece donde se pide', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<Harness onChange={onChange} />);
    await screen.findByRole('toolbar');
    expect(screen.queryByRole('button', { name: /Nueva página/ })).toBeNull();
    unmount();

    render(<Harness pages onChange={onChange} />);
    await userEvent.click(await screen.findByRole('button', { name: /Nueva página/ }));
    await waitFor(() => expect(last(onChange)).toContain('<hr>'));
  });
});
