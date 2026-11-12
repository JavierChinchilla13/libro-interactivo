import {
  CARD_IMAGES,
  CARD_IMAGE_LIMITS,
  cardInputSchema,
  type AdminCard,
  type CardInputPayload,
  type CardStatus,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Badge, Card, PageHeader } from '../../../shared/ui/layout';
import { useCardsLabel } from '../../cards/useCardsLabel';
import { booksApi, cardsApi, keys } from '../api';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { SkeletonRows } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { errorMessage, fieldErrors } from '../errors';
import { cardImageProblem, uploadCardImage } from '../uploads';

/** Una imagen en el formulario: ya subida a Cloudinary, con su texto alternativo opcional. */
interface FormImage {
  publicId: string;
  alt: string;
  previewUrl: string;
}

interface CardForm {
  bookId: string;
  title: string;
  status: CardStatus;
  order: number;
  images: FormImage[];
}

const STATUS_OPTIONS = [
  { value: 'published', label: 'Publicada: se abre con su QR' },
  { value: 'archived', label: 'Archivada: deja de verse y su QR deja de abrirla' },
];

const formFromCard = (card: AdminCard): CardForm => ({
  bookId: card.bookId,
  title: card.title,
  status: card.status,
  order: card.order,
  images: card.images.map((image) => ({
    publicId: image.publicId,
    alt: image.alt ?? '',
    previewUrl: image.url,
  })),
});

const toPayload = (form: CardForm): CardInputPayload => ({
  bookId: form.bookId,
  title: form.title,
  order: form.order,
  status: form.status,
  images: form.images.map((image) => ({
    publicId: image.publicId,
    ...(image.alt.trim() ? { alt: image.alt.trim() } : {}),
  })),
});

/** Carga la carta (o prepara una nueva del libro pedido) y entrega el formulario con su valor inicial. */
export function CardFormPage() {
  const { cardId } = useParams();
  const editing = cardId !== undefined;
  const [params] = useSearchParams();
  const card = useQuery({
    queryKey: keys.card(cardId ?? 'nueva'),
    queryFn: () => cardsApi.get(cardId ?? ''),
    enabled: editing,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list, enabled: !editing });

  if (editing) {
    if (card.isError) return <Alert>{errorMessage(card.error)}</Alert>;
    if (!card.data) return <SkeletonRows rows={4} />;
    return <CardFormView key={card.data.id} cardId={cardId} initial={formFromCard(card.data)} />;
  }
  if (books.isError) return <Alert>{errorMessage(books.error)}</Alert>;
  if (!books.data) return <SkeletonRows rows={4} />;
  const bookId = params.get('libro') ?? books.data.books[0]?.id ?? '';
  return (
    <CardFormView
      key={bookId}
      initial={{ bookId, title: '', status: 'published', order: 1, images: [] }}
    />
  );
}

/**
 * Formulario de una carta (solo administradoras): título, estado y de 1 a 12 imágenes. Se pueden subir varias a la vez
 * (cada una con su propia firma del servidor), reordenar, quitar y describir. La primera es la portada de la lista.
 */
function CardFormView({ cardId, initial }: { cardId?: string; initial: CardForm }) {
  const editing = cardId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const label = useCardsLabel();
  const [form, setForm] = useState<CardForm>(initial);
  const guard = useFormGuard(form, initial);
  const submitted = useRef(form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Imágenes que se están subiendo ahora mismo (nombre de archivo) y lo que salió mal con cada una. */
  const [uploading, setUploading] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const siblings = useQuery({
    queryKey: keys.cards(form.bookId),
    queryFn: () => cardsApi.list(form.bookId),
    enabled: !editing && form.bookId !== '',
  });
  const nextOrder = (siblings.data?.cards.length ?? 0) + 1;

  const save = useMutation({
    mutationFn: (payload: CardInputPayload) =>
      editing ? cardsApi.replace(cardId, payload) : cardsApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['admin', 'cards'] });
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      if (!editing) {
        guard.allowLeave();
        void navigate(`/admin/cartas/${result.id}`, { replace: true });
      }
    },
  });

  const set = <K extends keyof CardForm>(key: K, value: CardForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setImage = (index: number, patch: Partial<FormImage>) =>
    setForm((current) => ({
      ...current,
      images: current.images.map((image, at) => (at === index ? { ...image, ...patch } : image)),
    }));
  const moveImage = (index: number, by: -1 | 1) =>
    setForm((current) => {
      const target = index + by;
      if (target < 0 || target >= current.images.length) return current;
      const images = [...current.images];
      const [moved] = images.splice(index, 1);
      if (moved) images.splice(target, 0, moved);
      return { ...current, images };
    });
  const removeImage = (index: number) =>
    setForm((current) => ({
      ...current,
      images: current.images.filter((_, at) => at !== index),
    }));

  const room = CARD_IMAGES.max - form.images.length - uploading.length;

  /** Sube los archivos elegidos de uno en uno (cada uno con su firma); lo que no cabe o no sirve se avisa. */
  async function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    const accepted = files.slice(0, Math.max(room, 0));
    const notes: string[] = [];
    if (files.length > accepted.length) {
      notes.push(
        `Una carta admite hasta ${CARD_IMAGES.max} imágenes: se subieron las primeras ${accepted.length}.`,
      );
    }
    setProblems(notes);
    setUploading((current) => [...current, ...accepted.map((file) => file.name)]);
    for (const file of accepted) {
      const problem = cardImageProblem(file);
      if (problem) {
        setProblems((current) => [...current, problem]);
      } else {
        try {
          const uploaded = await uploadCardImage(file, form.bookId);
          setForm((current) => ({
            ...current,
            images: [
              ...current.images,
              { publicId: uploaded.publicId, alt: '', previewUrl: uploaded.previewUrl },
            ],
          }));
        } catch (error) {
          setProblems((current) => [...current, `«${file.name}»: ${errorMessage(error)}`]);
        }
      }
      setUploading((current) => {
        const at = current.indexOf(file.name);
        return at < 0 ? current : current.filter((_, index) => index !== at);
      });
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (uploading.length > 0) return;
    const next = { ...form, order: editing ? form.order : nextOrder };
    const parsed = cardInputSchema.safeParse(toPayload(next));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setForm(next);
    submitted.current = next;
    save.mutate(toPayload(next));
  }

  const bookTitle = books.data?.books.find((book) => book.id === form.bookId)?.title;
  const imagesError = errors['images'];

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <PageHeader
        title={editing ? form.title || 'Sin título' : `Nuevo en «${label}»`}
        subtitle={
          bookTitle
            ? `Libro: ${bookTitle}`
            : 'Un título y de 1 a 12 imágenes. Se abre al escanear su código QR.'
        }
        actions={
          <Link to={`/admin/cartas?libro=${form.bookId}`} className="btn btn-secondary">
            Volver a la lista
          </Link>
        }
      />
      {Object.keys(errors).length > 0 ? (
        <div className="mb-4">
          <Alert title="Revisa estos campos">
            <ul className="list-disc pl-5">
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          {!editing ? (
            <SelectField
              label="Libro"
              value={form.bookId}
              options={(books.data?.books ?? []).map((book) => ({
                value: book.id,
                label: book.title,
              }))}
              error={errors['bookId']}
              onChange={(event) => set('bookId', event.target.value)}
            />
          ) : null}
          <TextField
            label="Título"
            required
            maxLength={120}
            value={form.title}
            error={errors['title']}
            hint="Es lo que ve la lectora junto a la portada, una vez que abrió la carta."
            onChange={(event) => set('title', event.target.value)}
          />
          <SelectField
            label="Estado"
            value={form.status}
            options={STATUS_OPTIONS}
            onChange={(event) => set('status', event.target.value as CardStatus)}
          />
        </Card>

        <FormSection
          title="Imágenes"
          help={`De 1 a ${CARD_IMAGES.max}. Solo JPG, PNG o WebP de hasta ${CARD_IMAGE_LIMITS.maxBytes / 1024 / 1024} MB, de ${CARD_IMAGE_LIMITS.minSide} a ${CARD_IMAGE_LIMITS.maxSide} píxeles por lado. La primera es la portada de la lista.`}
        >
          <ol aria-label="Imágenes de la carta" className="flex flex-col gap-3">
            {form.images.map((image, index) => (
              <li
                key={image.publicId}
                className="surface flex flex-col gap-3 rounded-token-lg p-3 sm:flex-row sm:items-start"
              >
                <img
                  src={image.previewUrl}
                  alt=""
                  className="h-32 w-24 shrink-0 self-center rounded-token object-cover outline outline-1 -outline-offset-1 outline-white/10 sm:self-start"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="tabular-nums">Imagen {index + 1}</span>
                    {index === 0 ? <Badge tone="primary">Portada</Badge> : null}
                  </p>
                  <TextField
                    label={`Texto alternativo de la imagen ${index + 1} (opcional)`}
                    maxLength={300}
                    value={image.alt}
                    hint="Para quien no puede verla. Si lo dejas vacío se usa el título."
                    onChange={(event) => setImage(index, { alt: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      aria-label={`Subir la imagen ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => moveImage(index, -1)}
                    >
                      ↑ Subir
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Bajar la imagen ${index + 1}`}
                      disabled={index === form.images.length - 1}
                      onClick={() => moveImage(index, 1)}
                    >
                      ↓ Bajar
                    </Button>
                    <Button
                      variant="danger-outline"
                      aria-label={`Quitar la imagen ${index + 1}`}
                      onClick={() => removeImage(index)}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {uploading.map((name, index) => (
              <li
                key={`subiendo-${index}-${name}`}
                className="surface flex items-center gap-3 rounded-token-lg p-3 text-sm text-muted"
                role="status"
              >
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-line border-t-primary"
                />
                Subiendo «{name}»…
              </li>
            ))}
          </ol>

          {form.images.length === 0 && uploading.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay imágenes. Sube al menos una.</p>
          ) : null}
          {imagesError ? (
            <p role="alert" className="text-sm text-danger">
              {imagesError}
            </p>
          ) : null}
          {problems.length > 0 ? (
            <Alert title="Algunas imágenes no se subieron">
              <ul className="mt-1 list-disc pl-5">
                {problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <input
            ref={picker}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Elegir imágenes de la carta"
            onChange={(event) => void pickFiles(event)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={room <= 0 || form.bookId === ''}
              loading={uploading.length > 0}
              onClick={() => picker.current?.click()}
            >
              {form.images.length === 0 ? 'Subir imágenes' : 'Agregar más imágenes'}
            </Button>
            <p className="text-sm tabular-nums text-muted">
              {form.images.length} de {CARD_IMAGES.max}
            </p>
          </div>
        </FormSection>

        {editing ? (
          <p className="text-sm text-muted">
            El código QR de esta carta se crea y se descarga en{' '}
            <Link to="/admin/qr" className="underline underline-offset-2">
              Códigos QR
            </Link>
            .
          </p>
        ) : null}
      </div>

      <SaveBar
        dirty={guard.dirty || !editing}
        dirtyLabel={editing ? undefined : 'Aún no se ha guardado'}
        saving={save.isPending || uploading.length > 0}
        error={save.isError ? errorMessage(save.error) : null}
        onSave={() => submit()}
        onDiscard={() => {
          setForm(guard.saved);
          setErrors({});
          setProblems([]);
        }}
        saveLabel={editing ? 'Guardar cambios' : 'Crear'}
        savedLabel="Todo guardado"
      />
    </form>
  );
}
