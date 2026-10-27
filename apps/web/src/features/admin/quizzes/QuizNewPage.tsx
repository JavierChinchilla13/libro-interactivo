import { createQuizRequestSchema } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, CheckField, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, PageHeader } from '../../../shared/ui/layout';
import { booksApi, keys, quizzesApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { errorMessage, fieldErrors, slugify } from '../errors';

/** «Nuevo quiz»: la regla «¿Se puede repetir?» se elige desde el inicio. */
export function QuizNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const [bookId, setBookId] = useState(params.get('libro') ?? '');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [order, setOrder] = useState('1');
  const [allowRetake, setAllowRetake] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const chosen = bookId || books.data?.books[0]?.id || '';
  const create = useMutation({
    mutationFn: quizzesApi.create,
    onSuccess: async (quiz) => {
      await client.invalidateQueries({ queryKey: keys.quizzes(quiz.bookId) });
      void navigate(`/admin/quizzes/${quiz.id}`, { replace: true });
    },
  });

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = {
      bookId: chosen,
      slug,
      order: Number(order),
      title: title.trim(),
      settings: { allowRetake, showBreakdown },
    };
    const parsed = createQuizRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  if (books.isPending) return <SkeletonRows rows={4} />;
  if (books.isError) return <Alert>{errorMessage(books.error)}</Alert>;

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader title="Nuevo quiz" />
      <FormSection
        title="Datos del quiz"
        help="Dónde va, cómo se llama y cuántas veces se puede jugar."
      >
        <SelectField
          label="Libro"
          required
          value={chosen}
          error={errors['bookId']}
          options={(books.data?.books ?? []).map((book) => ({ value: book.id, label: book.title }))}
          onChange={(event) => setBookId(event.target.value)}
        />
        <TextField
          label="Título"
          required
          value={title}
          error={errors['title']}
          onChange={(event) => {
            setTitle(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
        />
        <TextField
          label="Dirección web"
          required
          value={slug}
          error={errors['slug']}
          hint="La parte final del enlace. Se arma sola con el título."
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
        />
        <TextField
          label="Posición"
          type="number"
          min={1}
          value={order}
          error={errors['order']}
          hint="El quiz 2 se abre al completar el 1. Aquí eliges el lugar de este."
          onChange={(event) => setOrder(event.target.value)}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Reglas del quiz</legend>
          <CheckField
            label="Se puede repetir"
            hint="Si lo apagas, cada lectora lo juega una sola vez."
            checked={allowRetake}
            onChange={setAllowRetake}
          />
          <CheckField
            label="Mostrar el porcentaje de cada resultado"
            hint="Al terminar, la lectora ve cuánto de cada resultado sacó."
            checked={showBreakdown}
            onChange={setShowBreakdown}
          />
          <p className="text-xs text-muted">
            Se pueden cambiar después; rigen desde la siguiente publicación.
          </p>
        </fieldset>
      </FormSection>
      <SaveBar
        dirty
        dirtyLabel="Aún no se ha creado"
        saving={create.isPending}
        error={create.isError ? errorMessage(create.error) : null}
        onSave={() => submit()}
        saveLabel="Crear quiz"
        savingLabel="Creando…"
      >
        <Button variant="secondary" onClick={() => void navigate('/admin/quizzes')}>
          Cancelar
        </Button>
      </SaveBar>
    </form>
  );
}
