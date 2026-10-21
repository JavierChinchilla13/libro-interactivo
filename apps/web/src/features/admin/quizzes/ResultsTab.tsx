import { useQuery } from '@tanstack/react-query';
import { Button, SelectField, TextField } from '../../../shared/ui/controls';
import { Card, EmptyState } from '../../../shared/ui/layout';
import { keys, wikiApi } from '../api';
import { MediaField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { StringListEditor } from '../components/StringListEditor';
import { addResult, removeResult, updateResult, type Draft, type DraftResult } from './draft';

/** Pestaña «Resultados»: título, descripción, secuencia de revelado, datos e imagen o video corto. */
export function ResultsTab({
  draft,
  bookId,
  onChange,
}: {
  draft: Draft;
  bookId: string;
  onChange: (draft: Draft) => void;
}) {
  const fields = useQuery({
    queryKey: [...keys.wiki, 'power_field', bookId],
    queryFn: () => wikiApi.list({ kind: 'power_field', bookId }),
  });
  if (draft.stages.length === 0) {
    return (
      <EmptyState title="Primero agrega una etapa">
        Los resultados pertenecen a una etapa: en la pestaña «Etapas y preguntas» crea la primera.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {draft.stages.map((stage) => {
        const results = draft.results.filter((result) => result.stageId === stage.id);
        return (
          <section
            key={stage.id}
            aria-labelledby={`results-${stage.id}`}
            className="flex flex-col gap-4"
          >
            <h2 id={`results-${stage.id}`} className="text-lg font-semibold">
              Resultados de «{stage.title?.trim() || stage.id}»
            </h2>
            {results.map((result) => (
              <ResultEditor
                key={result.key}
                draft={draft}
                result={result}
                fields={fields.data?.entries ?? []}
                onChange={onChange}
              />
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => onChange(addResult(draft, stage.id))}
            >
              + Resultado en esta etapa
            </Button>
          </section>
        );
      })}
    </div>
  );
}

function ResultEditor({
  draft,
  result,
  fields,
  onChange,
}: {
  draft: Draft;
  result: DraftResult;
  fields: readonly { slug: string; name: string }[];
  onChange: (draft: Draft) => void;
}) {
  const set = (patch: Partial<DraftResult>) => onChange(updateResult(draft, result.key, patch));
  const facts = result.facts ?? [];
  const reveal = result.reveal ?? { lines: [] };

  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">
          {result.title || 'Resultado sin título'}{' '}
          <span className="text-xs font-normal text-muted">({result.key})</span>
        </h3>
        <Button variant="ghost" onClick={() => onChange(removeResult(draft, result.key))}>
          Eliminar
        </Button>
      </div>
      <TextField
        label="Título"
        value={result.title}
        maxLength={160}
        onChange={(event) => set({ title: event.target.value })}
      />
      <RichTextEditor
        label="Descripción"
        value={result.description ?? ''}
        onChange={(html) => set({ description: html })}
      />
      <MediaField
        value={result.media}
        onChange={(media) => {
          const { media: _removed, ...rest } = result;
          onChange({
            ...draft,
            results: draft.results.map((current) =>
              current.key === result.key ? (media ? { ...rest, media } : rest) : current,
            ),
          });
        }}
      />
      <SelectField
        label="Campo de poder de este resultado"
        value={result.fieldSlug ?? ''}
        placeholder="Ninguno (sin fondo animado)"
        hint="Al terminar el quiz, quien obtiene este resultado ve el fondo animado del campo. Se elige el fondo en la wiki."
        options={fields.map((field) => ({ value: field.slug, label: field.name }))}
        onChange={(event) => {
          const { fieldSlug: _removed, ...rest } = result;
          onChange({
            ...draft,
            results: draft.results.map((current) =>
              current.key === result.key
                ? event.target.value
                  ? { ...rest, fieldSlug: event.target.value }
                  : rest
                : current,
            ),
          });
        }}
      />
      <StringListEditor
        label="Secuencia de revelado propia de este resultado"
        addLabel="Línea"
        items={reveal.lines}
        onChange={(lines) => set({ reveal: { ...reveal, lines } })}
      />
      <TextField
        label="Efecto visual de este resultado"
        value={reveal.effect ?? ''}
        maxLength={60}
        onChange={(event) =>
          set({
            reveal: {
              lines: reveal.lines,
              ...(event.target.value ? { effect: event.target.value } : {}),
            },
          })
        }
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Datos del resultado (p. ej. «Tu cápsula»)</legend>
        {facts.map((fact, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <TextField
              label="Etiqueta"
              value={fact.label}
              maxLength={80}
              onChange={(event) =>
                set({
                  facts: facts.map((f, i) =>
                    i === index ? { ...f, label: event.target.value } : f,
                  ),
                })
              }
            />
            <TextField
              label="Valor"
              value={fact.value}
              maxLength={500}
              onChange={(event) =>
                set({
                  facts: facts.map((f, i) =>
                    i === index ? { ...f, value: event.target.value } : f,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              aria-label={`Quitar el dato ${index + 1}`}
              onClick={() => set({ facts: facts.filter((_, i) => i !== index) })}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => set({ facts: [...facts, { label: '', value: '' }] })}
        >
          + Dato
        </Button>
      </fieldset>
    </Card>
  );
}
