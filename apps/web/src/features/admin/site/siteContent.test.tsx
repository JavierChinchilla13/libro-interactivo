import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const EDITOR = {
  id: '670000000000000000000002',
  name: 'Editora',
  email: 'e@ejemplo.com',
  role: 'EDITOR',
};
const settings = {
  welcome: { enabled: false, bodyHtml: '', showMode: 'every_login' },
  universe: { headline: '[PLACEHOLDER] Frase', introHtml: '<p>[PLACEHOLDER] Intro</p>' },
  author: {
    name: '[PLACEHOLDER] Autora',
    bioHtml: '<p>Bio</p>',
    publicEmail: 'autora@ejemplo.com',
  },
  social: [{ label: 'Instagram', url: 'https://instagram.com/placeholder' }],
  lock: { message: '[PLACEHOLDER] Sigue leyendo' },
};

function setup(over: Record<string, unknown> = {}) {
  return mockApi(
    {
      'GET /api/admin/site-settings': () => json({ ...settings, ...over }),
      'PATCH /api/admin/site-settings': ({ body }) => json({ ...settings, ...(body as object) }),
    },
    { session: EDITOR },
  );
}

describe('panel: portada y autora', () => {
  it('carga lo guardado y aparece en el menú del panel', async () => {
    setup();
    renderAt('/admin/sitio');
    expect(await screen.findByLabelText('Frase principal del sitio')).toHaveValue(
      '[PLACEHOLDER] Frase',
    );
    expect(screen.getByLabelText('Nombre')).toHaveValue('[PLACEHOLDER] Autora');
    expect(screen.getByLabelText('Correo que se muestra al público')).toHaveValue(
      'autora@ejemplo.com',
    );
    expect(screen.getByLabelText('Red 1')).toHaveValue('Instagram');
    expect(screen.getByLabelText('Enlace 1')).toHaveValue('https://instagram.com/placeholder');
    expect(
      within(screen.getByRole('navigation', { name: 'Administración' })).getByRole('link', {
        name: 'Portada y autora',
      }),
    ).toBeInTheDocument();
  });

  it('guarda las cuatro secciones, sin la bienvenida, y confirma', async () => {
    const { called } = setup();
    renderAt('/admin/sitio');
    const headline = await screen.findByLabelText('Frase principal del sitio');
    await userEvent.clear(headline);
    await userEvent.type(headline, 'Nueva frase');
    await userEvent.click(screen.getByRole('button', { name: '+ Agregar red' }));
    await userEvent.type(screen.getByLabelText('Red 2'), 'TikTok');
    await userEvent.type(screen.getByLabelText('Enlace 2'), 'https://tiktok.com/@placeholder');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    const [call] = called('PATCH /api/admin/site-settings');
    const body = call?.body as Record<string, Record<string, unknown>>;
    expect(Object.keys(body).sort()).toEqual(['author', 'lock', 'social', 'universe']);
    expect(body['universe']?.['headline']).toBe('Nueva frase');
    expect(body['social']).toEqual([
      { label: 'Instagram', url: 'https://instagram.com/placeholder' },
      { label: 'TikTok', url: 'https://tiktok.com/@placeholder' },
    ]);
  });

  it('rechaza en el navegador un enlace que no es http(s) y no llama al API', async () => {
    const { called } = setup();
    renderAt('/admin/sitio');
    const link = await screen.findByLabelText('Enlace 1');
    await userEvent.clear(link);
    await userEvent.type(link, 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/http:\/\/ o https:\/\//)).toBeInTheDocument();
    expect(called('PATCH /api/admin/site-settings')).toHaveLength(0);
  });

  it('un campo opcional vaciado viaja sin valor (el servidor lo quita) y se puede quitar una red', async () => {
    const { called } = setup();
    renderAt('/admin/sitio');
    await userEvent.clear(await screen.findByLabelText('Nombre'));
    await userEvent.clear(screen.getByLabelText('Correo que se muestra al público'));
    await userEvent.click(screen.getByRole('button', { name: /Quitar.*red 1/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Cambios guardados');
    const body = called('PATCH /api/admin/site-settings')[0]?.body as Record<
      string,
      Record<string, unknown>
    >;
    expect(body['author']).not.toHaveProperty('name');
    expect(body['author']).not.toHaveProperty('publicEmail');
    expect(body['social']).toEqual([]);
  });
});
