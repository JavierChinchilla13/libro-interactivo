import type { Logger } from './logger.js';

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Ejecuta trabajos sin hacer esperar la respuesta HTTP (envío de correos). Así el tiempo de respuesta
 * no delata, por ejemplo, si un correo existe o no. Los fallos se registran, nunca llegan al cliente.
 * `idle()` espera a que terminen los pendientes (lo usan las pruebas y el cierre ordenado).
 */
export function createBackgroundTasks(logger: Logger) {
  const pending = new Set<Promise<void>>();

  return {
    run(label: string, job: () => Promise<void>): void {
      const task: Promise<void> = (async () => {
        try {
          await job();
        } catch (error) {
          logger.error(
            { task: label, reason: describeError(error) },
            'Falló una tarea en segundo plano',
          );
        }
      })().finally(() => {
        pending.delete(task);
      });
      pending.add(task);
    },

    async idle(): Promise<void> {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

export type BackgroundTasks = ReturnType<typeof createBackgroundTasks>;
