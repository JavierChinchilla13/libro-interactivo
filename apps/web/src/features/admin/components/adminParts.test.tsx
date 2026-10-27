import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';
import { HelpTip } from './HelpTip';
import { SaveBar } from './SaveBar';
import { StatusBadge } from './StatusBadge';
import { ToastProvider, useToast } from './Toast';
import { useUnsavedChanges } from './useUnsavedChanges';

function ConfirmProbe({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({
          title: '¿Archivar el quiz?',
          message: 'Se quitará de la web.',
          confirmLabel: 'Archivar',
          tone: 'danger',
        }).then(onResult)
      }
    >
      Abrir
    </button>
  );
}

describe('ConfirmDialog', () => {
  it('muestra el efecto y resuelve true al confirmar con el verbo del botón', async () => {
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <ConfirmProbe onResult={onResult} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog', { name: '¿Archivar el quiz?' })).toBeInTheDocument();
    expect(screen.getByText('Se quitará de la web.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelar resuelve false y no deja el cuadro abierto', async () => {
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <ConfirmProbe onResult={onResult} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onResult).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  function Probe() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast.success('Guardado')}>
          Ok
        </button>
        <button type="button" onClick={() => toast.error('No se pudo guardar')}>
          Falla
        </button>
      </>
    );
  }

  it('anuncia «Guardado» en la región de avisos y se va solo a los 4 segundos', async () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ok' }));
    expect(screen.getByRole('region', { name: 'Avisos' })).toHaveTextContent('Guardado');
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText('Guardado')).toBeNull();
  });

  it('un error dura más y se puede cerrar a mano', async () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Falla' }));
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText('No se pudo guardar')).toBeNull();
  });
});

describe('SaveBar', () => {
  it('sin cambios dice «Todo guardado» y no deja guardar; con cambios avisa y guarda', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<SaveBar dirty={false} onSave={onSave} />);
    expect(screen.getByRole('status')).toHaveTextContent('Todo guardado');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    rerender(<SaveBar dirty onSave={onSave} onDiscard={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tienes cambios sin guardar');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeEnabled();
  });

  it('guardando bloquea el botón; un error se anuncia como alerta; un motivo lo deshabilita', () => {
    const { rerender } = render(<SaveBar dirty saving onSave={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    rerender(
      <SaveBar dirty error="No pudimos guardar. Revisa tu conexión." onSave={() => undefined} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos guardar');
    rerender(<SaveBar dirty disabledReason="Falta el nombre." onSave={() => undefined} />);
    expect(screen.getByText('Falta el nombre.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });
});

describe('piezas pequeñas', () => {
  it('StatusBadge pone texto además de color', () => {
    render(<StatusBadge status="changes" />);
    expect(screen.getByText('Cambios sin publicar')).toBeInTheDocument();
  });

  it('HelpTip está cerrada y se abre con «¿Qué es esto?»', async () => {
    render(<HelpTip>Un código por quiz.</HelpTip>);
    const details = screen.getByText('¿Qué es esto?').closest('details');
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(screen.getByText('¿Qué es esto?'));
    expect(details).toHaveAttribute('open');
  });
});

describe('useUnsavedChanges', () => {
  function Editor({ dirty }: { dirty: boolean }) {
    useUnsavedChanges(dirty);
    return <Link to="/otra">Ir a otra</Link>;
  }
  function renderEditor(dirty: boolean) {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <ConfirmProvider>
              <Editor dirty={dirty} />
            </ConfirmProvider>
          ),
        },
        { path: '/otra', element: <p>Otra pantalla</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  it('sin cambios deja salir sin preguntar', async () => {
    renderEditor(false);
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument();
  });

  it('con cambios pregunta; «Seguir editando» se queda y «Salir sin guardar» navega', async () => {
    const router = renderEditor(true);
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    expect(
      await screen.findByRole('dialog', { name: 'Hay cambios sin guardar' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument();
  });

  it('avisa también al cerrar o recargar la pestaña', () => {
    renderEditor(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
