import {
  BOOK_STATUSES,
  bookInputSchema,
  type PurchaseLink,
  type WikiSectionInput,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Button,
  CheckField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader, TabPanel, Tabs } from '../../../shared/ui/layout';
import { booksApi, keys, quizzesApi } from '../api';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { errorMessage, fieldErrors, slugify } from '../errors';
import {
  SECTION_LABELS,
  emptyBookForm,
  formFromBook,
  payloadFromForm,
  type BookForm,
} from './bookForm';
import { BOOK_STATUS_LABEL } from './BookListPage';

type Tab = 'datos' | 'wiki';

const REGION_LABEL = { CR: 'Costa Rica', INTL: 'Internacional' } as const;
const KIND_LABEL = {
  whatsapp: 'WhatsApp (envíos)',
  store: 'Tienda (presencial)',
  amazon: 'Amazon',
  other: 'Otro',
} as const;

/** Carga el libro (o la posición siguiente) y entrega el formulario con su valor inicial. */
export function BookFormPage() {
  const { bookId } = useParams();
  const editing = bookId !== undefined;
  const book = useQuery({
    queryKey: keys.book(bookId ?? 'nuevo'),
    queryFn: () => booksApi.get(bookId ?? ''),
    enabled: editing,
  });
  const all = useQuery({ queryKey: keys.books, queryFn: booksApi.list, enabled: !editing });

  if (editing) {
    if (book.isError) return <Alert>{errorMessage(book.error)}</Alert>;
    if (!book.data) return <Loading />;
    return <BookFormView key={book.data.id} bookId={bookId} initial={formFromBook(book.data)} />;
  }
  if (all.isError) return <Alert>{errorMessage(all.error)}</Alert>;
  if (!all.data) return <Loading />;
  return <BookFormView key="nuevo" initial={emptyBookForm(all.data.books.length + 1)} />;
}

/** Formulario del libro: datos, estado, compra, tema y pestañas de la wiki. */
function BookFormView({ bookId, initial }: { bookId?: string; initial: BookForm }) {
  const editing = bookId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('datos');
  const [form, setForm] = useState<BookForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Tras crear, la pantalla se vuelve a montar con la dirección del recurso nuevo y conserva el aviso.
  const location = useLocation();
  const [saved, setSaved] = useState(
    (location.state as { created?: boolean } | null)?.created === true,
  );

  const quizzes = useQuery({
    queryKey: keys.quizzes(bookId ?? ''),
    queryFn: () => quizzesApi.list(bookId ?? ''),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadFromForm>) =>
      editing ? booksApi.replace(bookId, payload) : booksApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.books });
      setSaved(true);
      if (!editing)
        void navigate(`/admin/libros/${result.id}`, { replace: true, state: { created: true } });
    },
  });

  const set = <K extends keyof BookForm>(key: K, value: BookForm[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const setSection = (index: number, patch: Partial<WikiSectionInput>) =>
    set(
      'wikiSections',
      form.wikiSections.map((section, i) => (i === index ? { ...section, ...patch } : section)),
    );
  const setLink = (index: number, patch: Partial<PurchaseLink>) =>
    set(
      'purchaseLinks',
      form.purchaseLinks.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    );

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = payloadFromForm(form);
    const parsed = bookInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      setTab('datos');
      return;
    }
    setErrors({});
    save.mutate(payload);
  }

  const err = (key: string) => errors[key];
  const quizOptions = (quizzes.data?.quizzes ?? [])
    .filter((quiz) => quiz.status !== 'archived')
    .map((quiz) => ({ value: quiz.id, label: `Quiz ${quiz.order} · ${quiz.title}` }));

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={editing ? form.title || 'Libro' : 'Nuevo libro'}
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

      <Tabs
        label="Secciones del libro"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'datos', label: 'Datos' },
          { id: 'wiki', label: 'Pestañas de la wiki' },
        ]}
      />

      <TabPanel id="datos" active={tab}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <TextField
              label="Título"
              required
              value={form.title}
              error={err('title')}
              onChange={(event) => {
                set('title', event.target.value);
                if (!form.slugTouched) set('slug', slugify(event.target.value));
              }}
            />
            <TextField
              label="Dirección web (slug)"
              hint="Se genera del título; editable. Solo minúsculas, números y guiones."
              required
              value={form.slug}
              error={err('slug')}
              onChange={(event) => {
                set('slugTouched', true);
                set('slug', event.target.value);
              }}
            />
            <TextField
              label="Lema"
              value={form.tagline}
              error={err('tagline')}
              onChange={(event) => set('tagline', event.target.value)}
            />
            <RichTextEditor
              label="Sinopsis"
              hint="Sin spoilers."
              value={form.synopsis}
              onChange={(html) => set('synopsis', html)}
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">Estado y fecha</h2>
            <SelectField
              label="Estado"
              value={form.status}
              error={err('status')}
              hint="«Próximamente» muestra la portada con esa etiqueta y la fecha en el carrusel."
              options={BOOK_STATUSES.map((status) => ({
                value: status,
                label: BOOK_STATUS_LABEL[status],
              }))}
              onChange={(event) => set('status', event.target.value as BookForm['status'])}
            />
            <TextField
              label="Fecha de publicación"
              type="date"
              value={form.releaseDate}
              error={err('releaseDate')}
              onChange={(event) => set('releaseDate', event.target.value)}
            />
            <TextField
              label="Posición en la saga"
              type="number"
              min={1}
              value={form.order}
              error={err('order')}
              hint="También es el orden del carrusel «Secuencia de publicación»."
              onChange={(event) => set('order', event.target.value)}
            />
            <ImageField
              label="Portada"
              purpose="cover"
              value={form.cover}
              onChange={(image) => set('cover', image)}
              hint={err('cover') ?? 'Obligatoria para publicar o poner «Próximamente».'}
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">Datos del libro</h2>
            <TextField
              label="Géneros"
              hint="Separados por coma."
              value={form.genres}
              onChange={(event) => set('genres', event.target.value)}
            />
            <RichTextEditor
              label="Advertencia de contenido sensible"
              value={form.contentWarning}
              onChange={(html) => set('contentWarning', html)}
            />
            <TextField
              label="Edad recomendada (mayores de…)"
              type="number"
              min={0}
              value={form.minAge}
              error={err('minAge')}
              onChange={(event) => set('minAge', event.target.value)}
            />
            <TextField
              label="ISBN"
              hint="Se añade tras la impresión."
              value={form.isbn}
              onChange={(event) => set('isbn', event.target.value)}
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">Cómo comprar</h2>
            {form.purchaseLinks.map((link, index) => (
              <fieldset
                key={index}
                className="flex flex-col gap-3 rounded-token border border-border p-3"
              >
                <legend className="px-1 text-sm font-medium">Enlace {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Región"
                    value={link.region}
                    options={Object.entries(REGION_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(event) =>
                      setLink(index, { region: event.target.value as PurchaseLink['region'] })
                    }
                  />
                  <SelectField
                    label="Tipo"
                    value={link.kind}
                    options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
                    onChange={(event) =>
                      setLink(index, { kind: event.target.value as PurchaseLink['kind'] })
                    }
                  />
                </div>
                <TextField
                  label="Texto"
                  value={link.label}
                  error={err(`purchaseLinks.${index}.label`)}
                  onChange={(event) => setLink(index, { label: event.target.value })}
                />
                <TextField
                  label="Enlace (opcional)"
                  hint="Compras presenciales no llevan enlace."
                  value={link.url ?? ''}
                  error={err(`purchaseLinks.${index}.url`)}
                  onChange={(event) => {
                    const { url: _removed, ...rest } = link;
                    const next: PurchaseLink = event.target.value
                      ? { ...rest, url: event.target.value }
                      : rest;
                    set(
                      'purchaseLinks',
                      form.purchaseLinks.map((current, i) => (i === index ? next : current)),
                    );
                  }}
                />
                <Button
                  variant="ghost"
                  onClick={() =>
                    set(
                      'purchaseLinks',
                      form.purchaseLinks.filter((_, i) => i !== index),
                    )
                  }
                >
                  Quitar este enlace
                </Button>
              </fieldset>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                set('purchaseLinks', [
                  ...form.purchaseLinks,
                  { region: 'CR', kind: 'whatsapp', label: '' },
                ])
              }
            >
              + Agregar enlace
            </Button>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-semibold">Tema del libro</h2>
            <TextField
              label="Color principal"
              placeholder="#444444"
              value={form.primaryColor}
              error={err('theme.primaryColor')}
              onChange={(event) => set('primaryColor', event.target.value)}
            />
            <SelectField
              label="Fondo"
              hint="Solo color o imagen (sin video)."
              value={form.background}
              options={[
                { value: 'none', label: 'Sin tema propio' },
                { value: 'color', label: 'Color' },
                { value: 'image', label: 'Imagen' },
              ]}
              onChange={(event) => set('background', event.target.value as BookForm['background'])}
            />
            {form.background === 'color' ? (
              <TextField
                label="Color de fondo"
                value={form.backgroundColor}
                error={err('theme.background.color')}
                onChange={(event) => set('backgroundColor', event.target.value)}
              />
            ) : null}
            {form.background === 'image' ? (
              <ImageField
                label="Imagen de fondo"
                purpose="theme"
                value={form.backgroundImage}
                onChange={(image) => set('backgroundImage', image)}
              />
            ) : null}
          </Card>
        </div>
      </TabPanel>

      <TabPanel id="wiki" active={tab}>
        {!editing ? (
          <Alert tone="warning" title="Guarda el libro primero">
            Para bloquear una pestaña hasta completar un quiz, el libro debe existir y tener
            quizzes.
          </Alert>
        ) : null}
        <p className="mb-4 text-sm text-muted">
          Un libro nuevo parte con las mismas pestañas y sin reglas; aquí se ajustan. Una pestaña
          bloqueada se muestra al lector como «bloqueada», con tu mensaje y sin contenido.
        </p>
        <div className="flex flex-col gap-4">
          {form.wikiSections.map((section, index) => (
            <Card key={section.kind} className="flex flex-col gap-4">
              <h2 className="font-semibold">{SECTION_LABELS[section.kind]}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nombre visible"
                  value={section.title}
                  error={err(`wikiSections.${index}.title`)}
                  onChange={(event) => setSection(index, { title: event.target.value })}
                />
                <CheckField
                  label="Visible para los lectores"
                  checked={section.enabled}
                  onChange={(value) => setSection(index, { enabled: value })}
                />
                <SelectField
                  label="Se desbloquea…"
                  value={section.unlockAfter?.refId ?? ''}
                  disabled={!editing}
                  placeholder="Siempre visible"
                  options={quizOptions}
                  onChange={(event) => {
                    const { unlockAfter: _removed, ...rest } = section;
                    const next: WikiSectionInput = event.target.value
                      ? { ...rest, unlockAfter: { kind: 'quiz', refId: event.target.value } }
                      : rest;
                    set(
                      'wikiSections',
                      form.wikiSections.map((current, i) => (i === index ? next : current)),
                    );
                  }}
                  hint={editing ? 'Tras completar este quiz.' : 'Disponible al guardar el libro.'}
                />
                <TextAreaField
                  label="Mensaje si está bloqueada"
                  value={section.lockedMessage ?? ''}
                  maxLength={300}
                  onChange={(event) => setSection(index, { lockedMessage: event.target.value })}
                />
              </div>
              <RichTextEditor
                label="Mensaje de introducción para el lector"
                value={section.introHtml ?? ''}
                onChange={(html) => setSection(index, { introHtml: html })}
              />
              {section.kind === 'place' ? (
                <ImageField
                  label="Imagen del mapa"
                  purpose="wiki"
                  value={section.mapImage}
                  onChange={(image) => {
                    const { mapImage: _removed, ...rest } = section;
                    set(
                      'wikiSections',
                      form.wikiSections.map((current, i) =>
                        i === index ? (image ? { ...rest, mapImage: image } : rest) : current,
                      ),
                    );
                  }}
                />
              ) : null}
            </Card>
          ))}
        </div>
      </TabPanel>
    </form>
  );
}
