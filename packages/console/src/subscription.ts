/**
 * One outstanding pull, no application queue. Cancellation aborts the bound signal
 * immediately; producer completion and cleanup require cooperative waits.
 */
export function subscription(
  source: AsyncIterator<unknown>,
  controller: AbortController,
  signal: AbortSignal,
  project: (value: unknown) => Promise<unknown>,
  sanitize: (error: unknown) => Error,
  onClose?: (error?: Error) => void
): AsyncGenerator<unknown, void, unknown> {
  let closed = false;
  let completed = false;
  let pulling = false;
  let work: Promise<IteratorResult<unknown>> | undefined;
  let cleanup: Promise<void> | undefined;
  let cleanupError: Error | undefined;
  const throwCleanupFailure = () => {
    if (cleanupError instanceof Error) {
      throw sanitize(cleanupError);
    }
  };
  const close = () => {
    if (!cleanup) {
      closed = true;
      signal.removeEventListener("abort", onAbort);
      cleanup = (async () => {
        await Promise.resolve();
        try {
          await source.return?.();
        } catch (error) {
          cleanupError = sanitize(error);
        } finally {
          // Drain only pull/projection work, not next()'s error path which awaits
          // this cleanup. Dependencies remain owned through asynchronous validation.
          await Promise.allSettled(work ? [work] : []);
          signal.removeEventListener("abort", onAbort);
          onClose?.(cleanupError);
        }
      })();
      controller.abort();
    }
    return cleanup;
  };
  const onAbort = () => {
    void close();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async [Symbol.asyncDispose]() {
      await this.return();
    },
    async next() {
      throwCleanupFailure();
      if (closed) {
        if (!completed && signal.aborted) {
          throw sanitize(signal.reason);
        }
        return { done: true, value: undefined };
      }
      if (pulling) {
        throw sanitize(
          new Error("Concurrent subscription pulls are unsupported")
        );
      }
      pulling = true;
      work = (async (): Promise<IteratorResult<unknown>> => {
        signal.throwIfAborted();
        const item = await source.next();
        signal.throwIfAborted();
        if (item.done) {
          return { done: true, value: undefined };
        }
        const value = await project(item.value);
        signal.throwIfAborted();
        return { done: false, value };
      })();
      try {
        const item = await work;
        if (item.done) {
          completed = true;
          await close();
          throwCleanupFailure();
          return { done: true, value: undefined };
        }
        return item;
      } catch (error) {
        await close();
        throw sanitize(error);
      } finally {
        pulling = false;
      }
    },
    async return() {
      completed = true;
      await close();
      throwCleanupFailure();
      return { done: true, value: undefined };
    },
    async throw(error: unknown) {
      await close();
      throw sanitize(error);
    },
  };
}
