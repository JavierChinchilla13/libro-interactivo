import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/client';
import { useSession } from '../../auth/session';
import { errorMessage } from '../errors';
import { useConfirm } from './ConfirmDialog';
import { FormSection } from './FormSection';
import { useToast } from './Toast';

/**
 * Archivar, restaurar y eliminar definitivamente el contenido del panel (actualizaciones, cartas, extras, fan arts, reseñas
 * y entradas de la wiki), con las mismas reglas en todas partes:
 *
 * - **Archivar** es reversible y oculta del público: un clic, sin confirmación, y un aviso dice cómo deshacerlo.
 * - **Restaurar** devuelve a «borrador» (a «publicada» en lo que no tiene borrador).
 * - **Eliminar definitivamente** solo para ADMIN y solo con lo archivado o en borrador: pide confirmación diciendo qué se
 *   borra y que no se puede deshacer. El servidor decide (y bloquea con un mensaje claro si algo depende de ello); aquí solo
 *   se ofrece lo que tiene sentido.
 */
export interface LifecycleConfig {
  /** Ruta del API del contenido: `/admin/posts`. */
  base: string;
  /** «actualización», «carta», «capítulo extra»… */
  noun: string;
  /** Género del sustantivo, para concordar los textos («Archivada» / «Archivado»). */
  feminine: boolean;
  /** Estado que equivale a «archivado» (en las reseñas es `hidden`). */
  archivedStatus?: string;
  /** Estados desde los que se puede eliminar (lo demás se archiva primero). */
  deletableStatuses: readonly string[];
  /** Cómo vuelve al restaurar, para el aviso: «borrador» o «publicada». */
  restoredAs: string;
  /** Qué se borra, para el diálogo: «la actualización y todo lo que escribiste en ella». */
  deletes: string;
  /** Una advertencia extra (por ejemplo, que las imágenes de Cloudinary no se borran). */
  note?: string;
  /** Consultas que se refrescan después de cada cambio. */
  keys: readonly QueryKey[];
}

/** El elemento sobre el que se actúa: solo lo que hace falta. */
export interface LifecycleItem {
  id: string;
  title: string;
  status: string;
}

export function useLifecycle(config: LifecycleConfig) {
  const client = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const session = useSession();
  const isAdmin = session.data?.role === 'ADMIN';
  const archivedStatus = config.archivedStatus ?? 'archived';
  const archivedWord = config.feminine ? 'archivada' : 'archivado';
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all(config.keys.map((key) => client.invalidateQueries({ queryKey: key })));
  };

  const call = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'archive' | 'restore' | 'delete' }) =>
      action === 'delete'
        ? apiRequest(`${config.base}/${id}`, z.null(), { method: 'DELETE' })
        : apiRequest(`${config.base}/${id}/${action}`, z.unknown(), { method: 'POST' }),
  });

  async function run(
    item: LifecycleItem,
    action: 'archive' | 'restore' | 'delete',
    success: string,
    after?: () => void,
  ) {
    setBusyId(item.id);
    try {
      await call.mutateAsync({ id: item.id, action });
      await refresh();
      toast.success(success);
      after?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const noun = config.noun;
  const The = config.feminine ? 'La' : 'El';
  const lo = config.feminine ? 'la' : 'lo';
  return {
    isAdmin,
    archivedStatus,
    isArchived: (item: LifecycleItem) => item.status === archivedStatus,
    canDelete: (item: LifecycleItem) => isAdmin && config.deletableStatuses.includes(item.status),
    busy: busyId !== null,
    busyFor: (item: LifecycleItem) => busyId === item.id,
    feminine: config.feminine,
    archive: (item: LifecycleItem, after?: () => void) =>
      run(
        item,
        'archive',
        `${The} ${noun} quedó ${archivedWord}: ya no se ve en público. Puedes restaurar${lo} cuando quieras.`,
        after,
      ),
    restore: (item: LifecycleItem, after?: () => void) =>
      run(
        item,
        'restore',
        `${The} ${noun} se restauró y vuelve como ${config.restoredAs}. Publíca${lo} cuando quieras que se vea.`,
        after,
      ),
    /** Pide confirmación (qué se borra y que no se puede deshacer) y elimina. */
    remove: async (item: LifecycleItem, after?: () => void) => {
      const ok = await confirm({
        title: `¿Eliminar definitivamente «${item.title}»?`,
        message: (
          <>
            Se borrará {config.deletes}. <strong>No se puede deshacer.</strong>
            {config.note ? ` ${config.note}` : ''}
          </>
        ),
        confirmLabel: 'Eliminar definitivamente',
        tone: 'danger',
      });
      if (!ok) return;
      await run(item, 'delete', `${The} ${noun} se eliminó definitivamente.`, after);
    },
  };
}

export type Lifecycle = ReturnType<typeof useLifecycle>;

/**
 * Los botones: «Archivar» o «Restaurar» siempre visibles y, solo para ADMIN y con lo archivado o en borrador, «Eliminar
 * definitivamente». En las listas (`compact`) el nombre del elemento va oculto para lectores de pantalla.
 */
export function LifecycleButtons({
  item,
  lifecycle,
  compact = false,
  disabled = false,
  after,
}: {
  item: LifecycleItem;
  lifecycle: Lifecycle;
  compact?: boolean;
  disabled?: boolean;
  /** Se llama después de eliminar (por ejemplo, para volver a la lista desde el formulario). */
  after?: () => void;
}) {
  const busy = lifecycle.busy || disabled;
  const size = compact ? 'btn-compact' : '';
  const name = compact ? <span className="sr-only"> {item.title}</span> : null;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${compact ? 'admin-lifecycle-compact' : ''}`}
    >
      {lifecycle.isArchived(item) ? (
        <button
          type="button"
          className={`btn btn-secondary ${size}`}
          disabled={busy}
          onClick={() => void lifecycle.restore(item)}
        >
          Restaurar{name}
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-secondary ${size}`}
          disabled={busy}
          onClick={() => void lifecycle.archive(item)}
        >
          Archivar{name}
        </button>
      )}
      {lifecycle.canDelete(item) ? (
        <button
          type="button"
          className={`btn btn-danger ${size}`}
          disabled={busy}
          onClick={() => void lifecycle.remove(item, after)}
        >
          Eliminar definitivamente{name}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Sección de un formulario: explica qué pasa y trae los botones. Con cambios sin guardar queda desactivada (primero se
 * guardan o se descartan, para no perderlos ni pisar el estado).
 */
export function LifecyclePanel({
  item,
  lifecycle,
  dirty,
  noun,
  after,
  children,
}: {
  item: LifecycleItem;
  lifecycle: Lifecycle;
  dirty: boolean;
  noun: string;
  after: () => void;
  children?: ReactNode;
}) {
  const archived = lifecycle.isArchived(item);
  return (
    <FormSection
      title="Archivar o eliminar"
      help={
        archived
          ? `${lifecycle.feminine ? 'Está archivada' : 'Está archivado'}: no se ve en público. Puedes restaurar${lifecycle.feminine ? 'la' : 'lo'} o, si ya no ${lifecycle.feminine ? 'la' : 'lo'} quieres, eliminar${lifecycle.feminine ? 'la' : 'lo'} definitivamente.`
          : `Archivar ${lifecycle.feminine ? 'la' : 'lo'} oculta del público y se puede deshacer. Eliminar definitivamente es solo para lo archivado o en borrador.`
      }
    >
      {children}
      <LifecycleButtons item={item} lifecycle={lifecycle} disabled={dirty} after={after} />
      {dirty ? (
        <p className="text-sm text-muted">
          Guarda o descarta tus cambios antes de archivar o eliminar {noun}.
        </p>
      ) : !lifecycle.isAdmin ? (
        <p className="text-sm text-muted">
          Eliminar definitivamente lo hace solo un administrador.
        </p>
      ) : null}
    </FormSection>
  );
}
