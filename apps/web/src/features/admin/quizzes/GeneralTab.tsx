import type { QuizDetailResponse } from '@libro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, CheckField, TextField } from '../../../shared/ui/controls';
import { Alert, Card } from '../../../shared/ui/layout';
import { quizzesApi } from '../api';
import { FormSection } from '../components/FormSection';
import { ImageField } from '../components/MediaFields';
import { RichTextEditor } from '../components/RichTextEditor';
import { StringListEditor } from '../components/StringListEditor';
import { useToast } from '../components/Toast';
import { errorMessage } from '../errors';
import type { Draft } from './draft';

/** Pestaña «Datos»: título, instrucciones, reglas del quiz, secuencia de revelado común y posición. */
export function GeneralTab({
  quiz,
  draft,
  onChange,
  onOpenAppearance,
}: {
  quiz: QuizDetailResponse;
  draft: Draft;
  onChange: (draft: Draft) => void;
  onOpenAppearance: () => void;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [slug, setSlug] = useState(quiz.slug);
  const [order, setOrder] = useState(String(quiz.order));
  const meta = useMutation({
    mutationFn: () => quizzesApi.updateMeta(quiz.id, { slug, order: Number(order) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
      toast.success('Posición actualizada');
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
        {quiz.appearance ? (
          // Con apariencia, la introducción y la portada viven allí (se aplican sin publicar una versión nueva).
          <div className="flex flex-col items-start gap-2 rounded-token border border-border p-3">
            <p className="text-sm">
              La introducción y la portada se editan en la pestaña <strong>Apariencia</strong> (se
              aplican sin publicar una versión nueva).
            </p>
            <Button variant="secondary" onClick={onOpenAppearance}>
              Ir a Apariencia
            </Button>
          </div>
        ) : (
          <>
            <RichTextEditor
              label="Instrucciones para la lectora"
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
          </>
        )}
      </Card>

      <div className="flex flex-col gap-5">
        <FormSection
          title="Reglas del quiz"
          help="Cuántas veces se juega y qué se muestra al final."
        >
          <CheckField
            label="Se puede repetir"
            hint="Si lo apagas, cada lectora lo juega una sola vez."
            checked={draft.settings.allowRetake ?? true}
            onChange={(value) =>
              onChange({ ...draft, settings: { ...draft.settings, allowRetake: value } })
            }
          />
          <CheckField
            label="Mostrar el porcentaje de cada resultado"
            hint="Al terminar, la lectora ve cuánto de cada resultado sacó."
            checked={draft.settings.showBreakdown ?? false}
            onChange={(value) =>
              onChange({ ...draft, settings: { ...draft.settings, showBreakdown: value } })
            }
          />
          <p className="text-xs text-muted">
            Los cambios de reglas rigen desde la siguiente publicación.
          </p>
        </FormSection>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Líneas que aparecen antes del resultado</h2>
          <p className="text-sm text-muted">
            Se muestran una por una mientras se calcula el resultado (iguales para todos los
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
            label="Animación de la espera"
            hint="Se elige entre las animaciones disponibles."
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

        <details className="admin-advanced">
          <summary>Avanzado: dirección web y posición</summary>
          <div className="admin-card mt-3 flex flex-col gap-4">
            <TextField
              label="Dirección web"
              hint="La parte final del enlace. Se arma sola con el título."
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
            <TextField
              label="Posición"
              hint="El quiz 2 se abre al completar el 1. Aquí eliges el lugar de este."
              type="number"
              min={1}
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            />
            {meta.isError ? <Alert>{errorMessage(meta.error)}</Alert> : null}
            <Button
              variant="secondary"
              className="self-start"
              loading={meta.isPending}
              onClick={() => meta.mutate()}
            >
              Guardar posición
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}
