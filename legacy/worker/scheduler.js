import { createExecutionContext } from '../runtime/execution-context.js';

async function runScheduled(worker, env) {
  if (typeof worker.scheduled !== 'function') return;
  const ctx = createExecutionContext();
  const event = {
    cron: 'server-interval',
    scheduledTime: Date.now()
  };
  await worker.scheduled(event, env, ctx);
  await ctx.runWaitUntil();
}

export function startScheduler(worker, env, options = {}) {
  const intervalSeconds = Math.max(60, Number(options.intervalSeconds || 900));
  const runOnStart = options.runOnStart !== false;
  let stopped = false;
  let isRunning = false;

  async function tick() {
    if (stopped || isRunning) return;
    isRunning = true;
    try {
      await runScheduled(worker, env);
    } catch (error) {
      console.error('Scheduled OmniWall maintenance failed:', error);
    } finally {
      isRunning = false;
    }
  }

  let startupTimer = null;
  if (runOnStart) {
    startupTimer = setTimeout(tick, 1000);
    startupTimer.unref?.();
  }

  const timer = setInterval(tick, intervalSeconds * 1000);
  timer.unref?.();

  return function stopScheduler() {
    stopped = true;
    if (startupTimer) clearTimeout(startupTimer);
    clearInterval(timer);
  };
}
