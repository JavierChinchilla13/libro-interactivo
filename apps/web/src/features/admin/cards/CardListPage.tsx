import {
  CARDS_LABEL_DEFAULT,
  CARDS_LABEL_MAX,
  type AdminCard,
  type CardInputPayload,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AdminIcon } from '../../../shared/ui/adminIcons';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, EmptyState, PageHeader } from '../../../shared/ui/layout';
import { publicKeys } from '../../home/api';
import { useCardsLabel } from '../../cards/useCardsLabel';
import { booksApi, cardsApi, keys, siteApi } from '../api';
import { FormSection } from '../components/FormSection';
import { HelpTip } from '../components/HelpTip';
import { SkeletonRows } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { errorMessage } from '../errors';

/** El nombre de la sección: lo que ven las lectoras en su menú y en sus pantallas. Solo administradoras. */
function LabelForm() {
  const client = useQueryClient();
  const toast = useToast();
  const current = useCardsLabel();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? current;
  const save = useMutation({
    mutationFn: (label: string) => siteApi.update({ cardsLabel: label }),
    onSuccess: async (settings) => {
      setDraft(null);
      // El menú y los títulos de todas las pantallas toman el nombre nuevo de inmediato.
      client.setQueryData(publicKeys.site, (previous: unknown) =>
        previous && typeof previous === 'object'
          ? { ...previous, cardsLabel: settings.cardsLabel }
          : previous,
      );
      await client.invalidateQueries({ queryKey: publicKeys.site });
      toast.success('Nombre guardado');
    },
  });
  const dirty = draft !== null && draft.trim() !== current;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (dirty) save.mutate(value.trim());
  }

  return (
    <FormSection
      title="Nombre de esta sección"
      help="Así la ven las lectoras en su menú y en sus pantallas, y tú en este panel. Se guarda como texto sin formato."
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
        <TextField
          label="Nombre"
          wrapperClassName="min-w-56 flex-1"
          maxLength={CARDS_LABEL_MAX}
          value={value}
          hint={`Si lo dejas vacío vuelve a «${CARDS_LABEL_DEFAULT}».`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!dirty} loading={save.isPending}>
          Guardar nombre
        </Button>
      </form>
      {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
    </FormSection>
  );
}

const toPayload = (card: AdminCard, over: Partial<CardInputPayload> = {}): CardInputPayload => ({
  bookId: card.bookId,
  title: card.title,
  order: card.order,
  status: card.status,
  images: card.images.map((image) => ({
    publicId: image.publicId,
    ...(image.alt ? { alt: image.alt } : {}),
  })),
  ...over,
});

/**
 * Cartas con QR (solo administradoras): lista por libro con su portada, cuántas imágenes tiene, su estado y su orden.
 * Se ordenan con las flechas; archivar quita la carta de la vista de las lectoras y deja su QR sin efecto.
 */
export function CardListPage() {
  const client = useQueryClient();
  const toast = useToast();
  const label = useCardsLabel();
  const [params, setParams] = useSearchParams();
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const bookId = params.get('libro') ?? books.data?.books[0]?.id ?? '';
  const cards = useQuery({
    queryKey: keys.cards(bookId),
    queryFn: () => cardsApi.list(bookId),
    enabled: bookId !== '',
  });
  const list = cards.data?.cards ?? [];

  const refresh = () => client.invalidateQueries({ queryKey: ['admin', 'cards'] });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => cardsApi.reorder({ bookId, ids }),
    onSuccess: async () => {
      await refresh();
      toast.success('Orden guardado');
    },
  });
  const toggle = useMutation({
    mutationFn: (card: AdminCard) =>
      cardsApi.replace(
        card.id,
        toPayload(card, { status: card.status === 'published' ? 'archived' : 'published' }),
      ),
    onSuccess: async (card) => {
      await refresh();
      toast.success(card.status === 'archived' ? 'Archivada' : 'Publicada');
    },
  });

  function move(index: number, by: -1 | 1) {
    const ids = list.map((card) => card.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    const [moved] = ids.splice(index, 1);
    if (moved) ids.splice(target, 0, moved);
    reorder.mutate(ids);
  }

  const busy = reorder.isPending || toggle.isPending;
  const error = reorder.error ?? toggle.error;

  return (
    <>
      <PageHeader
        title={label}
        subtitle="Cartas con QR: imágenes que la lectora abre al escanear su código y guarda en su cuenta."
        actions={
          books.data && books.data.books.length > 0 ? (
            <Link to={`/admin/cartas/nueva?libro=${bookId}`} className="btn btn-primary">
              + Nueva
            </Link>
          ) : undefined
        }
      />
      <div className="mb-4">
        <HelpTip>
          Cada carta tiene su propio código QR (se crea y se descarga en «Códigos QR»). Una carta
          queda oculta para las lectoras hasta que la abren con su código; nadie ve cuántas hay. Tú
          las ves todas desde tu panel, en modo prueba.
        </HelpTip>
      </div>

      <div className="flex flex-col gap-5">
        <LabelForm />

        {books.isPending ? <SkeletonRows rows={3} /> : null}
        {books.isError ? <Alert>{errorMessage(books.error)}</Alert> : null}
        {books.data && books.data.books.length === 0 ? (
          <EmptyState
            icon={<AdminIcon name="card" className="size-7" />}
            title="Primero crea un libro"
            action={
              <Link to="/admin/libros/nuevo" className="btn btn-primary">
                Crear libro
              </Link>
            }
          >
            Cada carta pertenece a un libro.
          </EmptyState>
        ) : null}

        {books.data && books.data.books.length > 0 ? (
          <>
            <SelectField
              label="Libro"
              wrapperClassName="max-w-sm"
              value={bookId}
              options={books.data.books.map((book) => ({ value: book.id, label: book.title }))}
              onChange={(event) => setParams({ libro: event.target.value }, { replace: true })}
            />
            {cards.isPending ? <SkeletonRows rows={3} /> : null}
            {cards.isError ? <Alert>{errorMessage(cards.error)}</Alert> : null}
            {error ? <Alert>{errorMessage(error)}</Alert> : null}
            {cards.data && list.length === 0 ? (
              <EmptyState
                icon={<AdminIcon name="card" className="size-7" />}
                title={`Todavía no hay nada en «${label}» en este libro`}
                action={
                  <Link to={`/admin/cartas/nueva?libro=${bookId}`} className="btn btn-primary">
                    Crear la primera
                  </Link>
                }
              >
                Sube una o varias imágenes con un título y luego crea su código QR.
              </EmptyState>
            ) : null}
            {list.length > 0 ? (
              <ul className="flex flex-col gap-3" aria-label={`Elementos de «${label}»`}>
                {list.map((card, index) => {
                  const cover = card.images[0];
                  return (
                    <li key={card.id}>
                      <Card
                        as="article"
                        className="flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          {cover ? (
                            <img
                              src={cover.url}
                              alt=""
                              width={64}
                              height={88}
                              className="h-22 w-16 shrink-0 rounded-token object-cover outline outline-1 -outline-offset-1 outline-white/10"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="font-medium text-balance [overflow-wrap:anywhere]">
                              {card.title}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                              <StatusBadge
                                status={card.status === 'published' ? 'published' : 'archived'}
                                label={card.status === 'published' ? 'Publicada' : 'Archivada'}
                              />
                              <span className="tabular-nums">
                                {card.images.length === 1
                                  ? '1 imagen'
                                  : `${card.images.length} imágenes`}
                              </span>
                              <span className="tabular-nums">· Posición {index + 1}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            aria-label={`Subir «${card.title}» una posición`}
                            disabled={index === 0 || busy}
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="secondary"
                            aria-label={`Bajar «${card.title}» una posición`}
                            disabled={index === list.length - 1 || busy}
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </Button>
                          <Link to={`/admin/cartas/${card.id}`} className="btn btn-secondary">
                            Editar<span className="sr-only"> «{card.title}»</span>
                          </Link>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            loading={toggle.isPending && toggle.variables?.id === card.id}
                            onClick={() => toggle.mutate(card)}
                          >
                            {card.status === 'published' ? 'Archivar' : 'Publicar'}
                            <span className="sr-only"> «{card.title}»</span>
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
