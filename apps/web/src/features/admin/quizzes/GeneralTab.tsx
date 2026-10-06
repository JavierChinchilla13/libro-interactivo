import type { QuizDetailResponse } from '@libro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, CheckField, TextField } from '../../../shared/ui/controls';
import { Alert, Card } from '../../../shared/ui/layout';
import { quizzesApi } from '../api';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { StringListEditor } from '../components/StringListEditor';
import { errorMessage } from '../errors';
import type { Draft } from './draft';

/** Pestaña «General»: título, instrucciones, reglas del quiz, secuencia de revelado común y posición. */
export function GeneralTab({
  quiz,
  draft,
  onChange,
}: {
  quiz: QuizDetailResponse;
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const client = useQueryClient();
  const [slug, setSlug] = useState(quiz.slug);
  const [order, setOrder] = useState(String(quiz.order));
  const meta = useMutation({
    mutationFn: () => quizzesApi.updateMeta(quiz.id, { slug, order: Number(order) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
    },
  });
  const intro = draft.settings.revealIntro ?? { lines: [] };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <TextField
          label="Título"
          required
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
        <RichTextEditor
          label="Instrucciones"
          value={draft.instructionsHtml ?? ''}
          onChange={(html) => onChange({ ...draft, instructionsHtml: html })}
        />
        <ImageField
          label="Imagen del quiz (opcional)"
          purpose="quiz"
          value={draft.image}
          onChange={(image) => {
            const { image: _removed, ...rest } = draft;
            onChange(image ? { ...rest, image } : rest);
          }}
        />
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Reglas del quiz</h2>
          <CheckField
            label="Se puede repetir"
            hint="Si está desactivado, el quiz se juega una sola vez."
            checked={draft.settings.allowRetake ?? true}
            onChange={(value) =>
              onChange({ ...draft, settings: { ...draft.settings, allowRetake: value } })
            }
          />
          <CheckField
            label="Mostrar el porcentaje de cada resultado al terminar"
            checked={draft.settings.showBreakdown ?? false}
            onChange={(value) =>
              onChange({ ...draft, settings: { ...draft.settings, showBreakdown: value } })
            }
          />
          <p className="text-xs text-muted">
            Los cambios de reglas rigen desde la siguiente publicación.
          </p>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Secuencia de revelado común</h2>
          <p className="text-sm text-muted">
            Líneas que aparecen una a una antes de mostrar el resultado (iguales para todos los
            resultados).
          </p>
          <StringListEditor
            label="Líneas"
            addLabel="Línea"
            items={intro.lines}
            onChange={(lines) =>
              onChange({
                ...draft,
                settings: {
                  ...draft.settings,
                  ...(lines.length || intro.effect
                    ? { revealIntro: { ...intro, lines } }
                    : { revealIntro: undefined }),
                },
              })
            }
          />
          <TextField
            label="Efecto visual"
            hint="Nombre del efecto (se define con la autora)."
            value={intro.effect ?? ''}
            maxLength={60}
            onChange={(event) =>
              onChange({
                ...draft,
                settings: {
                  ...draft.settings,
                  revealIntro: {
                    lines: intro.lines,
                    ...(event.target.value ? { effect: event.target.value } : {}),
                  },
                },
              })
            }
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Dirección y posición</h2>
          <TextField
            label="Dirección (slug)"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
          <TextField
            label="Posición en la secuencia"
            type="number"
            min={1}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
          {meta.isError ? <Alert>{errorMessage(meta.error)}</Alert> : null}
          {meta.isSuccess ? <Alert tone="success" title="Posición actualizada" /> : null}
          <Button
            variant="secondary"
            className="self-start"
            loading={meta.isPending}
            onClick={() => meta.mutate()}
          >
            Guardar posición
          </Button>
        </Card>
      </div>
    </div>
  );
}
