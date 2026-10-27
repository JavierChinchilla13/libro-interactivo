import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime } from '../../../shared/lib/dates';
import { Button, SelectField } from '../../../shared/ui/controls';
import { Alert, Card } from '../../../shared/ui/layout';
import { keys, messagesApi } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { ListPage } from '../components/ListPage';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { errorMessage } from '../errors';

const EMPTY_TITLE: Record<string, string> = {
  unhandled: 'No hay mensajes sin atender',
  handled: 'Todavía no hay mensajes atendidos',
  all: 'Todavía no hay mensajes',
};

/** Mensajes de contacto (solo administradoras): bandeja con «atendido». */
export function MessagesPage() {
  const client = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('unhandled');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...keys.messages, { status, page }],
    queryFn: () => messagesApi.list({ status, page: String(page) }),
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  // Los mensajes y los números del inicio (estadísticas) se actualizan juntos.
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.messages }),
      client.invalidateQueries({ queryKey: keys.stats }),
    ]);
  const toggle = useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) =>
      messagesApi.setHandled(id, handled),
    onSuccess: async (_result, variables) => {
      await refresh();
      toast.success(variables.handled ? 'Marcado como atendido' : 'Marcado como sin atender');
    },
  });
  const confirm = useConfirm();
  const remove = useMutation({
    mutationFn: messagesApi.remove,
    onSuccess: async () => {
      await refresh();
      toast.success('Mensaje eliminado');
    },
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const actionError = toggle.error ?? remove.error;

  return (
    <ListPage
      title="Mensajes"
      subtitle={
        data
          ? `${data.unhandled} sin atender. Responde desde tu correo; aquí solo llevas el control.`
          : 'Lo que escriben desde el formulario del sitio.'
      }
      toolbar={
        <SelectField
          label="Mostrar"
          value={status}
          options={[
            { value: 'unhandled', label: 'Sin atender' },
            { value: 'handled', label: 'Atendidos' },
            { value: 'all', label: 'Todos' },
          ]}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
        />
      }
      state={list}
      count={data?.messages.length}
      empty={{
        icon: 'mail',
        title: EMPTY_TITLE[status] ?? 'No hay mensajes en esta bandeja',
        text: 'Si el guardado está apagado en «Contacto del sitio», los mensajes solo llegan al correo.',
      }}
      footer={
        data && pages > 1 ? (
          <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <p className="text-sm text-muted">
              Página {page} de {pages}
            </p>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </nav>
        ) : null
      }
    >
      {actionError ? (
        <div className="mb-3">
          <Alert>{errorMessage(actionError)}</Alert>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Mensajes">
        {(data?.messages ?? []).map((message) => (
          <li key={message.id}>
            <Card as="article" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 font-medium">
                  {message.name}{' '}
                  <a href={`mailto:${message.email}`} className="text-sm font-normal underline">
                    {message.email}
                  </a>
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <StatusBadge
                    status={message.handled ? 'read' : 'unread'}
                    label={message.handled ? 'Atendido' : 'Sin atender'}
                  />
                  <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
                    {new Date(message.createdAt).toLocaleString('es', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </p>
              </div>
              {/* Texto plano: se muestra tal cual, nunca como HTML. */}
              <p className="whitespace-pre-wrap break-words text-sm">{message.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={toggle.isPending && toggle.variables?.id === message.id}
                  onClick={() => toggle.mutate({ id: message.id, handled: !message.handled })}
                >
                  {message.handled ? 'Marcar sin atender' : 'Marcar atendido'}
                </Button>
                <Button
                  variant="danger-outline"
                  loading={remove.isPending && remove.variables === message.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: '¿Eliminar este mensaje?',
                      message: 'Se borra para siempre.',
                      confirmLabel: 'Eliminar mensaje',
                      tone: 'danger',
                    });
                    if (ok) remove.mutate(message.id);
                  }}
                >
                  Eliminar
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </ListPage>
  );
}
