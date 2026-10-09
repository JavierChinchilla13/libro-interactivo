import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime } from '../../../shared/lib/dates';
import { Button, SelectField } from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { keys, messagesApi } from '../api';
import { errorMessage } from '../errors';

/** Mensajes de contacto (solo administradoras): bandeja con «atendido». */
export function MessagesPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState('unhandled');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...keys.messages, { status, page }],
    queryFn: () => messagesApi.list({ status, page: String(page) }),
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  const refresh = () => client.invalidateQueries({ queryKey: keys.messages });
  const toggle = useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) =>
      messagesApi.setHandled(id, handled),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: messagesApi.remove, onSuccess: refresh });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const error = list.error ?? toggle.error ?? remove.error;

  return (
    <>
      <PageHeader
        title="Mensajes de contacto"
        subtitle={
          data
            ? `${data.unhandled} sin atender. Responde desde tu correo; aquí solo llevas el control.`
            : 'Lo que escriben desde el formulario del sitio.'
        }
      />
      <div className="flex flex-col gap-5">
        <SelectField
          label="Mostrar"
          wrapperClassName="max-w-xs"
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
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        {list.isPending ? <Loading /> : null}
        {data && data.messages.length === 0 ? (
          <EmptyState title="No hay mensajes en esta bandeja">
            Si el guardado está apagado en Ajustes del sitio, los mensajes solo llegan al correo.
          </EmptyState>
        ) : null}
        {data && data.messages.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Mensajes">
            {data.messages.map((message) => (
              <li key={message.id}>
                <Card as="article" className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {message.name}{' '}
                      <a href={`mailto:${message.email}`} className="text-sm font-normal underline">
                        {message.email}
                      </a>
                    </p>
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Badge tone={message.handled ? 'success' : 'warning'}>
                        {message.handled ? 'Atendido' : 'Sin atender'}
                      </Badge>
                      {formatDateTime(message.createdAt)}
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
                      variant="danger"
                      loading={remove.isPending && remove.variables === message.id}
                      onClick={() => {
                        if (window.confirm('El mensaje se borra para siempre. ¿Eliminar?'))
                          remove.mutate(message.id);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
        {data && pages > 1 ? (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
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
        ) : null}
      </div>
    </>
  );
}
