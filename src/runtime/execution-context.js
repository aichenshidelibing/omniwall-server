export function createExecutionContext(logger = console) {
  const tasks = [];

  return {
    waitUntil(promise) {
      tasks.push(
        Promise.resolve(promise).catch((error) => {
          logger.error('waitUntil task failed:', error);
          throw error;
        })
      );
    },

    passThroughOnException() {
      // Cloudflare Workers compatibility hook. Express cannot pass through to an origin.
    },

    async runWaitUntil() {
      return Promise.allSettled(tasks);
    }
  };
}
