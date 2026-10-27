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
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { PostView } from '../../posts/templates';
import { Button, CheckField, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, PageHeader } from '../../../shared/ui/layout';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { booksApi, keys, postsApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
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
    <FormSection title="1. Elige una plantilla">
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
    </FormSection>
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
    if (!post.data) return <SkeletonRows rows={4} />;
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
  const [form, setForm] = useState<PostForm>(initial);
  const guard = useFormGuard(form, initial);
  const toast = useToast();
  const submitted = useRef(form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState(false);
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });

  const save = useMutation({
    mutationFn: (payload: PostInputPayload) =>
      editing ? postsApi.replace(postId, payload) : postsApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.posts });
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      if (!editing) {
        guard.allowLeave();
        void navigate(`/admin/actualizaciones/${result.id}`, {
          replace: true,
          state: { created: true },
        });
      }
    },
  });

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const setData = (key: string, value: unknown) => set('data', { ...form.data, [key]: value });

  function submit(event?: FormEvent, status: PostStatus = form.status) {
    event?.preventDefault();
    const next = { ...form, status };
    const payload = payloadFromForm(next);
    const parsed = postInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setForm(next);
    submitted.current = form;
    save.mutate(payload);
  }

  function pickTemplate(template: PostTemplate) {
    const fresh = emptyPostForm(template);
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
          editing && form.status === 'published' ? (
            <Link
              to={`/actualizaciones/${form.slug}`}
              className="btn btn-secondary"
              target="_blank"
            >
              Ver en el sitio
            </Link>
          ) : undefined
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
                setForm((current) => ({
                  ...current,
                  title,
                  slug: current.slugTouched ? current.slug : slugify(title),
                }));
              }}
            />
            <TextField
              label="Dirección web"
              maxLength={80}
              hint="La parte final del enlace. Se arma sola con el título."
              value={form.slug}
              error={error('slug')}
              onChange={(event) => {
                setForm((current) => ({ ...current, slug: event.target.value, slugTouched: true }));
              }}
            />
            <Fields data={form.data} set={setData} errors={errors} />
          </Card>

          <FormSection title="Publicación" help="Estado, fecha y dónde se ve.">
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
          </FormSection>

          <FormSection title="Vista previa">
            <p className="text-sm text-muted">
              Así se verá la plantilla «{postTemplates[form.template].label}».
            </p>
            <div className="rounded-token border border-dashed border-border p-4">
              <PostView post={preview} preview />
            </div>
          </FormSection>
        </div>
      )}
      <SaveBar
        dirty={guard.dirty || !editing}
        dirtyLabel={editing ? undefined : 'Aún no se ha guardado'}
        saving={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onSave={() => submit(undefined)}
        saveVariant={form.status === 'draft' ? 'secondary' : 'primary'}
        after={
          form.status === 'draft' ? (
            <Button loading={save.isPending} onClick={() => submit(undefined, 'published')}>
              Publicar
            </Button>
          ) : undefined
        }
        onDiscard={() => {
          setForm(guard.saved);
          setErrors({});
        }}
        saveLabel={form.status === 'draft' ? 'Guardar borrador' : 'Guardar cambios'}
        savedLabel="Todo guardado"
      />
    </form>
  );
}
