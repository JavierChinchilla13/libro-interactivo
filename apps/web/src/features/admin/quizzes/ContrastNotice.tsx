import { formatDecimal } from '@libro/shared';
import type { contrastReport } from './appearanceForm';

const ratio = (value: number) => formatDecimal(value);

/** Contraste real de lo que verá la lectora con el velo y el acento elegidos (texto atenuado, principal y acento). */
export function ContrastNotice({
  report,
  title,
}: {
  report: ReturnType<typeof contrastReport>;
  title?: string;
}) {
  const basis =
    report.basis === 'measured'
      ? 'sobre la zona más clara de este fondo'
      : 'en el peor caso (un punto blanco del fondo)';
  return (
    <div
      role="status"
      className={`rounded-token border p-3 text-sm ${report.ok ? 'border-success/50' : 'border-warning'}`}
    >
      {title ? <p className="text-xs font-semibold text-muted">{title}</p> : null}
      <p className="font-medium">
        {report.ok ? 'El texto se lee bien' : 'Ojo: el texto podría leerse mal'}
      </p>
      <ul className="mt-1 text-muted tabular-nums">
        <li>
          Texto atenuado: {ratio(report.muted)}:1 {report.muted >= 4.5 ? '✓' : '(mínimo 4,5)'}
        </li>
        <li>
          Texto principal: {ratio(report.text)}:1 {report.text >= 4.5 ? '✓' : '(mínimo 4,5)'}
        </li>
        {report.accent !== undefined ? (
          <li>
            Acento (títulos y bordes): {ratio(report.accent)}:1{' '}
            {report.accent >= 3 ? 'cumple' : '(mínimo 3)'}
          </li>
        ) : null}
      </ul>
      <p className="mt-1 text-xs text-muted">Calculado {basis}.</p>
    </div>
  );
}
