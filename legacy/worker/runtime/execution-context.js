export function createExecutionContext(logger = console) {
  const tasks = [];

  return {
    waitUntil(promise) {
      tasks.push(
        Promise.resolve(promise).then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason })
        )
      );
    },

    passThroughOnException() {
      // Cloudflare Workers compatibility hook. Express cannot pass through to an origin.
    },

    async runWaitUntil() {
      const results = await Promise.all(tasks);
      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error('waitUntil task failed:', result.reason);
        }
      }
      return results;
    }
  };
}
