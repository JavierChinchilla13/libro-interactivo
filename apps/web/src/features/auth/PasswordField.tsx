import { useId, useState } from 'react';
import { passwordStrength } from '../../shared/lib/passwordStrength';
import { Field, fieldClass } from '../../shared/ui/controls';

const BAR_COLORS = ['bg-border', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'] as const;

/**
 * Contraseña con botón «Mostrar/Ocultar» y, si se pide, medidor orientativo. Avisa con los mismos mensajes del
 * servidor, pero el servidor es quien manda: esto solo ayuda a elegir una buena antes de enviar.
 */
export function PasswordField({
  label,
  value,
  onChange,
  error,
  context,
  showMeter = false,
  autoComplete = 'new-password',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  context?: { name?: string; email?: string };
  showMeter?: boolean;
  autoComplete?: string;
}) {
  const meterId = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value, context);
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} error={error} required>
        {({ id, describedBy, invalid }) => (
          <div className="relative">
            <input
              id={id}
              type={visible ? 'text' : 'password'}
              required
              autoComplete={autoComplete}
              value={value}
              aria-invalid={invalid || undefined}
              aria-describedby={
                [describedBy, showMeter ? meterId : undefined].filter(Boolean).join(' ') ||
                undefined
              }
              onChange={(event) => onChange(event.target.value)}
              className={`${fieldClass} pr-24`}
            />
            <button
              type="button"
              aria-pressed={visible}
              aria-controls={id}
              onClick={() => setVisible((current) => !current)}
              className="absolute inset-y-0 right-1 my-auto inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-(--token-dur-fast) ease-token-out hover:text-text"
            >
              {visible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        )}
      </Field>
      {showMeter ? (
        <div id={meterId} aria-live="polite" data-testid="password-meter">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((bar) => (
              <span
                key={bar}
                className={`h-1.5 flex-1 rounded-full ${bar <= strength.level ? BAR_COLORS[strength.level] : 'bg-border'}`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            {strength.level === 0
              ? 'Mínimo 10 caracteres. Sin contraseñas comunes ni tu nombre.'
              : `Seguridad: ${strength.label.toLowerCase()}`}
          </p>
          {strength.problems.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-danger">
              {strength.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
