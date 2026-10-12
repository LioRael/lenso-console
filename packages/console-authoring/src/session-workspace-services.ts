import { sessionFetch } from "./session-fetch";
import {
  createConsoleWorkspaceServices,
  WorkspaceServiceError,
  type ConsoleWorkspaceServicesOptions,
} from "./transport";

/** In-band stream failures use the originating request's session and abort guards. */
export function createSessionWorkspaceServices(
  options: Pick<
    ConsoleWorkspaceServicesOptions,
    "mount" | "signal" | "expectedSubject" | "url" | "origin"
  >
) {
  const statusHandlers = new WeakMap<AbortSignal, (status: number) => void>();
  return createConsoleWorkspaceServices({
    ...options,
    fetch: (input, init) =>
      sessionFetch(
        input,
        { ...init, credentials: "same-origin", cache: "no-store" },
        undefined,
        (handle) => {
          if (init?.signal) {
            statusHandlers.set(init.signal, handle);
          }
        }
      ),
    onStreamError(error, signal) {
      if (error instanceof WorkspaceServiceError && signal && !signal.aborted) {
        statusHandlers.get(signal)?.(error.status);
      }
    },
  });
}
