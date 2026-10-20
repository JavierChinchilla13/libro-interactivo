import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { FieldStage } from '../../shared/ui/FieldStage';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Alert, Loading } from '../../shared/ui/layout';
import { useSession } from '../auth/session';
import { wikiApi, wikiKeys } from './api';
import { LockedNotice } from './LockedNotice';
import { SECTION_SLUGS, sectionOfEntry } from './sections';
import { LockIcon } from '../../shared/ui/icons';

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <p className="text-sm">
      <Link to={to} className="underline">
        ← {label}
      </Link>
    </p>
  );
}

/** Ficha de una entrada: imagen, nombre, tipo, texto saneado, datos y las entradas relacionadas. */
export function WikiEntryPage() {
  const { entryId = '' } = useParams();
  const viewer = useSession().data?.id ?? 'visitante';
  const query = useQuery({
    queryKey: wikiKeys.entry(viewer, entryId),
    queryFn: () => wikiApi.entry(entryId),
    retry: false,
  });

  if (query.isPending) return <Loading />;
  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiClientError && error.code === 'NOT_UNLOCKED') {
      return (
        <div className="flex flex-col gap-4">
          <BackLink to="/wiki" label="Wiki del universo" />
          <LockedNotice title="Esta entrada está bloqueada" />
        </div>
      );
    }
    const missing = error instanceof ApiClientError && error.code === 'NOT_FOUND';
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/wiki" label="Wiki del universo" />
        <Alert>{missing ? 'No encontramos esa entrada.' : errorMessage(error)}</Alert>
      </div>
    );
  }

  const { entry, related } = query.data;
  const back = `/wiki/${SECTION_SLUGS[sectionOfEntry(entry.kind)]}`;

  const image = entry.image ? (
    <img
      src={thumbUrl(entry.image.url, 900)}
      alt={entry.image.alt}
      width={entry.image.width}
      height={entry.image.height}
      className="img-frame h-auto max-h-96 w-auto max-w-full self-start rounded-token-md"
    />
  ) : null;
  const heading = (
    <div>
      {entry.group ? <p className="text-sm text-muted">{entry.group}</p> : null}
      <h1 className="page-title">{entry.name}</h1>
      {entry.summary ? <p className="mt-1 text-muted">{entry.summary}</p> : null}
    </div>
  );
  const details = (
    <>
      {entry.bodyHtml ? <SafeHtml html={entry.bodyHtml} /> : null}
      {entry.fields.length > 0 ? (
        <dl className="divide-y divide-line border-y border-line">
          {entry.fields.map((field, index) => (
            <div
              key={index}
              className="grid gap-1 py-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-4"
            >
              <dt className="text-sm text-muted">{field.label}</dt>
              <dd className="font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {related.length > 0 ? (
        <section aria-labelledby="relacionado-title">
          <h2 id="relacionado-title" className="mb-2 text-lg font-semibold">
            Relacionado
          </h2>
          <ul className="flex flex-col gap-2">
            {related.map((item) =>
              item.locked ? (
                <li key={item.id} className="flex items-center gap-1.5 text-sm text-muted">
                  <LockIcon className="size-4" />
                  Bloqueado
                </li>
              ) : (
                <li key={item.id}>
                  <Link to={`/wiki/entrada/${item.id}`} className="underline">
                    {item.name}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}
    </>
  );

  // Un campo de poder con fondo animado: la animación con el título encima y, debajo, un color sólido con la información.
  if (entry.visualKey) {
    return (
      <article className="mx-auto flex max-w-3xl flex-col gap-5">
        <BackLink to={back} label="Volver a la wiki" />
        <div>
          <FieldStage visualKey={entry.visualKey}>{heading}</FieldStage>
          <div className="field-sheet flex flex-col gap-5">
            {image}
            {details}
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5">
      <BackLink to={back} label="Volver a la wiki" />
      {image}
      {heading}
      {details}
    </article>
  );
}
