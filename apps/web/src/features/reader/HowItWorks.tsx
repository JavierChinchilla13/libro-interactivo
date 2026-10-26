import './howItWorks.css';

/** Las mecánicas reales del panel, en el orden en que la lectora las vive. Nada del contenido del libro. */
const STEPS = [
  {
    title: 'Escanea el QR de tu libro',
    text: 'Cada quiz y el juego tienen su propio código QR, igual en todos los ejemplares. Al escanearlo con tu cuenta, queda abierto para ti.',
    note: '[PLACEHOLDER] Dónde está el código en tu ejemplar.',
  },
  {
    title: 'Haz los quizzes en orden',
    text: 'Cada quiz se abre al completar el anterior. Algunos se juegan una sola vez y otros se pueden repetir.',
  },
  {
    title: 'Descubre lo que se desbloquea',
    text: 'Al avanzar se abren partes de la wiki, y al completar un quiz con campo de poder verás «Tu campo».',
  },
  {
    title: 'Termina el libro y abre los extras',
    text: 'Cuando completas todos los quizzes y el juego, se abren los capítulos extra de ese libro.',
  },
] as const;

/**
 * «Cómo funciona»: cuatro pasos sobre el hilo de luz. Es una lista ordenada de HTML estático: el contenido completo se
 * ve sin JavaScript y con «reducir movimiento». Cada paso aparece al entrar en pantalla (solo CSS, ver `.how-step`).
 */
export function HowItWorks({ className = '' }: { className?: string }) {
  return (
    <section aria-labelledby="como-funciona" className={`flex flex-col gap-5 ${className}`}>
      <h2 id="como-funciona" className="section-title text-2xl">
        Cómo funciona
      </h2>
      <ol aria-labelledby="como-funciona" className="how-steps reveal-children">
        {STEPS.map((step, index) => (
          <li key={step.title} className="how-step">
            <span className="how-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <h3 className="font-semibold [overflow-wrap:anywhere]">{step.title}</h3>
            <p className="text-sm text-muted [overflow-wrap:anywhere]">{step.text}</p>
            {'note' in step ? (
              <p className="text-sm text-muted [overflow-wrap:anywhere]">{step.note}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
