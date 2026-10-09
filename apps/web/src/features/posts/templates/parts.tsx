import {
  POST_CATEGORY_LABELS,
  postTemplates,
  type PostDetail,
  type PostTemplate,
} from '@libro/shared';
import type { ReactNode } from 'react';
import { formatShortDate } from '../../../shared/lib/dates';
import { Badge } from '../../../shared/ui/layout';

/** Datos de una plantilla leídos con el esquema de borrador: nunca revienta aunque falte algo. */
export function templateData<T>(template: PostTemplate, data: unknown): Partial<T> {
  const parsed = postTemplates[template].draft.safeParse(data);
  return parsed.success ? (parsed.data as Partial<T>) : {};
}

/** Tipo, título y fecha: el encabezado común de todas las plantillas. */
export function PostHeader({
  post,
  preview = false,
}: {
  post: PostDetail;
  preview?: boolean | undefined;
}) {
  const Title = preview ? 'h2' : 'h1';
  return (
    <header className="flex flex-col gap-2">
      <Badge tone={post.category === 'evento' ? 'warning' : 'neutral'}>
        {POST_CATEGORY_LABELS[post.category]}
      </Badge>
      <Title className="font-display text-3xl font-bold sm:text-4xl">{post.title}</Title>
      <p className="text-sm text-muted">{formatShortDate(post.publishedAt)}</p>
    </header>
  );
}

/** Contenedor de la publicación: ancho de lectura cómodo. */
export function PostFrame({ children }: { children: ReactNode }) {
  return <article className="mx-auto flex max-w-2xl flex-col gap-5">{children}</article>;
}

export const buttonLink =
  'inline-flex min-h-11 items-center justify-center rounded-token px-4 text-sm font-semibold';
export const primaryLink = `${buttonLink} bg-primary text-primary-contrast`;
export const secondaryLink = `${buttonLink} border border-border bg-surface text-text`;
