import { LEGAL_VERSION } from '@libro/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '../../test/mockApi';
import { COOKIE_NOTICE_KEY } from './CookieNotice';

beforeEach(() => {
  window.localStorage.clear();
  mockApi({}, { session: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const PAGES = [
  { path: '/privacidad', title: 'Política de privacidad' },
  { path: '/terminos', title: 'Términos de uso' },
  { path: '/cookies', title: 'Política de cookies' },
] as const;

describe('páginas legales', () => {
  it.each(PAGES)(
    '$path carga con un solo titular y el cartel de borrador',
    async ({ path, title }) => {
      renderAt(path);
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByText('Borrador pendiente de revisión legal')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(LEGAL_VERSION))).toBeInTheDocument();
      // Lo que falta se ve marcado; nada se presenta como definitivo.
      expect(screen.getAllByText(/\[PLACEHOLDER/).length).toBeGreaterThan(0);
    },
  );

  it.each(PAGES)('$path enlaza a las otras dos páginas legales', async ({ path, title }) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1, name: title });
    const index = screen.getByRole('navigation', { name: 'Textos legales' });
    expect(within(index).getAllByRole('link')).toHaveLength(3);
    expect(within(index).getByRole('link', { current: 'page' })).toHaveAttribute('href', path);
  });

  it('la privacidad dice la edad mínima, la autorización y que no hay verificación', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    expect(screen.getAllByText(/16 años o más/).length).toBeGreaterThan(0);
    expect(screen.getByText(/no verificamos tu edad/i)).toBeInTheDocument();
    expect(screen.getByText(/no los vendemos/i)).toBeInTheDocument();
  });

  it('la privacidad lista a los proveedores que tratan datos y cómo pedir el borrado', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    for (const name of [
      'Cloudflare',
      'Render',
      'MongoDB Atlas',
      'Cloudinary',
      'Resend',
      'Google Identity',
    ]) {
      expect(terms).toContain(name);
    }
    expect(screen.getByRole('link', { name: /Panel › Cuenta/ })).toHaveAttribute(
      'href',
      '/panel/cuenta',
    );
  });

  it('la privacidad separa lo que da la titular [PLACEHOLDER] de lo que se propone [PROPUESTA]', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const article = screen.getByRole('article');
    expect(within(article).getAllByText(/^\[PLACEHOLDER: /).length).toBeGreaterThan(3);
    expect(within(article).getAllByText(/^\[PROPUESTA: /).length).toBeGreaterThan(3);
    // La leyenda del cartel explica las dos etiquetas.
    const note = screen.getByRole('note');
    expect(within(note).getByText('[PLACEHOLDER]')).toBeInTheDocument();
    expect(within(note).getByText('[PROPUESTA]')).toBeInTheDocument();
  });

  it('la privacidad tiene la sección de datos de Google con lo que se recibe y lo que no se hace', async () => {
    renderAt('/privacidad');
    const heading = await screen.findByRole('heading', { name: /Datos que vienen de Google/ });
    const section = heading.closest('section') as HTMLElement;
    expect(
      within(section).getByText(/correo, tu nombre y si ese correo está verificado/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/No vendemos esa información, no la usamos para publicidad/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/El uso de la información que recibimos de Google se limita/),
    ).toBeInTheDocument();
    // No se afirma lo que el código no hace: el identificador de Google no se guarda.
    expect(section.textContent).toMatch(/No guardamos .* el identificador de tu cuenta de Google/);
  });

  it.each(PAGES)(
    '$path: el índice enlaza a cada apartado, que existe y tiene su titular',
    async ({ path, title }) => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1, name: title });
      const toc = screen.getByRole('navigation', { name: 'En esta página' });
      const links = within(toc).getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(5);
      for (const anchor of links) {
        const id = anchor.getAttribute('href')?.slice(1) ?? '';
        const section = document.getElementById(id);
        expect(section, id).not.toBeNull();
        expect(section?.querySelector('h2')).not.toBeNull();
      }
    },
  );

  it.each(PAGES)('$path: sin rayas largas ni cajas de más en el texto', async ({ path, title }) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1, name: title });
    const article = screen.getByRole('article');
    expect(article.textContent).not.toMatch(/[—–]/);
    // Una sola franja de aviso: no hay otras alertas dentro del texto.
    expect(within(article).queryAllByRole('alert')).toHaveLength(0);
    expect(within(article).queryAllByRole('status')).toHaveLength(0);
  });

  it('las cookies declaran la sesión como única cookie y el script de Google bajo demanda', async () => {
    renderAt('/cookies');
    await screen.findByRole('heading', { level: 1, name: 'Política de cookies' });
    const names = screen.getAllByRole('term').map((node) => node.textContent);
    // Solo las cookies de sesión y su pista; el resto son claves del almacenamiento del navegador.
    expect(names.slice(0, 3)).toEqual(['libro_at', 'libro_rt', 'libro_s']);
    expect(names).toContain('libro_cookie_notice');
    const main = screen.getByRole('main');
    expect(within(main).getByText(/No usamos analítica ni publicidad/)).toBeInTheDocument();
    expect(within(main).getByText(/no se carga hasta que tocas ese botón/)).toBeInTheDocument();
  });

  it('el pie del sitio enlaza a las tres', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('link', { name: 'Privacidad' })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    expect(within(legal).getByRole('link', { name: 'Términos' })).toHaveAttribute(
      'href',
      '/terminos',
    );
    expect(within(legal).getByRole('link', { name: 'Cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
  });
});

describe('aviso de cookies', () => {
  it('se muestra la primera vez, enlaza a la política y se recuerda al cerrarlo', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt('/estado');
    const notice = await screen.findByRole('region', { name: 'Aviso de cookies' });
    expect(within(notice).getByText(/solo cookies necesarias/)).toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'Política de cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
    await user.click(within(notice).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).toBeNull();
    expect(window.localStorage.getItem(COOKIE_NOTICE_KEY)).toBe('1');
    unmount();

    // Otra visita: ya no vuelve a salir.
    renderAt('/estado');
    await screen.findByRole('heading', { level: 1, name: 'Estado del sistema' });
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).toBeNull();
  });

  it('sin almacenamiento disponible sigue funcionando y se oculta mientras la página siga abierta', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    try {
      renderAt('/estado');
      const notice = await screen.findByRole('region', { name: 'Aviso de cookies' });
      await user.click(within(notice).getByRole('button', { name: 'Entendido' }));
      expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).toBeNull();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
