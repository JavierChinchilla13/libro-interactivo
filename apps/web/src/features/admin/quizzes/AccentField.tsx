import { HEX_COLOR, QUICK_ACCENTS } from '@libro/shared';
import { useId, useState, type ReactNode } from 'react';
import type { ReadableAccent } from '../../../shared/lib/accent';
import { PALETTE } from '../../../shared/lib/color';

/** Opción en forma de pastilla: el radio nativo queda oculto para la vista (pero sigue siendo el control del teclado). */
export function Chip({
  name,
  checked,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-(--token-dur-fast) ease-token-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        checked ? 'border-primary bg-surface-alt text-text' : 'border-border text-muted'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
    </label>
  );
}

/** Lo que escribe la persona → `#rrggbb` (acepta con o sin `#` y en mayúsculas), o `undefined` si no es válido. */
export function parseHex(raw: string): string | undefined {
  const text = raw.trim();
  const withHash = text.startsWith('#') ? text : `#${text}`;
  return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : undefined;
}

/**
 * Color de acento libre: selector nativo (con una muestra grande), campo con el código `#RRGGBB` (lo único que se
 * muestra como «número del color») y colores rápidos. Si el color elegido no se leería sobre el fondo ya velado, el
 * sistema lo aclara lo mínimo: aquí se avisa («Ajustamos tu color para que se lea») con el antes y el después.
 */
export function AccentField({
  value,
  onChange,
  result,
  backdrop,
  disabled,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Lo que se pintará de verdad (con el ajuste mínimo), o `undefined` sin acento. */
  result: ReadableAccent | undefined;
  /** Color del fondo ya velado contra el que se lee el acento. */
  backdrop: string;
  disabled?: boolean;
}) {
  const id = useId();
  // Mientras se escribe se muestra lo tecleado; al ser válido (o al salir) se vuelve al valor guardado.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? (value ? value.toUpperCase() : '');
  const invalid = typed !== null && typed.trim() !== '' && parseHex(typed) === undefined;
  const choose = (hex: string | undefined) => {
    setTyped(null);
    onChange(hex);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="sr-only">Color de acento</legend>
      <div className="flex flex-wrap items-start gap-4">
        <label
          className="flex flex-col items-center gap-1 text-xs text-muted"
          htmlFor={`${id}-color`}
        >
          <input
            id={`${id}-color`}
            type="color"
            aria-label="Elegir el color con el selector"
            value={value ?? PALETTE.bg}
            onChange={(event) => choose(event.target.value.toLowerCase())}
            className="size-16 cursor-pointer rounded-token border border-border bg-transparent p-1"
          />
          Selector
        </label>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor={`${id}-hex`} className="text-sm font-medium">
            Código del color
          </label>
          <input
            id={`${id}-hex`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
            placeholder="#A89BFF"
            value={shown}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => {
              const text = event.target.value;
              const hex = parseHex(text);
              if (hex) choose(hex);
              else if (text.trim() === '') choose(undefined);
              else setTyped(text);
            }}
            onBlur={() => setTyped(null)}
            className="min-h-11 rounded-xl border border-border bg-bg/60 px-3.5 font-mono text-base uppercase text-text focus:border-primary focus:shadow-focus focus:outline-none"
          />
          {invalid ? (
            <p id={`${id}-error`} className="text-sm text-danger">
              Escribe un código de 6 cifras, como #A89BFF (0-9 y A-F).
            </p>
          ) : (
            <p className="text-xs text-muted">Vacío = el color por defecto del sitio.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colores rápidos">
        <Chip name={`${id}-quick`} checked={value === undefined} onSelect={() => choose(undefined)}>
          <span aria-hidden="true" className="size-3.5 rounded-full border border-border" />
          Por defecto
        </Chip>
        {QUICK_ACCENTS.map((color) => (
          <Chip
            key={color.hex}
            name={`${id}-quick`}
            checked={value === color.hex}
            onSelect={() => choose(color.hex)}
          >
            <span
              aria-hidden="true"
              className="size-3.5 rounded-full border border-border"
              style={{ background: color.hex }}
            />
            {color.name}
          </Chip>
        ))}
      </div>

      {result ? (
        <div
          role="status"
          className={`rounded-token border p-3 text-sm ${result.adjusted ? 'border-warning' : 'border-success/50'}`}
        >
          {result.adjusted && value ? (
            <>
              <p className="font-medium">Ajustamos tu color para que se lea</p>
              <p className="text-muted">
                Sobre este fondo tu color no se distinguiría bien; le subimos lo mínimo de claridad.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Sample label="Tu color" hex={value} backdrop={backdrop} />
                <span aria-hidden="true">→</span>
                <Sample label="Se verá así" hex={result.hex} backdrop={backdrop} />
              </div>
            </>
          ) : (
            <p className="font-medium">El color se lee bien sobre el fondo</p>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}

function Sample({ label, hex, backdrop }: { label: string; hex: string; backdrop: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span
        className="inline-flex items-center gap-2 rounded-token px-3 py-2 text-lg font-semibold"
        style={{ background: backdrop, color: hex, border: `2px solid ${hex}` }}
      >
        Título
        <span className="font-mono text-xs">{hex.toUpperCase()}</span>
      </span>
    </div>
  );
}
