import {
  fanArtInputSchema,
  type AdminFanArt,
  type FanArtInputPayload,
  type FanArtStatus,
  type ImageRefInput,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { thumbUrl } from '../../../shared/lib/cloudinary';
import {
  Button,
  CheckField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from '../../../shared/ui/layout';
import { booksApi, fanArtsApi, keys } from '../api';
import { ImageField } from '../components/MediaFields';
import { errorMessage, fieldErrors } from '../errors';

const STATUS_LABEL: Record<FanArtStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

/** Fan arts: los carga la autora; solo se publican con el permiso del artista. */
export function FanArtListPage() {
  const arts = useQuery({ queryKey: keys.fanArts, queryFn: () => fanArtsApi.list() });
  return (
    <>
      <PageHeader
        title="Fan arts"
        subtitle="Dibujos de lectores. Solo se muestran los publicados con el permiso del artista confirmado."
        actions={
          <Link to="/admin/fan-arts/nuevo" className="btn btn-primary">
            + Nuevo fan art
          </Link>
        }
      />
      {arts.isPending ? <Loading /> : null}
      {arts.isError ? <Alert>{errorMessage(arts.error)}</Alert> : null}
      {arts.data && arts.data.fanArts.length === 0 ? (
        <EmptyState title="Todavía no hay fan arts">
          Carga el primero con «Nuevo fan art».
        </EmptyState>
      ) : null}
      {arts.data && arts.data.fanArts.length > 0 ? (
        <div className="overflow-x-auto rounded-token-lg border border-border bg-surface">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  #
                </th>
                <th scope="col" className="px-4 py-3">
                  Dibujo
                </th>
                <th scope="col" className="px-4 py-3">
                  Permiso
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
              {arts.data.fanArts.map((art) => (
                <tr key={art.id} className="border-t border-border">
                  <td className="px-4 py-3 text-muted">{art.order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={thumbUrl(art.image.url, 96)}
                        alt=""
                        className="size-12 rounded-token object-cover"
                      />
                      <div>
                        <p className="font-medium">{art.title ?? 'Sin título'}</p>
                        <p className="text-xs text-muted">Por {art.artistName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {art.permissionConfirmed ? (
                      <Badge tone="success">Confirmado</Badge>
                    ) : (
                      <Badge tone="warning">Sin confirmar</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={art.status === 'published' ? 'success' : 'neutral'}>
                      {STATUS_LABEL[art.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/fan-arts/${art.id}`} className="underline">
                      Editar<span className="sr-only"> el fan art de {art.artistName}</span>
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

interface FanArtForm {
  title: string;
  image: ImageRefInput | undefined;
  artistName: string;
  artistLink: string;
  bookId: string;
  permissionConfirmed: boolean;
  permissionNote: string;
  order: string;
  status: FanArtStatus;
}

const emptyForm = (order: number): FanArtForm => ({
  title: '',
  image: undefined,
  artistName: '',
  artistLink: '',
  bookId: '',
  permissionConfirmed: false,
  permissionNote: '',
  order: String(order),
  status: 'draft',
});

const formFromArt = (art: AdminFanArt): FanArtForm => ({
  title: art.title ?? '',
  image: art.image,
  artistName: art.artistName,
  artistLink: art.artistLink ?? '',
  bookId: art.bookId ?? '',
  permissionConfirmed: art.permissionConfirmed,
  permissionNote: art.permissionNote ?? '',
  order: String(art.order),
  status: art.status,
});

/** Lo vacío no viaja (el servidor lo quita al reemplazar). */
export function fanArtPayload(form: FanArtForm): Partial<FanArtInputPayload> {
  return {
    ...(form.title.trim() ? { title: form.title.trim() } : {}),
    ...(form.image ? { image: form.image } : {}),
    artistName: form.artistName.trim(),
    ...(form.artistLink.trim() ? { artistLink: form.artistLink.trim() } : {}),
    ...(form.bookId ? { bookId: form.bookId } : {}),
    permissionConfirmed: form.permissionConfirmed,
    ...(form.permissionNote.trim() ? { permissionNote: form.permissionNote.trim() } : {}),
    order: Number(form.order) || 1,
    status: form.status,
  };
}

/** Carga el fan art (o la posición siguiente) y entrega el formulario con su valor inicial. */
export function FanArtFormPage() {
  const { fanArtId } = useParams();
  const editing = fanArtId !== undefined;
  const art = useQuery({
    queryKey: keys.fanArt(fanArtId ?? 'nuevo'),
    queryFn: () => fanArtsApi.get(fanArtId ?? ''),
    enabled: editing,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const all = useQuery({
    queryKey: keys.fanArts,
    queryFn: () => fanArtsApi.list(),
    enabled: !editing,
  });

  if (editing) {
    if (art.isError) return <Alert>{errorMessage(art.error)}</Alert>;
    if (!art.data) return <Loading />;
    return <FanArtFormView key={art.data.id} fanArtId={fanArtId} initial={formFromArt(art.data)} />;
  }
  if (all.isError) return <Alert>{errorMessage(all.error)}</Alert>;
  if (!all.data) return <Loading />;
  return <FanArtFormView key="nuevo" initial={emptyForm(all.data.fanArts.length + 1)} />;
}

function FanArtFormView({ fanArtId, initial }: { fanArtId?: string; initial: FanArtForm }) {
  const editing = fanArtId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const location = useLocation();
  const [form, setForm] = useState<FanArtForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(
    (location.state as { created?: boolean } | null)?.created === true,
  );
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const save = useMutation({
    mutationFn: (payload: FanArtInputPayload) =>
      editing ? fanArtsApi.replace(fanArtId, payload) : fanArtsApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.fanArts });
      setSaved(true);
      if (!editing) {
        void navigate(`/admin/fan-arts/${result.id}`, { replace: true, state: { created: true } });
      }
    },
  });
  const set = <K extends keyof FanArtForm>(key: K, value: FanArtForm[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = fanArtPayload(form);
    const parsed = fanArtInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(payload as FanArtInputPayload);
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader
        title={editing ? form.title || form.artistName || 'Fan art' : 'Nuevo fan art'}
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
        <div className="flex flex-col gap-1">
          <ImageField
            label="Dibujo"
            purpose="misc"
            value={form.image}
            onChange={(value) => set('image', value)}
          />
          {errors['image'] ? (
            <p role="alert" className="text-xs text-danger">
              {errors['image']}
            </p>
          ) : null}
        </div>
        <TextField
          label="Título (opcional)"
          maxLength={160}
          value={form.title}
          error={errors['title']}
          onChange={(event) => set('title', event.target.value)}
        />
        <TextField
          label="Nombre del artista"
          required
          maxLength={120}
          value={form.artistName}
          error={errors['artistName']}
          onChange={(event) => set('artistName', event.target.value)}
        />
        <TextField
          label="Enlace al perfil del artista (opcional)"
          type="url"
          value={form.artistLink}
          error={errors['artistLink']}
          onChange={(event) => set('artistLink', event.target.value)}
        />
        <CheckField
          label="El artista dio su permiso para publicarlo"
          hint="Obligatorio para publicar. Sin esto el dibujo no se muestra al público."
          checked={form.permissionConfirmed}
          onChange={(value) => set('permissionConfirmed', value)}
        />
        {errors['permissionConfirmed'] ? (
          <p role="alert" className="text-xs text-danger">
            {errors['permissionConfirmed']}
          </p>
        ) : null}
        <TextAreaField
          label="Nota sobre el permiso (privada)"
          hint="Cómo y cuándo se obtuvo. No se muestra al público."
          rows={2}
          maxLength={500}
          value={form.permissionNote}
          error={errors['permissionNote']}
          onChange={(event) => set('permissionNote', event.target.value)}
        />
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
            onChange={(event) => set('status', event.target.value as FanArtStatus)}
          />
        </div>
      </Card>
    </form>
  );
}
