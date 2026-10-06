import { Button, TextField } from '../../../shared/ui/controls';
import { moveItem } from '../quizzes/draft';

/** Lista de líneas de texto que se puede ordenar y ampliar (secuencia de revelado). */
export function StringListEditor({
  label,
  addLabel,
  items,
  onChange,
  max = 12,
}: {
  label: string;
  addLabel: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  max?: number;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      {items.map((line, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextField
            wrapperClassName="flex-1"
            label={`Línea ${index + 1}`}
            value={line}
            maxLength={300}
            onChange={(event) =>
              onChange(items.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
          <Button
            variant="ghost"
            aria-label={`Subir la línea ${index + 1}`}
            disabled={index === 0}
            onClick={() => onChange(moveItem(items, index, -1))}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            aria-label={`Bajar la línea ${index + 1}`}
            disabled={index === items.length - 1}
            onClick={() => onChange(moveItem(items, index, 1))}
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            aria-label={`Quitar la línea ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            ✕
          </Button>
        </div>
      ))}
      {items.length < max ? (
        <Button variant="secondary" className="self-start" onClick={() => onChange([...items, ''])}>
          + {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}
