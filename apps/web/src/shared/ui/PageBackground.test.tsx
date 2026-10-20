import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const site = (background?: unknown) => ({
  universe: { introHtml: '', ...(background ? { background } : {}) },
  author: { bioHtml: '' },
  social: [],
  lockMessage: 'Bloqueado',
});

describe('PageBackground', () => {
  it('sin imagen no pinta nada y deja el color liso', async () => {
    mockApi({ 'GET /api/site': () => json(site()) });
    const { container } = renderAt('/contacto');
    await screen.findByRole('heading', { name: /contacto/i });
    expect(container.querySelector('.page-bg')).toBeNull();
    expect(document.documentElement.dataset['pageBg']).toBeUndefined();
  });

  it('con imagen pone una capa decorativa fija con srcset y prioridad baja', async () => {
    mockApi({
      'GET /api/site': () =>
        json(
          site({
            provider: 'cloudinary',
            publicId: 'libro/fondo',
            url: 'https://res.cloudinary.com/demo/image/upload/libro/fondo',
            width: 2560,
            height: 2560,
            alt: '',
            deliveryType: 'upload',
          }),
        ),
    });
    const { container } = renderAt('/contacto');
    await waitFor(() => expect(container.querySelector('.page-bg')).not.toBeNull());
    const layer = container.querySelector('.page-bg') as HTMLElement;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const img = layer.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('srcset')).toContain('w_828');
    expect(img.getAttribute('srcset')).toContain('w_1920');
    expect(img.getAttribute('fetchpriority')).toBe('low');
    expect(img.getAttribute('alt')).toBe('');
    // Mientras la pintura no carga, las bandas no cambian; al cargar, se aclaran.
    expect(document.documentElement.dataset['pageBg']).toBeUndefined();
    fireEvent.load(img);
    await waitFor(() => expect(document.documentElement.dataset['pageBg']).toBe(''));
    expect(layer).toHaveAttribute('data-loaded');
  });
});
