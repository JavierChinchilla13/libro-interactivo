import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';

/** Etiqueta de un campo obligatorio: el texto y, si lo lleva, el asterisco. */
const req = (text: string) => new RegExp(`^${text}( \\*)?$`);

/** El botón «Mostrar / Ocultar» que controla el campo con esa etiqueta. */
function toggleFor(input: HTMLElement): HTMLElement {
  const button = screen
    .getAllByRole('button', { name: /^(Mostrar|Ocultar)$/ })
    .find((candidate) => candidate.getAttribute('aria-controls') === input.id);
  if (!button) throw new Error(`Sin botón «Mostrar» para ${input.id}`);
  return button;
}

async function expectToggles(label: string | RegExp, autoComplete: string) {
  const input = screen.getByLabelText(label, { selector: 'input' });
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveAttribute('autocomplete', autoComplete);
  const button = toggleFor(input);
  expect(button).toHaveAccessibleName('Mostrar');
  expect(button).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(button);
  expect(input).toHaveAttribute('type', 'text');
  expect(button).toHaveAccessibleName('Ocultar');
  expect(button).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(button);
  expect(input).toHaveAttribute('type', 'password');
}

describe('PasswordField en las pantallas de acceso (sin cambios tras moverlo a shared/ui)', () => {
  it('ingresar: la contraseña empieza oculta y el botón la alterna', async () => {
    mockApi({}, { session: null });
    renderAt('/ingresar');
    await screen.findByRole('heading', { name: 'Ingresar' });
    await expectToggles(req('Contraseña'), 'current-password');
  });

  it('registro: igual, con su medidor de seguridad', async () => {
    mockApi({}, { session: null });
    renderAt('/registro');
    await screen.findByLabelText(req('Contraseña'), { selector: 'input' });
    await expectToggles(req('Contraseña'), 'new-password');
    expect(screen.getByTestId('password-meter')).toBeInTheDocument();
  });

  it('restablecer: las dos contraseñas nuevas se alternan por separado', async () => {
    mockApi({}, { session: null });
    renderAt(`/restablecer/${'a'.repeat(43)}`);
    await screen.findByLabelText(req('Nueva contraseña'), { selector: 'input' });
    await expectToggles(req('Nueva contraseña'), 'new-password');
    await expectToggles(req('Repite la nueva contraseña'), 'new-password');
  });
});

describe('PasswordField en /admin/respaldo', () => {
  const ADMIN = {
    id: '670000000000000000000002',
    name: 'Marisol Quesada',
    email: 'marisol@ejemplo.com',
    role: 'ADMIN',
  };
  const never = { lastAt: null, daysAgo: null, staleAfterDays: 7, downloads: [] };
  const LABELS = [
    ['Tu contraseña', 'current-password'],
    ['Contraseña para el archivo', 'new-password'],
    ['Repite la contraseña para el archivo', 'new-password'],
  ] as const;

  it('las tres empiezan ocultas, cada botón alterna la suya y conservan ayuda y autocompletado', async () => {
    mockApi({ 'GET /api/admin/backups': () => json(never) }, { session: ADMIN });
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');
    for (const [label, autoComplete] of LABELS) await expectToggles(label, autoComplete);
    expect(screen.getByText('La de tu cuenta, para confirmar que eres tú.')).toBeInTheDocument();
    expect(
      screen.getByText(/Al menos 12 caracteres, distinta de la de tu cuenta/),
    ).toBeInTheDocument();
  });

  it('al enviar el formulario las tres vuelven a ocultarse (también si la validación falla)', async () => {
    mockApi({ 'GET /api/admin/backups': () => json(never) }, { session: ADMIN });
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');
    const inputs = LABELS.map(([label]) => screen.getByLabelText(label, { selector: 'input' }));
    for (const input of inputs) {
      await userEvent.type(input, 'Algo-Escrito-123');
      await userEvent.click(toggleFor(input));
      expect(input).toHaveAttribute('type', 'text');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Descargar respaldo' }));
    // Falta la casilla: no se envía nada, pero igual se ocultan.
    expect(
      await screen.findByText('Confirma que guardaste la contraseña del archivo.'),
    ).toBeInTheDocument();
    for (const input of inputs) {
      expect(input).toHaveAttribute('type', 'password');
      expect(toggleFor(input)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('mientras se prepara no se pueden mostrar y al terminar (aunque falle) siguen ocultas', async () => {
    let answer: (response: Response) => void = () => undefined;
    mockApi(
      {
        'GET /api/admin/backups': () => json(never),
        'POST /api/admin/backups': () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/respaldo');
    await screen.findByText('Todavía no se descargó ninguno.');
    const inputs = LABELS.map(([label]) => screen.getByLabelText(label, { selector: 'input' }));
    await userEvent.type(inputs[0]!, 'Una-Que-No-Es-1');
    await userEvent.type(inputs[1]!, 'Faro-Lejano-Ocho-2026');
    await userEvent.type(inputs[2]!, 'Faro-Lejano-Ocho-2026');
    await userEvent.click(toggleFor(inputs[1]!));
    expect(inputs[1]).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByLabelText(/Ya guardé la contraseña del archivo/));
    await userEvent.click(screen.getByRole('button', { name: 'Descargar respaldo' }));

    // Preparando: todas ocultas y sin poder mostrarlas.
    expect(await screen.findByText(/Preparando el respaldo/)).toBeInTheDocument();
    for (const input of inputs) {
      expect(input).toHaveAttribute('type', 'password');
      expect(toggleFor(input)).toBeDisabled();
    }

    answer(json({ error: { code: 'VALIDATION', message: 'La contraseña no es correcta.' } }, 400));
    expect(await screen.findByText('¿Entras con Google?')).toBeInTheDocument();
    for (const input of inputs) {
      expect(input).toHaveAttribute('type', 'password');
      expect(toggleFor(input)).toBeEnabled();
      expect(toggleFor(input)).toHaveAccessibleName('Mostrar');
    }
  });
});
