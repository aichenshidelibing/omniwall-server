import { describe, expect, it, vi } from 'vitest';
import { startScheduler } from '../src/jobs/scheduler.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('scheduler', () => {
  it('does not overlap scheduled maintenance runs', async () => {
    vi.useFakeTimers();
    try {
      const run = deferred();
      const worker = {
        scheduled: vi.fn(() => run.promise)
      };

      const stop = startScheduler(worker, {}, { intervalSeconds: 60, runOnStart: true });

      await vi.advanceTimersByTimeAsync(1000);
      expect(worker.scheduled).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(worker.scheduled).toHaveBeenCalledTimes(1);

      run.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(worker.scheduled).toHaveBeenCalledTimes(2);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
