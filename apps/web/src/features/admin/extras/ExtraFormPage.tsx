import { extraInputSchema, type ExtraPreviewResponse } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiClientError } from '../../../shared/api/client';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { Button, SelectField, TextAreaField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, extrasApi, keys } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage, fieldErrors, slugify } from '../errors';
import {
  KIND_LABEL,
  checkFile,
  emptyExtraForm,
  formFromExtra,
  payloadFromForm,
  type ExtraForm,
} from './extraForm';

/** Carga el extra (o prepara uno nuevo del libro pedido) y entrega el formulario con su valor inicial. */
export function ExtraFormPage() {
  const { extraId } = useParams();
  const editing = extraId !== undefined;
  const [params] = useSearchParams();
  const extra = useQuery({
    queryKey: keys.extra(extraId ?? 'nuevo'),
    queryFn: () => extrasApi.get(extraId ?? ''),
    enabled: editing,
  });
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list, enabled: !editing });

  if (editing) {
    if (extra.isError) return <Alert>{errorMessage(extra.error)}</Alert>;
    if (!extra.data) return <Loading />;
    return (
      <ExtraFormView key={extra.data.id} extraId={extraId} initial={formFromExtra(extra.data)} />
    );
  }
  if (books.isError) return <Alert>{errorMessage(books.error)}</Alert>;
  if (!books.data) return <Loading />;
  const bookId = params.get('libro') ?? books.data.books[0]?.id ?? '';
  return <ExtraFormView key={bookId} initial={emptyExtraForm(bookId)} />;
}

/** Formulario de un capítulo o documento extra: texto en pantalla, PDF o imagen (archivo privado, URL firmada al leer). */
function ExtraFormView({ extraId, initial }: { extraId?: string; initial: ExtraForm }) {
  const editing = extraId !== undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const [form, setForm] = useState<ExtraForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(
    (location.state as { created?: boolean } | null)?.created === true,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExtraPreviewResponse | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });

  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadFromForm>) =>
      editing ? extrasApi.replace(extraId, payload) : extrasApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['admin', 'extras'] });
      setSaved(true);
      if (!editing)
        void navigate(`/admin/extras/${result.id}`, { replace: true, state: { created: true } });
    },
  });
  const previewing = useMutation({
    mutationFn: () => extrasApi.preview(extraId ?? ''),
    onSuccess: setPreview,
  });

  const set = <K extends keyof ExtraForm>(key: K, value: ExtraForm[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  /** Pide permiso al servidor y sube el archivo directo al almacenamiento privado (los bytes no pasan por la API). */
  async function pickFile(file: File | undefined) {
    if (!file || form.kind === 'text') return;
    const problem = checkFile(form.kind, file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const target = await extrasApi.uploadUrl({
        bookId: form.bookId,
        kind: form.kind,
        filename: file.name,
        mime: file.type,
        size: file.size,
      });
      if (target.uploadUrl.startsWith('memory://')) {
        throw new ApiClientError(
          'UNAVAILABLE',
          'El almacenamiento privado no está configurado todavía.',
        );
      }
      let response: Response;
      try {
        response = await fetch(target.uploadUrl, {
          method: 'PUT',
          headers: target.headers,
          body: file,
        });
      } catch {
        throw new ApiClientError('NETWORK', 'No se pudo subir el archivo. Revisa tu conexión.');
      }
      if (!response.ok)
        throw new ApiClientError('VALIDATION', 'El almacenamiento rechazó el archivo.');
      set('file', {
        storageKey: target.storageKey,
        mime: file.type,
        size: file.size,
        originalName: file.name,
      });
    } catch (failure) {
      setUploadError(errorMessage(failure));
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = '';
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = payloadFromForm(form);
    const parsed = extraInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(payload);
  }

  const isFile = form.kind !== 'text';

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <p className="mb-2 text-sm">
        <Link to="/admin/extras" className="underline">
          ← Capítulos extra
        </Link>
      </p>
      <PageHeader
        title={editing ? form.title || 'Extra' : 'Nuevo extra'}
        actions={
          <>
            {editing ? (
              <Button
                variant="secondary"
                loading={previewing.isPending}
                onClick={() => previewing.mutate()}
              >
                Vista previa
              </Button>
            ) : null}
            <Button type="submit" loading={save.isPending}>
              Guardar
            </Button>
          </>
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
      {previewing.isError ? (
        <div className="mb-4">
          <Alert>{errorMessage(previewing.error)}</Alert>
        </div>
      ) : null}
      {preview ? (
        <Card className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted">
            Vista previa (no cuenta como «visto»)
          </p>
          {preview.kind === 'text' ? <SafeHtml html={preview.bodyHtml ?? ''} /> : null}
          {preview.kind !== 'text' && preview.url ? (
            <a href={preview.url} target="_blank" rel="noopener noreferrer" className="underline">
              Abrir {KIND_LABEL[preview.kind]} (el enlace caduca en{' '}
              {Math.round((preview.expiresIn ?? 300) / 60)} minutos)
            </a>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <SelectField
            label="Libro"
            required
            value={form.bookId}
            disabled={editing}
            error={errors['bookId']}
            options={(books.data?.books ?? []).map((book) => ({
              value: book.id,
              label: book.title,
            }))}
            onChange={(event) => set('bookId', event.target.value)}
          />
          <SelectField
            label="Tipo"
            value={form.kind}
            disabled={editing}
            hint={editing ? 'El tipo no se puede cambiar: crea otro extra.' : undefined}
            options={(['text', 'pdf', 'image'] as const).map((kind) => ({
              value: kind,
              label: KIND_LABEL[kind],
            }))}
            onChange={(event) => {
              set('kind', event.target.value as ExtraForm['kind']);
              set('file', undefined);
            }}
          />
          <TextField
            label="Título"
            required
            value={form.title}
            error={errors['title']}
            onChange={(event) => {
              set('title', event.target.value);
              if (!form.slugTouched) set('slug', slugify(event.target.value));
            }}
          />
          <TextField
            label="Dirección (slug)"
            required
            value={form.slug}
            error={errors['slug']}
            onChange={(event) => {
              set('slugTouched', true);
              set('slug', event.target.value);
            }}
          />
          <TextAreaField
            label="Descripción (se ve antes de abrirlo; sin spoilers)"
            rows={2}
            maxLength={500}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Estado"
              value={form.status}
              options={[
                { value: 'draft', label: 'Borrador' },
                { value: 'published', label: 'Publicado' },
                { value: 'archived', label: 'Archivado' },
              ]}
              onChange={(event) => set('status', event.target.value as ExtraForm['status'])}
            />
            <TextField
              label="Orden"
              type="number"
              min={1}
              value={form.order}
              error={errors['order']}
              onChange={(event) => set('order', event.target.value)}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          {isFile ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">
                {form.kind === 'pdf' ? 'Archivo PDF' : 'Imagen'}
              </legend>
              <p className="text-sm text-muted">
                El archivo va a un almacenamiento <strong>privado</strong>: los lectores solo lo ven
                con un enlace que caduca en minutos, después de completar el libro.
              </p>
              {form.file ? (
                <p className="text-sm">
                  {form.file.originalName} ({Math.max(1, Math.round(form.file.size / 1024))} KB)
                </p>
              ) : (
                <p className="text-sm text-muted">Sin archivo todavía.</p>
              )}
              <input
                ref={picker}
                type="file"
                className="sr-only"
                aria-label="Elegir archivo"
                accept={form.kind === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp'}
                onChange={(event) => void pickFile(event.target.files?.[0])}
              />
              <Button
                variant="secondary"
                className="self-start"
                loading={uploading}
                disabled={form.bookId === ''}
                onClick={() => picker.current?.click()}
              >
                {form.file ? 'Cambiar archivo' : 'Subir archivo'}
              </Button>
              {uploadError ? <Alert>{uploadError}</Alert> : null}
              {errors['file'] ? <Alert>{errors['file']}</Alert> : null}
              <p className="text-xs text-muted">
                {form.kind === 'pdf' ? 'PDF de hasta 25 MB.' : 'PNG, JPG o WebP de hasta 10 MB.'}
              </p>
            </fieldset>
          ) : (
            <>
              <RichTextEditor
                label="Texto del capítulo"
                value={form.bodyHtml}
                onChange={(html) => set('bodyHtml', html)}
              />
              {errors['bodyHtml'] ? <Alert>{errors['bodyHtml']}</Alert> : null}
            </>
          )}
        </Card>
      </div>
    </form>
  );
}
