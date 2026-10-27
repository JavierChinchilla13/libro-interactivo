import {
  fanArtInputSchema,
  type AdminFanArt,
  type FanArtInputPayload,
  type FanArtStatus,
  type ImageRefInput,
} from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { thumbUrl } from '../../../shared/lib/cloudinary';
import { CheckField, SelectField, TextAreaField, TextField } from '../../../shared/ui/controls';
import { Alert, PageHeader } from '../../../shared/ui/layout';
import { FormSection } from '../components/FormSection';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { DataList, type Column } from '../components/DataList';
import { ListPage, useRowSearch } from '../components/ListPage';
import { StatusBadge } from '../components/StatusBadge';
import { booksApi, fanArtsApi, keys } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { ImageField } from '../components/MediaFields';
import { errorMessage, fieldErrors } from '../errors';

const STATUS_LABEL: Record<FanArtStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const useFanArts = () => useQuery({ queryKey: keys.fanArts, queryFn: () => fanArtsApi.list() });
type FanArtRow = NonNullable<ReturnType<typeof useFanArts>['data']>['fanArts'][number];

const fanArtColumns: Column<FanArtRow>[] = [
  {
    id: 'order',
    header: '#',
    role: 'table',
    className: 'admin-cell-num',
    cell: (art) => art.order,
  },
  {
    id: 'art',
    header: 'Dibujo',
    role: 'title',
    cell: (art) => (
      <span className="flex items-center gap-3">
        <img
          src={thumbUrl(art.image.url, 96)}
          alt=""
          className="size-12 shrink-0 rounded-token object-cover"
        />
        <span className="min-w-0">
          <span className="admin-cell-title">{art.title ?? 'Sin título'}</span>
          <span className="admin-cell-sub">Por {art.artistName}</span>
        </span>
      </span>
    ),
  },
  {
    id: 'permission',
    header: 'Permiso',
    role: 'status',
    cell: (art) =>
      art.permissionConfirmed ? (
        <StatusBadge status="active" label="Permiso confirmado" />
      ) : (
        <StatusBadge status="pending" label="Sin confirmar" />
      ),
  },
  {
    id: 'status',
    header: 'Estado',
    role: 'status',
    cell: (art) => <StatusBadge status={art.status} />,
  },
];

/** Fan arts: los carga la autora; solo se publican con el permiso del artista. */
export function FanArtListPage() {
  const arts = useFanArts();
  const search = useRowSearch(arts.data?.fanArts, (art) => `${art.title ?? ''} ${art.artistName}`);
  return (
    <ListPage
      title="Fan arts"
      subtitle="Dibujos de lectores. Solo se muestran los publicados con el permiso del artista confirmado."
      primaryAction={
        <Link to="/admin/fan-arts/nuevo" className="btn btn-primary">
          + Nuevo fan art
        </Link>
      }
      toolbar={search.field}
      state={arts}
      count={search.visible?.length}
      filtersActive={search.active}
      onClearFilters={search.clear}
      empty={{
        icon: 'art',
        title: 'Todavía no hay fan arts',
        text: 'Carga el primero y confirma el permiso del artista para publicarlo.',
        action: (
          <Link to="/admin/fan-arts/nuevo" className="btn btn-primary">
            Cargar el primer fan art
          </Link>
        ),
      }}
    >
      <DataList
        label="Fan arts"
        rows={search.visible ?? []}
        rowKey={(art) => art.id}
        columns={fanArtColumns}
        action={{
          to: (art) => `/admin/fan-arts/${art.id}`,
          name: (art) => `el fan art de ${art.artistName}`,
        }}
      />
    </ListPage>
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
    if (!art.data) return <SkeletonRows rows={4} />;
    return <FanArtFormView key={art.data.id} fanArtId={fanArtId} initial={formFromArt(art.data)} />;
  }
  if (all.isError) return <Alert>{errorMessage(all.error)}</Alert>;
  if (!all.data) return <SkeletonRows rows={4} />;
  return <FanArtFormView key="nuevo" initial={emptyForm(all.data.fanArts.length + 1)} />;
}

function FanArtFormView({ fanArtId, initial }: { fanArtId?: string; initial: FanArtForm }) {
  const editing = fanArtId !== undefined;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form, setForm] = useState<FanArtForm>(initial);
  const guard = useFormGuard(form, initial);
  const toast = useToast();
  const submitted = useRef(form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const books = useQuery({ queryKey: keys.books, queryFn: booksApi.list });
  const save = useMutation({
    mutationFn: (payload: FanArtInputPayload) =>
      editing ? fanArtsApi.replace(fanArtId, payload) : fanArtsApi.create(payload),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: keys.fanArts });
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      if (!editing) {
        guard.allowLeave();
        void navigate(`/admin/fan-arts/${result.id}`, { replace: true, state: { created: true } });
      }
    },
  });
  const set = <K extends keyof FanArtForm>(key: K, value: FanArtForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const payload = fanArtPayload(form);
    const parsed = fanArtInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    submitted.current = form;
    save.mutate(payload as FanArtInputPayload);
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader title={editing ? form.title || form.artistName || 'Fan art' : 'Nuevo fan art'} />
      <FormSection title="El dibujo" help="Imagen, artista y el permiso para publicarlo.">
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
      </FormSection>
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
        saveLabel="Guardar fan art"
      />
    </form>
  );
}
