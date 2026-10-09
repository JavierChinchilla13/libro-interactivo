import { contactRequestSchema } from '@libro/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorMessage, fieldErrors } from '../../shared/api/messages';
import { Button, TextAreaField, TextField } from '../../shared/ui/controls';
import { Alert } from '../../shared/ui/layout';
import { publicApi } from './api';

/**
 * Formulario de contacto. Lleva un campo trampa oculto (`website`) y la hora en que se mostró
 * el formulario: el servidor descarta en silencio lo que parece de un bot. Los límites y mensajes son los del API.
 */
export function ContactForm() {
  const [startedAt] = useState(() => Date.now());
  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = useMutation({ mutationFn: publicApi.contact });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = contactRequestSchema.safeParse({ ...form, startedAt });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    send.mutate(parsed.data, {
      onSuccess: () => setForm({ name: '', email: '', message: '', website: '' }),
    });
  }

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  if (send.isSuccess) {
    return (
      <Alert tone="success" title="Gracias, recibimos tu mensaje.">
        La autora lo leerá y te responderá al correo que indicaste.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Nombre completo"
        required
        autoComplete="name"
        maxLength={80}
        value={form.name}
        error={errors['name']}
        onChange={(event) => set({ name: event.target.value })}
      />
      <TextField
        label="Correo electrónico"
        required
        type="email"
        autoComplete="email"
        value={form.email}
        error={errors['email']}
        onChange={(event) => set({ email: event.target.value })}
      />
      <TextAreaField
        label="Mensaje"
        required
        rows={5}
        maxLength={5000}
        value={form.message}
        error={errors['message']}
        onChange={(event) => set({ message: event.target.value })}
      />
      {/* Campo trampa: invisible para las personas y fuera del orden del teclado. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No llenar este campo
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => set({ website: event.target.value })}
          />
        </label>
      </div>
      {send.isError ? <Alert>{errorMessage(send.error)}</Alert> : null}
      <Button type="submit" loading={send.isPending} className="self-start">
        Enviar mensaje
      </Button>
    </form>
  );
}
