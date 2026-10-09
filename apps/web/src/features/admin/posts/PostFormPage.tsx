import {
  POST_CATEGORY_LABELS,
  POST_TEMPLATES,
  postInputSchema,
  postTemplateSchema,
  postTemplates,
  type PostDetail,
  type PostInputPayload,
  type PostStatus,
  type PostTemplate,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { PostView } from '../../posts/templates';
import { Button, CheckField, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, keys, postsApi } from '../api';
import { ImageField } from '../components/MediaFields';
import { errorMessage, fieldErrors, slugify } from '../errors';
import {
  STATUS_LABEL,
  dataToPayload,
  emptyPostForm,
  formFromPost,
  payloadFromForm,
  type PostForm,
} from './postForm';
import { templateFields } from './TemplateFields';

/** Paso 1: elegir plantilla (cada tarjeta dice para qué sirve). */
function TemplatePicker({
  onPick,
  onCancel,
}: {
  onPick: (template: PostTemplate) => void;
  onCancel?: () => void;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-semibold">1. Elige una plantilla</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {POST_TEMPLATES.map((template) => (
          <li key={template}>
            <button
              type="button"
              onClick={() => onPick(template)}
              className="flex h-full w-full flex-col items-start gap-1 rounded-token-lg border border-border p-4 text-left hover:bg-surface-alt"
            >
              <span className="font-semibold">{postTemplates[template].label}</span>
              <span className="text-sm text-muted">{postTemplates[template].description}</span>
            </button>
          </li>
        ))}
      </ul>
      {onCancel ? (
        <Button type="button" variant="secondary" className="self-start" onClick={onCancel}>
          Cancelar
        </Button>
      ) : null}
    </Card>
  );
}

/** Carga la actualización (o pide la plantilla) y entrega el formulario con su valor inicial. */
export function PostFormPage() {
  const { postId } = useParams();
  const editing = postId !== undefined;
  const [params, setParams] = useSearchParams();
  const post = useQuery({
    queryKey: keys.post(postId ?? 'nueva'),
    queryFn: () => postsApi.get(postId ?? ''),
    enabled: editing,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  if (editing) {
    if (post.isError) return <Alert>{errorMessage(post.error)}</Alert>;
    if (!post.data) return <Loading />;
    return <PostFormView key={post.data.id} postId={postId} initial={formFromPost(post.data)} />;
  }
  const template = postTemplateSchema.safeParse(params.get('plantilla'));
  if (!template.success) {
    return (
      <>
        <PageHeader title="Nueva actualización" />
        <TemplatePicker onPick={(picked) => setParams({ plantilla: picked })} />
      </>
    );
  }
  return <PostFormView key={template.data} initial={emptyPostForm(template.data)} />;
}

/** Formulario de la actualización: cambia según la plantilla y muestra la vista previa. */
function PostFormView({ postId, initial }: { postId?: string; initial: PostForm }) {
  const editing = postId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const location = useLocation();
  const [form, setForm] = useState<PostForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState(false);
  const [saved, setSaved] = useState(
    (location.state as { created?: boolean } | null)?.created === true,
  );
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });

  const save = useMutation({
    mutationFn: (payload: PostInputPayload) =>
      editing ? postsApi.replace(postId, payload) : postsApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.posts });
      setSaved(true);
      if (!editing) {
        void navigate(`/admin/actualizaciones/${result.id}`, {
          replace: true,
          state: { created: true },
        });
      }
    },
  });

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const setData = (key: string, value: unknown) => set('data', { ...form.data, [key]: value });

  function submit(event: FormEvent, status: PostStatus = form.status) {
    event.preventDefault();
    const next = { ...form, status };
    const payload = payloadFromForm(next);
    const parsed = postInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setForm(next);
    save.mutate(payload);
  }

  function pickTemplate(template: PostTemplate) {
    const fresh = emptyPostForm(template);
    setSaved(false);
    setForm((current) => ({
      ...current,
      template,
      data: fresh.data,
      category: fresh.category,
    }));
    setErrors({});
    setChanging(false);
  }

  const Fields = templateFields[form.template];
  const error = (key: string) => errors[key];
  const preview: PostDetail = {
    id: 'vista-previa',
    slug: form.slug || 'vista-previa',
    title: form.title || 'Título de la publicación',
    template: form.template,
    category: form.category,
    excerpt: '',
    publishedAt: new Date().toISOString(),
    featured: form.featured,
    data: dataToPayload(form.template, form.data),
  };
  const bookOptions = (books.data?.books ?? []).map((book) => ({
    value: book.id,
    label: book.title,
  }));

  return (
    <form onSubmit={(event) => submit(event)} noValidate>
      <PageHeader
        title={editing ? form.title || 'Actualización' : 'Nueva actualización'}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              loading={save.isPending}
              onClick={(event) => submit(event, 'draft')}
            >
              Guardar borrador
            </Button>
            <Button
              type="button"
              loading={save.isPending}
              onClick={(event) => submit(event, 'published')}
            >
              Publicar
            </Button>
          </>
        }
      />
      {saved ? (
        <div className="mb-4">
          <Alert tone="success" title="Cambios guardados">
            {form.status === 'published' ? (
              <Link to={`/actualizaciones/${form.slug}`} className="underline" target="_blank">
                Ver la publicación
              </Link>
            ) : null}
          </Alert>
        </div>
      ) : null}
      {save.isError ? (
        <div className="mb-4">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      ) : null}
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

      {changing ? (
        <TemplatePicker onPick={pickTemplate} onCancel={() => setChanging(false)} />
      ) : (
        <div className="flex max-w-3xl flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                2. Completa los datos · Plantilla «{postTemplates[form.template].label}»
              </h2>
              <Button type="button" variant="secondary" onClick={() => setChanging(true)}>
                Cambiar plantilla
              </Button>
            </div>
            <TextField
              label="Título"
              required
              maxLength={160}
              value={form.title}
              error={error('title')}
              onChange={(event) => {
                const title = event.target.value;
                setSaved(false);
                setForm((current) => ({
                  ...current,
                  title,
                  slug: current.slugTouched ? current.slug : slugify(title),
                }));
              }}
            />
            <TextField
              label="Dirección web (slug)"
              maxLength={80}
              hint="Se genera sola a partir del título."
              value={form.slug}
              error={error('slug')}
              onChange={(event) => {
                setSaved(false);
                setForm((current) => ({ ...current, slug: event.target.value, slugTouched: true }));
              }}
            />
            <Fields data={form.data} set={setData} errors={errors} />
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">Publicación</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Tipo"
                value={form.category}
                error={error('category')}
                hint="Se propone según la plantilla; puedes cambiarlo. Es lo que filtra el lector."
                options={Object.entries(POST_CATEGORY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(event) => set('category', event.target.value as PostForm['category'])}
              />
              <SelectField
                label="Libro"
                value={form.bookId}
                placeholder="Toda la saga"
                options={bookOptions}
                onChange={(event) => set('bookId', event.target.value)}
              />
              <SelectField
                label="Estado"
                value={form.status}
                options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                onChange={(event) => set('status', event.target.value as PostStatus)}
              />
              <TextField
                label="Fecha de publicación"
                type="datetime-local"
                hint="Hora de Costa Rica. Vacía = ahora. Una fecha futura la deja programada."
                value={form.publishedAt}
                error={error('publishedAt')}
                onChange={(event) => set('publishedAt', event.target.value)}
              />
            </div>
            <CheckField
              label="Destacar en la página principal"
              checked={form.featured}
              onChange={(value) => set('featured', value)}
            />
            <ImageField
              label="Miniatura de la tarjeta (opcional)"
              purpose="post"
              value={form.thumbnail}
              hint="Si la dejas vacía se usa la primera imagen de la publicación."
              onChange={(value) => set('thumbnail', value)}
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">Vista previa</h2>
            <p className="text-sm text-muted">
              Así se verá la plantilla «{postTemplates[form.template].label}».
            </p>
            <div className="rounded-token border border-dashed border-border p-4">
              <PostView post={preview} preview />
            </div>
          </Card>
        </div>
      )}
    </form>
  );
}
