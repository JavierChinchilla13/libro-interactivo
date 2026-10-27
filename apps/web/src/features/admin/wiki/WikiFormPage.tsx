import {
  FIELD_VISUAL_KEYS,
  FIELD_VISUAL_LABELS,
  wikiEntryInputSchema,
  WIKI_KINDS,
  type FieldVisualKey,
  type WikiKind,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Button,
  CheckField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/ui/controls';
import { Alert, PageHeader } from '../../../shared/ui/layout';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { booksApi, keys, quizzesApi, wikiApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage, fieldErrors, slugify } from '../errors';
import {
  KIND_LABEL,
  emptyWikiForm,
  formFromEntry,
  payloadFromForm,
  type WikiForm,
} from './wikiForm';

const isKind = (value: string | null): value is WikiKind =>
  WIKI_KINDS.some((kind) => kind === value);

/** Carga la entrada (o prepara una nueva del tipo pedido) y entrega el formulario con su valor inicial. */
export function WikiFormPage() {
  const { entryId } = useParams();
  const editing = entryId !== undefined;
  const [params] = useSearchParams();
  const tipo = params.get('tipo');
  const entry = useQuery({
    queryKey: keys.wikiEntry(entryId ?? 'nueva'),
    queryFn: () => wikiApi.get(entryId ?? ''),
    enabled: editing,
  });

  if (editing) {
    if (entry.isError) return <Alert>{errorMessage(entry.error)}</Alert>;
    if (!entry.data) return <SkeletonRows rows={4} />;
    return (
      <WikiFormView key={entry.data.id} entryId={entryId} initial={formFromEntry(entry.data)} />
    );
  }
  return (
    <WikiFormView key={tipo ?? 'term'} initial={emptyWikiForm(isKind(tipo) ? tipo : 'term')} />
  );
}

/** Formulario de una entrada de la wiki: cambia según el tipo. */
function WikiFormView({ entryId, initial }: { entryId?: string; initial: WikiForm }) {
  const editing = entryId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form, setForm] = useState<WikiForm>(initial);
  const guard = useFormGuard(form, initial);
  const toast = useToast();
  const submitted = useRef(form);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const bookId = form.bookId;
  const quizzes = useQuery({
    queryKey: keys.quizzes(bookId),
    queryFn: () => quizzesApi.list(bookId),
    enabled: bookId !== '',
  });
  const fieldsOfPower = useQuery({
    queryKey: [...keys.wiki, 'fields-for-power'],
    queryFn: () => wikiApi.list({ kind: 'power_field' }),
    enabled: form.kind === 'power',
  });
  const characters = useQuery({
    queryKey: [...keys.wiki, 'characters-for-links'],
    queryFn: () => wikiApi.list({ kind: 'character' }),
    enabled: form.kind === 'place',
  });

  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadFromForm>) =>
      editing ? wikiApi.replace(entryId, payload) : wikiApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.wiki });
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      if (!editing) {
        guard.allowLeave();
        void navigate(`/admin/wiki/${result.id}`, { replace: true, state: { created: true } });
      }
    },
  });

  const set = <K extends keyof WikiForm>(key: K, value: WikiForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const payload = payloadFromForm(form);
    const parsed = wikiEntryInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    if (form.kind === 'power' && !form.parentId) {
      setErrors({ parentId: 'Todo poder pertenece a un campo' });
      return;
    }
    setErrors({});
    submitted.current = form;
    save.mutate(payload);
  }

  const kind = form.kind;

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <p className="mb-2 text-sm">
        <Link to="/admin/wiki" className="underline">
          ← Wiki
        </Link>
      </p>
      <PageHeader title={`${editing ? '' : 'Nuevo: '}${KIND_LABEL[kind]}`} />

      <div className="flex flex-col gap-5">
        <FormSection title="Datos de la ficha" help="El nombre y lo que identifica a la entrada.">
          <TextField
            label="Nombre"
            required
            value={form.name}
            error={errors['name']}
            onChange={(event) => {
              set('name', event.target.value);
              if (!form.slugTouched) set('slug', slugify(event.target.value));
            }}
          />
          <TextField
            label="Dirección web"
            required
            value={form.slug}
            error={errors['slug']}
            hint="La parte final del enlace. Se arma sola con el nombre."
            onChange={(event) => {
              set('slugTouched', true);
              set('slug', event.target.value);
            }}
          />

          {kind === 'power' ? (
            <SelectField
              label="Campo al que pertenece"
              required
              value={form.parentId}
              placeholder="Elige un campo"
              error={errors['parentId']}
              hint="Obligatorio: todo poder cuelga de un campo."
              options={(fieldsOfPower.data?.entries ?? []).map((field) => ({
                value: field.id,
                label: field.name,
              }))}
              onChange={(event) => set('parentId', event.target.value)}
            />
          ) : null}

          {kind === 'power_field' ? (
            <SelectField
              label="Animación del campo"
              value={form.visualKey}
              placeholder="Sin animación"
              hint="Se ve en la ficha del campo y en el resultado del quiz de quien pertenece a este campo."
              options={FIELD_VISUAL_KEYS.map((key) => ({
                value: key,
                label: FIELD_VISUAL_LABELS[key],
              }))}
              onChange={(event) => set('visualKey', event.target.value as FieldVisualKey | '')}
            />
          ) : null}

          {kind === 'place' ? (
            <TextField
              label="Tipo de lugar"
              hint="Habitación, sala, ciudad, conducto, módulo… (lista libre)."
              value={form.group}
              onChange={(event) => set('group', event.target.value)}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Libro"
              value={form.bookId}
              placeholder="Toda la saga"
              hint="Vacío = aplica a toda la saga."
              options={(books.data?.books ?? []).map((book) => ({
                value: book.id,
                label: book.title,
              }))}
              onChange={(event) => {
                set('bookId', event.target.value);
                set('unlockQuizId', '');
              }}
            />
            <SelectField
              label="Estado"
              value={form.status}
              options={[
                { value: 'draft', label: 'Borrador' },
                { value: 'published', label: 'Publicado' },
                { value: 'archived', label: 'Archivado' },
              ]}
              onChange={(event) => set('status', event.target.value as WikiForm['status'])}
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
        </FormSection>

        <FormSection title="Imagen y resumen" help="Lo que se ve en la tarjeta y en la ficha.">
          <ImageField
            label={kind === 'character' ? 'Ficha (imagen)' : 'Imagen'}
            purpose="wiki"
            value={form.image}
            onChange={(image) => set('image', image)}
            hint={
              kind === 'character'
                ? 'Puede ser una ficha diseñada en Canva; el texto y los datos son opcionales.'
                : 'JPG, PNG o WebP. Anota el origen o licencia si no es tuya.'
            }
          />
          {kind !== 'term' ? (
            <TextAreaField
              label="Resumen (tarjeta)"
              rows={2}
              maxLength={300}
              value={form.summary}
              onChange={(event) => set('summary', event.target.value)}
            />
          ) : null}
          <RichTextEditor
            label={kind === 'term' ? 'Definición' : 'Descripción'}
            value={form.bodyHtml}
            onChange={(html) => set('bodyHtml', html)}
          />
        </FormSection>

        {kind === 'character' ? (
          <FormSection
            title="Datos (opcionales)"
            help="Pares como «Edad: 17» que se muestran en la ficha."
          >
            {form.fields.map((field, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <TextField
                  label="Etiqueta"
                  value={field.label}
                  onChange={(event) =>
                    set(
                      'fields',
                      form.fields.map((f, i) =>
                        i === index ? { ...f, label: event.target.value } : f,
                      ),
                    )
                  }
                />
                <TextField
                  label="Valor"
                  value={field.value}
                  onChange={(event) =>
                    set(
                      'fields',
                      form.fields.map((f, i) =>
                        i === index ? { ...f, value: event.target.value } : f,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  aria-label={`Quitar el dato ${index + 1}`}
                  onClick={() =>
                    set(
                      'fields',
                      form.fields.filter((_, i) => i !== index),
                    )
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => set('fields', [...form.fields, { label: '', value: '' }])}
            >
              + Dato
            </Button>
          </FormSection>
        ) : null}

        {kind === 'place' ? (
          <FormSection title="Personajes que lo usan">
            {(characters.data?.entries ?? []).length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay personajes para enlazar.</p>
            ) : null}
            {(characters.data?.entries ?? []).map((character) => (
              <CheckField
                key={character.id}
                label={character.name}
                checked={form.links.includes(character.id)}
                onChange={(on) =>
                  set(
                    'links',
                    on
                      ? [...form.links, character.id]
                      : form.links.filter((id) => id !== character.id),
                  )
                }
              />
            ))}
          </FormSection>
        ) : null}

        <FormSection
          title="Visibilidad"
          help="Cuándo se muestra y qué ve la lectora mientras tanto."
        >
          <p className="text-sm text-muted">
            La pestaña completa se bloquea desde el libro. Aquí puedes ocultar solo esta entrada
            hasta que el lector complete un quiz.
          </p>
          <SelectField
            label="Se muestra tras completar…"
            value={form.unlockQuizId}
            placeholder="Siempre visible"
            disabled={form.bookId === ''}
            hint={form.bookId === '' ? 'Elige un libro para poder usar un quiz.' : undefined}
            options={(quizzes.data?.quizzes ?? [])
              .filter((quiz) => quiz.status !== 'archived')
              .map((quiz) => ({ value: quiz.id, label: `Quiz ${quiz.order} · ${quiz.title}` }))}
            onChange={(event) => set('unlockQuizId', event.target.value)}
          />
          {form.unlockQuizId ? (
            <SelectField
              label="Qué ve la lectora mientras tanto"
              value={form.lockedDisplay}
              options={[
                { value: 'show', label: 'Mostrarla como «bloqueada» (sin contenido)' },
                { value: 'hide', label: 'No mostrarla' },
              ]}
              onChange={(event) =>
                set('lockedDisplay', event.target.value as WikiForm['lockedDisplay'])
              }
            />
          ) : null}
        </FormSection>
      </div>
      <SaveBar
        dirty={guard.dirty || !editing}
        dirtyLabel={editing ? undefined : 'Aún no se ha guardado'}
        saving={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onSave={() => submit()}
        onDiscard={() => {
          setForm(guard.saved);
          setErrors({});
        }}
        saveLabel="Guardar entrada"
      />
    </form>
  );
}
