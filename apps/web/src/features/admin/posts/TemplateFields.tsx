import type { ImageRefInput, PostTemplate } from '@libro/shared';
import type { ComponentType } from 'react';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { moveItem } from '../quizzes/draft';
import type { PostFormData } from './postForm';

/**
 * Los campos propios de cada plantilla. Una plantilla = su esquema en `@libro/shared`,
 * su componente en la web pública y estos campos. Cada formulario edita `data` y muestra los errores de `data.<campo>`.
 */
export interface FieldsProps {
  data: PostFormData;
  set: (key: string, value: unknown) => void;
  errors: Record<string, string>;
}

const str = (data: PostFormData, key: string) =>
  typeof data[key] === 'string' ? (data[key] as string) : '';
const image = (data: PostFormData, key: string) => data[key] as ImageRefInput | undefined;
const error = (errors: Record<string, string>, key: string) => errors[`data.${key}`];

function Body({ data, set, errors, label = 'Texto' }: FieldsProps & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <RichTextEditor
        label={label}
        value={str(data, 'bodyHtml')}
        onChange={(v) => set('bodyHtml', v)}
      />
      {error(errors, 'bodyHtml') ? (
        <p role="alert" className="text-xs text-danger">
          {error(errors, 'bodyHtml')}
        </p>
      ) : null}
    </div>
  );
}

function Picture({
  label,
  field,
  data,
  set,
  errors,
  hint,
}: FieldsProps & { label: string; field: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <ImageField
        label={label}
        purpose="post"
        value={image(data, field)}
        onChange={(v) => set(field, v)}
        {...(hint ? { hint } : {})}
      />
      {error(errors, field) ? (
        <p role="alert" className="text-xs text-danger">
          {error(errors, field)}
        </p>
      ) : null}
    </div>
  );
}

function TextFields(props: FieldsProps) {
  return <Body {...props} />;
}

function FeaturedImageFields(props: FieldsProps) {
  const { data, set, errors } = props;
  return (
    <>
      <Picture {...props} label="Imagen destacada" field="image" />
      <TextField
        label="Pie de la imagen"
        maxLength={200}
        value={str(data, 'caption')}
        error={error(errors, 'caption')}
        onChange={(event) => set('caption', event.target.value)}
      />
      <Body {...props} />
    </>
  );
}

interface GalleryItem {
  image?: ImageRefInput;
  caption?: string;
}

function GalleryFields(props: FieldsProps) {
  const { data, set, errors } = props;
  const items = (Array.isArray(data['images']) ? data['images'] : []) as GalleryItem[];
  const update = (next: GalleryItem[]) => set('images', next);
  return (
    <>
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">Fotos</legend>
        {items.map((item, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-token border border-border p-3">
            <ImageField
              label={`Foto ${index + 1}`}
              purpose="post"
              value={item.image}
              onChange={(value) =>
                update(items.map((it, i) => (i === index ? { ...it, image: value } : it)))
              }
            />
            <TextField
              label={`Pie de la foto ${index + 1}`}
              maxLength={200}
              value={item.caption ?? ''}
              onChange={(event) =>
                update(
                  items.map((it, i) => (i === index ? { ...it, caption: event.target.value } : it)),
                )
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={index === 0}
                onClick={() => update(moveItem(items, index, -1))}
              >
                ↑<span className="sr-only"> Subir la foto {index + 1}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={index === items.length - 1}
                onClick={() => update(moveItem(items, index, 1))}
              >
                ↓<span className="sr-only"> Bajar la foto {index + 1}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => update(items.filter((_, i) => i !== index))}
              >
                Quitar<span className="sr-only"> la foto {index + 1}</span>
              </Button>
            </div>
          </div>
        ))}
        {error(errors, 'images') ? (
          <p role="alert" className="text-xs text-danger">
            {error(errors, 'images')}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => update([...items, {}])}
        >
          + Agregar foto
        </Button>
      </fieldset>
      <Body {...props} label="Texto (opcional)" />
    </>
  );
}

function EventFields(props: FieldsProps) {
  const { data, set, errors } = props;
  const text = (
    key: string,
    label: string,
    extra: { type?: string; hint?: string; max?: number } = {},
  ) => (
    <TextField
      label={label}
      type={extra.type ?? 'text'}
      maxLength={extra.max ?? 300}
      hint={extra.hint}
      value={str(data, key)}
      error={error(errors, key)}
      onChange={(event) => set(key, event.target.value)}
    />
  );
  return (
    <>
      {text('venue', 'Lugar', { max: 160 })}
      <div className="grid gap-4 sm:grid-cols-2">
        {text('startsAt', 'Inicia', { type: 'datetime-local', hint: 'Hora de Costa Rica' })}
        {text('endsAt', 'Termina (opcional)', { type: 'datetime-local' })}
      </div>
      {text('address', 'Dirección')}
      {text('mapUrl', 'Enlace al mapa', { type: 'url' })}
      {text('link', 'Enlace de más información', { type: 'url' })}
      <Body {...props} />
    </>
  );
}

function InvitationFields(props: FieldsProps) {
  const { data, set, errors } = props;
  return (
    <>
      <Body {...props} />
      <Picture {...props} label="Imagen de la invitación (opcional)" field="image" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Texto del botón"
          maxLength={60}
          value={str(data, 'ctaLabel')}
          error={error(errors, 'ctaLabel')}
          onChange={(event) => set('ctaLabel', event.target.value)}
        />
        <TextField
          label="Enlace del botón"
          type="url"
          value={str(data, 'ctaUrl')}
          error={error(errors, 'ctaUrl')}
          onChange={(event) => set('ctaUrl', event.target.value)}
        />
      </div>
      <TextField
        label="Fecha límite para confirmar (opcional)"
        type="datetime-local"
        hint="Hora de Costa Rica"
        value={str(data, 'deadline')}
        error={error(errors, 'deadline')}
        onChange={(event) => set('deadline', event.target.value)}
      />
    </>
  );
}

function AnnouncementFields(props: FieldsProps) {
  const { data, set, errors } = props;
  return (
    <>
      <SelectField
        label="Qué se anuncia"
        value={str(data, 'announces') || 'extra'}
        error={error(errors, 'announces')}
        options={[
          { value: 'extra', label: 'Un capítulo extra' },
          { value: 'book', label: 'Un libro nuevo' },
        ]}
        hint="Un extra aclara que se desbloquea al completar todo el libro. No se publica su título."
        onChange={(event) => set('announces', event.target.value)}
      />
      <Picture {...props} label="Portada o ícono (opcional)" field="image" />
      <TextField
        label="Texto del botón"
        maxLength={60}
        hint="Si lo dejas vacío dice «Ver ahora»."
        value={str(data, 'ctaLabel')}
        error={error(errors, 'ctaLabel')}
        onChange={(event) => set('ctaLabel', event.target.value)}
      />
      <Body {...props} label="Texto (opcional)" />
    </>
  );
}

export const templateFields: Record<PostTemplate, ComponentType<FieldsProps>> = {
  text: TextFields,
  featured_image: FeaturedImageFields,
  gallery: GalleryFields,
  event: EventFields,
  invitation: InvitationFields,
  announcement: AnnouncementFields,
};
