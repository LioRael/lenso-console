import { QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  assertConsoleMountPaths,
  type BrowserMount,
  type BrowserAdmission,
} from "./browser-admission";
import { ConsoleQueryClient } from "./browser-query-client";
import { createWorkspaceReads } from "./browser-reads";
import { createConsoleWorkspaceCredentials } from "./credentials";
import { consoleHttpPaths } from "./http-paths";
import type { PageProps } from "./index";
import { sessionFetch } from "./session-fetch";
import { createSessionWorkspaceServices } from "./session-workspace-services";

export {
  useConsoleAdmission,
  assertConsoleMountPaths,
  type BrowserMount,
  type BrowserAdmission,
} from "./browser-admission";

export function findConsoleMount(
  admission: BrowserAdmission | undefined,
  pathname: string
) {
  if (!admission) {
    return undefined;
  }
  assertConsoleMountPaths(admission.mounts);
  return admission.mounts.find((mount) => {
    const base = mount.basePath.replace(/\/$/u, "");
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

export function consoleMountKey(
  admission: BrowserAdmission,
  mount: BrowserMount
) {
  return JSON.stringify([
    admission.subject,
    admission.readScope,
    mount.id,
    mount.revision,
    mount.implementationId,
  ]);
}

export function consoleMountHref(
  mount: Pick<BrowserMount, "basePath">,
  segments: readonly string[]
) {
  return `${mount.basePath.replace(/\/$/u, "")}/${segments.map(encodeURIComponent).join("/")}`;
}

export interface ConsoleSettingsDestination {
  id: string;
  label: string;
  href: string;
  description?: string;
  group?: { id: string; label: string };
  status?: string;
}

/** Consume only the current admitted catalog, never a persisted feature registry. */
export function consoleSettingsLinks(
  mounts: readonly Pick<
    BrowserMount,
    "id" | "basePath" | "settings" | "routes"
  >[]
): ConsoleSettingsDestination[] {
  assertConsoleMountPaths(mounts);
  return mounts.flatMap((mount) =>
    (mount.settings ?? []).map((entry) => {
      if (
        !mount.routes?.some(
          (route) => JSON.stringify(route) === JSON.stringify(entry.page)
        )
      ) {
        throw new Error(
          `Settings entry ${mount.id}/${entry.id} has no static route`
        );
      }
      return {
        id: JSON.stringify([mount.id, entry.id]),
        label: entry.label,
        href: consoleMountHref(mount, entry.page),
        ...(entry.description === undefined
          ? {}
          : { description: entry.description }),
        ...(entry.group === undefined ? {} : { group: entry.group }),
        ...(entry.status === undefined ? {} : { status: entry.status }),
      };
    })
  );
}

type BrowserRuntime = {
  query: ConsoleQueryClient;
  props: Pick<PageProps, "services" | "reads" | "signal" | "credentials">;
  retire(): void;
};
function createBrowserRuntime(
  admission: BrowserAdmission,
  mount: BrowserMount
): BrowserRuntime {
  const lifetime = new AbortController();
  const query = new ConsoleQueryClient();
  const retire = () => {
    admission.signal?.removeEventListener("abort", retire);
    lifetime.abort();
    query.clear();
  };
  admission.signal?.addEventListener("abort", retire, { once: true });
  if (admission.signal?.aborted) {
    retire();
  }
  query.admitReadScope(admission.readScope);
  const services = createSessionWorkspaceServices({
    mount,
    signal: lifetime.signal,
    expectedSubject: admission.subject,
    url: `/${consoleHttpPaths.api_base_path.slice(1)}/console/v2/rpc`,
  });
  const reads = createWorkspaceReads(query, {
    scopeKey: consoleMountKey(admission, mount),
    signal: lifetime.signal,
    policy: { focus: "never", staleTimeMs: 10_000 },
  });
  const credentials = mount.credentials
    ? createConsoleWorkspaceCredentials({
        paths: mount.credentials,
        signal: lifetime.signal,
        expectedSubject: admission.subject,
        fetch: (input, init) => sessionFetch(input, init),
      })
    : undefined;
  return {
    query,
    retire,
    props: {
      services,
      reads,
      signal: lifetime.signal,
      ...(credentials ? { credentials } : {}),
    },
  };
}
const BrowserRuntimeContext = createContext<
  | {
      admission: BrowserAdmission;
      runtimes: Map<BrowserMount, BrowserRuntime>;
      live: boolean;
    }
  | undefined
>(undefined);

/** Place above route-keyed pages. Owns data runtimes, never page action leases.
 * Each exact admitted mount retains its bounded query cache until admission retires.
 * Subject/permission changes must supply a new admission and retire the old signal.
 */
export function ConsoleBrowserRuntimeProvider({
  admission,
  children,
}: {
  admission: BrowserAdmission;
  children: ReactNode;
}) {
  const owner = useMemo(
    () => ({
      admission,
      runtimes: new Map<BrowserMount, BrowserRuntime>(),
      live: false,
    }),
    [admission]
  );
  useInsertionEffect(() => {
    const retire = () => {
      owner.live = false;
      for (const runtime of owner.runtimes.values()) {
        runtime.retire();
      }
      owner.runtimes.clear();
    };
    owner.live = !admission.signal?.aborted;
    admission.signal?.addEventListener("abort", retire, { once: true });
    return () => {
      admission.signal?.removeEventListener("abort", retire);
      retire();
    };
  }, [owner, admission]);
  return (
    <BrowserRuntimeContext.Provider value={owner}>
      {children}
    </BrowserRuntimeContext.Provider>
  );
}

/** Standalone mounts own cleanup. Under the provider, only admission owns cleanup. */
export function ConsoleBrowserMount({
  admission,
  mount,
  children,
}: {
  admission: BrowserAdmission;
  mount: BrowserMount;
  children: (runtime: BrowserRuntime["props"]) => ReactNode;
}) {
  const provider = useContext(BrowserRuntimeContext);
  const owner = provider?.admission === admission ? provider : undefined;
  const [local, setLocal] = useState<{
    admission: BrowserAdmission;
    mount: BrowserMount;
    runtime: BrowserRuntime;
  }>();
  useEffect(() => {
    if (admission.signal?.aborted || (owner && !owner.live)) {
      return;
    }
    if (owner && !owner.runtimes.has(mount)) {
      for (const [previous, runtime] of owner.runtimes) {
        if (previous.id === mount.id && previous.targetId === mount.targetId) {
          runtime.retire();
          owner.runtimes.delete(previous);
        }
      }
    }
    const runtime =
      owner?.runtimes.get(mount) ?? createBrowserRuntime(admission, mount);
    owner?.runtimes.set(mount, runtime);
    setLocal({ admission, mount, runtime });
    return () => {
      if (!owner) {
        runtime.retire();
      }
    };
  }, [admission, mount, owner]);
  const runtime =
    owner?.runtimes.get(mount) ??
    (local?.admission === admission && local.mount === mount
      ? local.runtime
      : undefined);
  if (!runtime || runtime.props.signal.aborted || admission.signal?.aborted) {
    return <output aria-busy="true">Loading page…</output>;
  }
  return (
    <QueryClientProvider client={runtime.query}>
      {children(runtime.props)}
    </QueryClientProvider>
  );
}
