import {
  reviewInputSchema,
  type AdminReview,
  type ReviewInputPayload,
  type ReviewStatus,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button, SelectField, TextAreaField, TextField } from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, keys, reviewsApi } from '../api';
import { errorMessage, fieldErrors } from '../errors';

const STATUS_LABEL: Record<ReviewStatus, string> = { published: 'Publicada', hidden: 'Oculta' };

/** Reseñas de lectores: las carga la autora y decide cuáles se muestran. */
export function ReviewListPage() {
  const reviews = useQuery({ queryKey: keys.reviews, queryFn: () => reviewsApi.list() });
  return (
    <>
      <PageHeader
        title="Reseñas"
        subtitle="Comentarios de lectores. Solo se muestran en la página principal las que estén publicadas."
        actions={
          <Link to="/admin/resenas/nueva" className="btn btn-primary">
            + Nueva reseña
          </Link>
        }
      />
      {reviews.isPending ? <Loading /> : null}
      {reviews.isError ? <Alert>{errorMessage(reviews.error)}</Alert> : null}
      {reviews.data && reviews.data.reviews.length === 0 ? (
        <EmptyState title="Todavía no hay reseñas">Carga la primera con «Nueva reseña».</EmptyState>
      ) : null}
      {reviews.data && reviews.data.reviews.length > 0 ? (
        <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  #
                </th>
                <th scope="col" className="px-4 py-3">
                  Reseña
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reviews.data.reviews.map((review) => (
                <tr key={review.id} className="border-t border-border">
                  <td className="px-4 py-3 text-muted">{review.order}</td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-2">{review.text}</p>
                    <p className="text-xs text-muted">
                      — {review.authorName}
                      {review.rating ? ` · ${'★'.repeat(review.rating)}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={review.status === 'published' ? 'success' : 'neutral'}>
                      {STATUS_LABEL[review.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/resenas/${review.id}`} className="underline">
                      Editar<span className="sr-only"> la reseña de {review.authorName}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

interface ReviewForm {
  text: string;
  authorName: string;
  source: string;
  rating: string;
  bookId: string;
  order: string;
  status: ReviewStatus;
}

const emptyForm = (order: number): ReviewForm => ({
  text: '',
  authorName: '',
  source: '',
  rating: '',
  bookId: '',
  order: String(order),
  status: 'published',
});

const formFromReview = (review: AdminReview): ReviewForm => ({
  text: review.text,
  authorName: review.authorName,
  source: review.source ?? '',
  rating: review.rating ? String(review.rating) : '',
  bookId: review.bookId ?? '',
  order: String(review.order),
  status: review.status,
});

/** Lo vacío no viaja (el servidor lo quita al reemplazar). */
export function reviewPayload(form: ReviewForm): ReviewInputPayload {
  return {
    text: form.text.trim(),
    authorName: form.authorName.trim(),
    ...(form.source.trim() ? { source: form.source.trim() } : {}),
    ...(form.rating ? { rating: Number(form.rating) } : {}),
    ...(form.bookId ? { bookId: form.bookId } : {}),
    order: Number(form.order) || 1,
    status: form.status,
  };
}

/** Carga la reseña (o la posición siguiente) y entrega el formulario con su valor inicial. */
export function ReviewFormPage() {
  const { reviewId } = useParams();
  const editing = reviewId !== undefined;
  const review = useQuery({
    queryKey: keys.review(reviewId ?? 'nueva'),
    queryFn: () => reviewsApi.get(reviewId ?? ''),
    enabled: editing,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const all = useQuery({
    queryKey: keys.reviews,
    queryFn: () => reviewsApi.list(),
    enabled: !editing,
  });

  if (editing) {
    if (review.isError) return <Alert>{errorMessage(review.error)}</Alert>;
    if (!review.data) return <Loading />;
    return (
      <ReviewFormView
        key={review.data.id}
        reviewId={reviewId}
        initial={formFromReview(review.data)}
      />
    );
  }
  if (all.isError) return <Alert>{errorMessage(all.error)}</Alert>;
  if (!all.data) return <Loading />;
  return <ReviewFormView key="nueva" initial={emptyForm(all.data.reviews.length + 1)} />;
}

function ReviewFormView({ reviewId, initial }: { reviewId?: string; initial: ReviewForm }) {
  const editing = reviewId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const location = useLocation();
  const [form, setForm] = useState<ReviewForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(
    (location.state as { created?: boolean } | null)?.created === true,
  );
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const save = useMutation({
    mutationFn: (payload: ReviewInputPayload) =>
      editing ? reviewsApi.replace(reviewId, payload) : reviewsApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.reviews });
      setSaved(true);
      if (!editing) {
        void navigate(`/admin/resenas/${result.id}`, { replace: true, state: { created: true } });
      }
    },
  });
  const set = <K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = reviewPayload(form);
    const parsed = reviewInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(payload);
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader
        title={editing ? `Reseña de ${form.authorName || '…'}` : 'Nueva reseña'}
        actions={
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        }
      />
      {saved ? (
        <div className="mb-4">
          <Alert tone="success" title="Cambios guardados" />
        </div>
      ) : null}
      {save.isError ? (
        <div className="mb-4">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      ) : null}
      <Card className="flex flex-col gap-4">
        <TextAreaField
          label="Reseña"
          required
          rows={4}
          maxLength={1000}
          hint="Texto plano, sin formato."
          value={form.text}
          error={errors['text']}
          onChange={(event) => set('text', event.target.value)}
        />
        <TextField
          label="Nombre del lector"
          required
          maxLength={80}
          value={form.authorName}
          error={errors['authorName']}
          onChange={(event) => set('authorName', event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Dónde se publicó (opcional)"
            maxLength={120}
            value={form.source}
            error={errors['source']}
            onChange={(event) => set('source', event.target.value)}
          />
          <SelectField
            label="Calificación (opcional)"
            value={form.rating}
            placeholder="Sin calificación"
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} de 5` }))}
            error={errors['rating']}
            onChange={(event) => set('rating', event.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Libro"
            value={form.bookId}
            placeholder="Toda la saga"
            options={(books.data?.books ?? []).map((book) => ({
              value: book.id,
              label: book.title,
            }))}
            onChange={(event) => set('bookId', event.target.value)}
          />
          <TextField
            label="Posición"
            type="number"
            min={1}
            value={form.order}
            error={errors['order']}
            onChange={(event) => set('order', event.target.value)}
          />
          <SelectField
            label="Estado"
            value={form.status}
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            onChange={(event) => set('status', event.target.value as ReviewStatus)}
          />
        </div>
      </Card>
    </form>
  );
}
