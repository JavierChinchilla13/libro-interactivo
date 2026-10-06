import { describe, expect, it, vi } from 'vitest';
import { createBackgroundTasks } from './background.js';
import { createLogger } from './logger.js';

describe('createBackgroundTasks', () => {
  const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

  it('ejecuta los trabajos sin bloquear a quien los lanza y idle() espera a que terminen', async () => {
    const tasks = createBackgroundTasks(logger);
    const done: number[] = [];
    tasks.run('lento', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      done.push(1);
    });
    expect(done).toEqual([]); // run() no esperó
    await tasks.idle();
    expect(done).toEqual([1]);
  });

  it('un trabajo que falla se registra y no rompe nada ni a los demás', async () => {
    const error = vi.spyOn(logger, 'error');
    const tasks = createBackgroundTasks(logger);
    const done: string[] = [];
    tasks.run('falla', async () => {
      throw new Error('secreto: no debe filtrarse el objeto completo');
    });
    tasks.run('bien', async () => {
      done.push('ok');
    });
    await expect(tasks.idle()).resolves.toBeUndefined();
    expect(done).toEqual(['ok']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatchObject({ task: 'falla' });
  });
});
