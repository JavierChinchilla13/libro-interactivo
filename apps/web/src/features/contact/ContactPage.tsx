import { ContactForm } from '../home/ContactForm';

/** Página de contacto: el mismo formulario de la landing, en su propia dirección. */
export function ContactPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Contacto</h1>
        <p className="mt-1 text-muted">Escríbele a la autora: tu mensaje le llega por correo.</p>
      </div>
      <ContactForm />
    </div>
  );
}
