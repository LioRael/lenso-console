import type { WorkspaceServices } from "../../../../../../packages/console-authoring/src/index";
import {
  createConsoleWorkspaceServices,
  WorkspaceServiceError,
} from "../../../../../../packages/console-authoring/src/transport";
import { consoleHttpPaths } from "../../lib/console-http-paths";
import { sessionFetch } from "../../lib/session-fetch";
import type { PageMount } from "./page-contribution-catalog";
import { createLegacyWorkspaceServices } from "./workspace-service-legacy";

export type WorkspaceServiceOptions = { signal?: AbortSignal };
export type { WorkspaceServices } from "../../../../../../packages/console-authoring/src/index";
export {
  WorkspaceServiceDomainError,
  WorkspaceServiceError,
} from "../../../../../../packages/console-authoring/src/transport";

export function createWorkspaceServices(
  mount: PageMount,
  lifetime?: AbortSignal,
  expectedSubject?: string
): WorkspaceServices {
  if (mount.protocol !== "lenso-console-rpc/2") {
    return createLegacyWorkspaceServices(mount, lifetime, expectedSubject);
  }
  const signals = [lifetime, mount.transport?.signal].filter(
    (value): value is AbortSignal => !!value
  );
  const statuses = new WeakMap<AbortSignal, (status: number) => void>();
  return createConsoleWorkspaceServices({
    mount,
    signal: signals.length ? AbortSignal.any(signals) : undefined,
    expectedSubject: mount.transport?.subject ?? expectedSubject,
    onStreamError: (error, signal) => {
      if (error instanceof WorkspaceServiceError && signal) {
        statuses.get(signal)?.(error.status);
      }
    },
    url: `/${(mount.transport?.apiBasePath ?? consoleHttpPaths.api_base_path).slice(1)}/console/v2/rpc`,
    fetch: (input, init) =>
      sessionFetch(
        input,
        { ...init, credentials: "same-origin", cache: "no-store" },
        mount.transport,
        (handle) => {
          if (init.signal) {
            statuses.set(init.signal, handle);
          }
        }
      ),
  });
}
