import { createQuizRequestSchema } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, CheckField, SelectField, TextField } from '../../../shared/ui/controls';
import { Alert, Card, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, keys, quizzesApi } from '../api';
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

  function submit(event: FormEvent) {
    event.preventDefault();
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

  if (books.isPending) return <Loading />;
  if (books.isError) return <Alert>{errorMessage(books.error)}</Alert>;

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader title="Nuevo quiz" />
      <Card className="flex flex-col gap-4">
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
          label="Dirección (slug)"
          required
          value={slug}
          error={errors['slug']}
          hint="Se genera del título; editable."
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
        />
        <TextField
          label="Posición en la secuencia"
          type="number"
          min={1}
          value={order}
          error={errors['order']}
          hint="Define cuándo se desbloquea respecto a los demás quizzes."
          onChange={(event) => setOrder(event.target.value)}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Reglas del quiz</legend>
          <CheckField
            label="Se puede repetir"
            hint="Si lo desactivas, el quiz se juega una sola vez."
            checked={allowRetake}
            onChange={setAllowRetake}
          />
          <CheckField
            label="Mostrar el porcentaje de cada resultado al terminar"
            checked={showBreakdown}
            onChange={setShowBreakdown}
          />
          <p className="text-xs text-muted">
            Se pueden cambiar después; rigen desde la siguiente publicación.
          </p>
        </fieldset>
        {create.isError ? <Alert>{errorMessage(create.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending}>
            Crear quiz
          </Button>
          <Button variant="secondary" onClick={() => void navigate('/admin/quizzes')}>
            Cancelar
          </Button>
        </div>
      </Card>
    </form>
  );
}
