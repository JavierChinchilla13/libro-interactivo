import { contactSettingsSchema, legalOwnerNameSchema, type ContactSettings } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { CheckField, TextField } from '../../../shared/ui/controls';
import { Alert, PageHeader } from '../../../shared/ui/layout';
import { keys, siteApi } from '../api';
import { SkeletonRows } from '../components/Skeleton';
import { FormSection } from '../components/FormSection';
import { HelpTip } from '../components/HelpTip';
import { SaveBar } from '../components/SaveBar';
import { useToast } from '../components/Toast';
import { useFormGuard } from '../components/useFormGuard';
import { errorMessage, fieldErrors } from '../errors';

const DEFAULTS: ContactSettings = { storeMessages: true, retentionDays: 365 };

interface ContactForm {
  email: string;
  store: boolean;
  days: string;
  ownerName: string;
}

/**
 * Contacto del sitio (solo administradores): adónde llegan los mensajes, cuánto se guardan y el nombre legal de la
 * titular que citan la privacidad y los términos (nunca se escribe en el código: el repositorio es público).
 */
export function ContactSettingsPage() {
  const settings = useQuery({
    queryKey: keys.site,
    queryFn: siteApi.get,
    staleTime: 0,
    gcTime: 0,
  });
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <SkeletonRows rows={4} />;
  return (
    <ContactFormView
      initial={settings.data.contact ?? DEFAULTS}
      ownerName={settings.data.legalOwnerName ?? ''}
    />
  );
}

function ContactFormView({ initial, ownerName }: { initial: ContactSettings; ownerName: string }) {
  const client = useQueryClient();
  const toast = useToast();
  const start: ContactForm = {
    email: initial.recipientEmail ?? '',
    store: initial.storeMessages,
    days: String(initial.retentionDays),
    ownerName,
  };
  const [form, setForm] = useState<ContactForm>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const guard = useFormGuard(form, start);
  const submitted = useRef(form);
  const save = useMutation({
    mutationFn: siteApi.update,
    onSuccess: (response) => {
      guard.markSaved(submitted.current);
      toast.success('Guardado');
      client.setQueryData(keys.site, response);
    },
  });
  const set = (patch: Partial<ContactForm>) => setForm((current) => ({ ...current, ...patch }));

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = contactSettingsSchema.safeParse({
      ...(form.email.trim() ? { recipientEmail: form.email.trim() } : {}),
      storeMessages: form.store,
      retentionDays: Number(form.days),
    });
    const owner = legalOwnerNameSchema.safeParse(form.ownerName);
    if (!parsed.success || !owner.success) {
      setErrors({
        ...(parsed.success ? {} : fieldErrors(parsed.error.issues)),
        ...(owner.success ? {} : { ownerName: owner.error.issues[0]?.message ?? 'No válido' }),
      });
      return;
    }
    setErrors({});
    submitted.current = form;
    // Solo se manda si cambió (guardar el contacto no toca el nombre). Vacío lo quita: las páginas legales vuelven a
    // mostrar el dato pendiente.
    const ownerChanged = owner.data !== guard.saved.ownerName.trim();
    save.mutate({ contact: parsed.data, ...(ownerChanged ? { legalOwnerName: owner.data } : {}) });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <PageHeader
        title="Contacto del sitio"
        subtitle="Mensajes de contacto: adónde llegan y cuánto tiempo se conservan. Y el nombre legal de la titular."
      />
      <div className="mb-4">
        <HelpTip>
          Lo que escribe alguien en el formulario de contacto del sitio llega a este correo. Si
          además guardas los mensajes aquí, los verás en «Mensajes» para marcarlos como atendidos.
        </HelpTip>
      </div>
      <FormSection
        title="Cómo llegan los mensajes"
        help="A qué correo llegan y cuánto tiempo se guardan en el panel."
      >
        <TextField
          label="Correo donde llegan los mensajes"
          type="email"
          value={form.email}
          hint="Si lo dejas vacío se usa el configurado por el desarrollador. No se muestra en el sitio."
          error={errors['recipientEmail']}
          onChange={(event) => set({ email: event.target.value })}
        />
        <CheckField
          label="Guardar los mensajes aquí en el panel"
          hint="Apagado, los mensajes solo llegan al correo y no quedan en «Mensajes»."
          checked={form.store}
          onChange={(value) => set({ store: value })}
        />
        <TextField
          label="Días que se guardan los mensajes"
          type="number"
          min={1}
          max={3650}
          value={form.days}
          hint="Pasado ese tiempo se borran solos (datos personales: conviene no guardarlos de más)."
          error={errors['retentionDays']}
          onChange={(event) => set({ days: event.target.value })}
        />
      </FormSection>
      <FormSection
        title="Titular de los textos legales"
        help="Aparece en la política de privacidad y en los términos de uso."
      >
        <TextField
          label="Nombre legal de la titular"
          maxLength={160}
          autoComplete="off"
          value={form.ownerName}
          hint="Tal como figura en su documento de identidad (o la razón social, si fuera una empresa). Se publica en /privacidad y /terminos. Si lo dejas vacío, esas páginas muestran un dato pendiente."
          error={errors['ownerName']}
          onChange={(event) => set({ ownerName: event.target.value })}
        />
      </FormSection>
      <SaveBar
        dirty={guard.dirty}
        saving={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onSave={() => submit()}
        onDiscard={() => {
          setForm(guard.saved);
          setErrors({});
        }}
        saveLabel="Guardar cambios"
      />
    </form>
  );
}
