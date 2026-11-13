import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, json, mockApi, renderAt } from '../../../test/mockApi';

const ADMIN = {
  ...READER,
  id: '670000000000000000000002',
  name: 'Marisol Quesada',
  email: 'marisol@ejemplo.com',
  role: 'ADMIN',
};
const EDITOR = { ...ADMIN, id: '670000000000000000000003', name: 'Editor', role: 'EDITOR' };
const ACCOUNT = 'Nube-Azul-Cuatro-87';
const ARCHIVE = 'Faro-Lejano-Ocho-2026';
const FILE = 'universo-memorias-respaldo-2026-11-05-1830.tar.cifrado';

const never = { lastAt: null, daysAgo: null, staleAfterDays: 7, downloads: [] };
const recent = {
  lastAt: '2026-11-05T18:30:00.000Z',
  daysAgo: 0,
  staleAfterDays: 7,
  downloads: [
    {
      at: '2026-11-05T18:30:00.000Z',
      by: { id: ADMIN.id, name: 'Marisol Quesada' },
      ok: true,
      bytes: 3_400_000,
    },
    { at: '2026-11-04T10:00:00.000Z', by: null, ok: false, bytes: 2048 },
  ],
};
const old = { ...recent, daysAgo: 9, downloads: [] };

const download = () =>
  new Response(new Uint8Array([85, 77, 82, 69, 83, 80]), {
    status: 200,
    headers: { 'Content-Disposition': `attachment; filename="${FILE}"` },
  });

let clicked: { href: string; download: string }[];
beforeEach(() => {
  clicked = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:respaldo'), revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.getAttribute('href') ?? '', download: this.download });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function fill(
  over: Partial<{ password: string; archive: string; confirm: string; saved: boolean }> = {},
) {
  const values = { password: ACCOUNT, archive: ARCHIVE, confirm: ARCHIVE, saved: true, ...over };
  if (values.password)
    await userEvent.type(screen.getByLabelText('Tu contraseña'), values.password);
  if (values.archive)
    await userEvent.type(screen.getByLabelText('Contraseña para el archivo'), values.archive);
  if (values.confirm)
    await userEvent.type(
      screen.getByLabelText('Repite la contraseña para el archivo'),
      values.confirm,
    );
  if (values.saved)
    await userEvent.click(
      screen.getByLabelText(/Ya guardé la contraseña del archivo en un lugar seguro/),
    );
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Descargar respaldo' }));

describe('/admin/respaldo: estado e historial', () => {
  it('sin respaldos: lo avisa, explica qué es y el menú lleva «Respaldo»', async () => {
    mockApi({ 'GET /api/admin/backups': () => json(never) }, { session: ADMIN });
    renderAt('/admin/respaldo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Respaldo' })).toBeInTheDocument();
    expect(
      await screen.findByText('Todavía no hay ningún respaldo descargado desde el panel'),
    ).toBeInTheDocument();
    expect(screen.getByText('Todavía no se descargó ninguno.')).toBeInTheDocument();
    expect(screen.getByText(/Bórralo a los 90 días/)).toBeInTheDocument();
    expect(screen.getByText(/Sin la contraseña el respaldo no/)).toBeInTheDocument();
    expect(document.title).toBe('Respaldo · Administración · Universo Memorias');
    const menu = screen.getByRole('navigation', { name: 'Administración' });
    expect(within(menu).getByRole('link', { name: /Respaldo/ })).toHaveAttribute(
      'href',
      '/admin/respaldo',
    );
  });

  it('con respaldos: «hoy» en verde, y el historial con quién, estado y tamaño', async () => {
    mockApi({ 'GET /api/admin/backups': () => json(recent) }, { session: ADMIN });
    renderAt('/admin/respaldo');
    expect(await screen.findByText(/^Último respaldo: hoy/)).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Últimas descargas' });
    expect(within(list).getByText('Completo')).toBeInTheDocument();
    expect(within(list).getByText('Se cortó')).toBeInTheDocument();
    expect(within(list).getByText('Marisol Quesada')).toBeInTheDocument();
    expect(within(list).getByText('Una cuenta que ya no existe')).toBeInTheDocument();
    expect(within(list).getByText('3,2 MB')).toBeInTheDocument();
  });

  it('pasados 7 días avisa que conviene uno nuevo', async () => {
    mockApi({ 'GET /api/admin/backups': () => json(old) }, { session: ADMIN });
    renderAt('/admin/respaldo');
    expect(await screen.findByText(/^Último respaldo: hace 9 días/)).toBeInTheDocument();
    expect(screen.getByText(/conviene descargar uno nuevo/)).toBeInTheDocument();
  });

  it('un editor no la ve (ni en el menú) y un lector tampoco', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: EDITOR });
    const view = renderAt('/admin/respaldo');
    expect(await screen.findByText('No tienes permiso para ver esta página')).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Administración' });
    expect(within(menu).queryByRole('link', { name: /Respaldo/ })).toBeNull();
    view.unmount();
    mockApi({}, { session: READER });
    renderAt('/admin/respaldo');
    expect(await screen.findByText('No tienes permiso para ver esta página')).toBeInTheDocument();
  });
});

describe('/admin/respaldo: descargar', () => {
  it('valida antes de enviar: campos vacíos, largo, repetición, la casilla y el nombre propio', async () => {
    const { called } = mockApi({ 'GET /api/admin/backups': () => json(never) }, { session: ADMIN });
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');

    await submit();
    expect(await screen.findByText('Escribe tu contraseña')).toBeInTheDocument();
    expect(
      screen.getByText('Confirma que guardaste la contraseña del archivo.'),
    ).toBeInTheDocument();

    await fill({ archive: 'Corta-2026', confirm: 'Corta-2026', saved: false });
    await submit();
    expect(
      await screen.findByText('La contraseña del archivo debe tener al menos 12 caracteres.'),
    ).toBeInTheDocument();

    const archive = screen.getByLabelText('Contraseña para el archivo');
    await userEvent.clear(archive);
    await userEvent.type(archive, 'Marisol-Respaldo-26');
    const confirm = screen.getByLabelText('Repite la contraseña para el archivo');
    await userEvent.clear(confirm);
    await userEvent.type(confirm, 'Otra-Cosa-Distinta-1');
    await submit();
    expect(await screen.findByText('Las contraseñas del archivo no coinciden')).toBeInTheDocument();
    expect(
      screen.getByText('La contraseña no puede contener tu nombre ni tu correo.'),
    ).toBeInTheDocument();
    expect(called('POST /api/admin/backups')).toHaveLength(0);
  });

  it('descarga el archivo con el nombre del servidor, manda solo lo necesario y limpia el formulario', async () => {
    let status: object = never;
    const { called } = mockApi(
      {
        'GET /api/admin/backups': () => json(status),
        'POST /api/admin/backups': () => {
          status = recent;
          return download();
        },
      },
      { session: ADMIN },
    );
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');
    await fill();
    await submit();
    await waitFor(() => expect(clicked).toEqual([{ href: 'blob:respaldo', download: FILE }]));
    expect(called('POST /api/admin/backups')[0]?.body).toEqual({
      password: ACCOUNT,
      archivePassword: ARCHIVE,
      archivePasswordConfirm: ARCHIVE,
    });
    expect(await screen.findByText(/Respaldo descargado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tu contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Contraseña para el archivo')).toHaveValue('');
    // El estado se vuelve a pedir: ya aparece el respaldo nuevo.
    expect(await screen.findByText(/^Último respaldo: hoy/)).toBeInTheDocument();
  });

  it('con la contraseña incorrecta lo dice en el campo y explica qué hacer si entra con Google', async () => {
    mockApi(
      {
        'GET /api/admin/backups': () => json(never),
        'POST /api/admin/backups': () =>
          apiError('VALIDATION', 'La contraseña no es correcta.', 400),
      },
      { session: ADMIN },
    );
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');
    await fill({ password: 'Una-Que-No-Es-1' });
    await submit();
    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument();
    expect(screen.getByText('¿Entras con Google?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/olvide-mi-contrasena',
    );
    expect(clicked).toEqual([]);
  });

  it('muestra el motivo del servidor si se pasó el límite o ya hay uno en curso', async () => {
    mockApi(
      {
        'GET /api/admin/backups': () => json(never),
        'POST /api/admin/backups': () =>
          apiError(
            'RATE_LIMITED',
            'Ya se descargaron varios respaldos hace poco. Inténtalo de nuevo más tarde.',
            429,
          ),
      },
      { session: ADMIN },
    );
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');
    await fill();
    await submit();
    expect(
      await screen.findByText(
        'Ya se descargaron varios respaldos hace poco. Inténtalo de nuevo más tarde.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('¿Entras con Google?')).toBeNull();
  });
});
