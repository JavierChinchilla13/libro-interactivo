import { useId } from 'react';
import { passwordStrength } from '../../shared/lib/passwordStrength';
import { TextField } from '../../shared/ui/controls';

const BAR_COLORS = ['bg-border', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'] as const;

/**
 * Contraseña con medidor orientativo. Avisa con los mismos mensajes del servidor, pero el servidor es quien manda:
 * esto solo ayuda a elegir una buena antes de enviar.
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
  const strength = passwordStrength(value, context);
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={label}
        type="password"
        required
        autoComplete={autoComplete}
        value={value}
        error={error}
        aria-describedby={showMeter ? meterId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
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
