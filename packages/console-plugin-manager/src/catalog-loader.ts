import type { ConsoleClient } from "@lenso/console-sdk/protocol";

type CatalogClient = Pick<ConsoleClient, "targets" | "plugins" | "catalog">;
type TargetReads = {
  plugins: Awaited<ReturnType<CatalogClient["plugins"]>>["plugins"];
  operations: Awaited<ReturnType<CatalogClient["catalog"]>>["operations"];
};

export async function loadCatalog(
  services: CatalogClient,
  signal: AbortSignal
) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    abort();
  }
  const requestSignal = controller.signal;
  const request = async <T>(read: () => Promise<T>) => {
    requestSignal.throwIfAborted();
    return read();
  };
  try {
    const { targets } = await request(() =>
      services.targets(undefined, { signal: requestSignal })
    );
    requestSignal.throwIfAborted();
    if (!Array.isArray(targets)) {
      throw new TypeError("Invalid target catalog");
    }
    const reads: TargetReads[] = [];
    let next = 0;
    const readTargets = async () => {
      try {
        while (next < targets.length) {
          requestSignal.throwIfAborted();
          const index = next++;
          const targetId = targets[index].id;
          const [plugins, catalog] = await Promise.all([
            request(() =>
              services.plugins({ targetId }, { signal: requestSignal })
            ),
            request(() =>
              services.catalog({ targetId }, { signal: requestSignal })
            ),
          ]);
          reads[index] = {
            plugins: plugins.plugins,
            operations: catalog.operations,
          };
        }
      } catch (error) {
        // Cancel sibling reads without aborting the page scope that displays errors.
        controller.abort(error);
        throw error;
      }
    };
    // Each target starts two independent reads; cap each load at eight in flight.
    await Promise.all(
      Array.from({ length: Math.min(4, targets.length) }, readTargets)
    );
    requestSignal.throwIfAborted();
    return {
      targets,
      plugins: reads.flatMap((read) => read.plugins),
      operations: reads.flatMap((read) => read.operations),
    };
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
