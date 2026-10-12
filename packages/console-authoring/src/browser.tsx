import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import {
  assertConsoleMountPaths,
  type BrowserMount,
  type BrowserAdmission,
} from "./browser-admission";
import { ConsoleQueryClient } from "./browser-query-client";
import { createWorkspaceReads } from "./browser-reads";
import { consoleHttpPaths } from "./http-paths";
import type { PageProps } from "./index";
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

/** Each admitted mount owns one cache and request lifetime, including late-result rejection. */
export function ConsoleBrowserMount({
  admission,
  mount,
  children,
}: {
  admission: BrowserAdmission;
  mount: BrowserMount;
  children: (
    runtime: Pick<PageProps, "services" | "reads" | "signal">
  ) => ReactNode;
}) {
  const [runtime, setRuntime] = useState<{
    query: ConsoleQueryClient;
    props: Pick<PageProps, "services" | "reads" | "signal">;
  }>();
  useEffect(() => {
    if (admission.signal?.aborted) {
      return;
    }
    const lifetime = new AbortController();
    const query = new ConsoleQueryClient();
    const retire = () => {
      lifetime.abort();
      query.clear();
    };
    admission.signal?.addEventListener("abort", retire, { once: true });
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
    setRuntime({ query, props: { services, reads, signal: lifetime.signal } });
    return () => {
      admission.signal?.removeEventListener("abort", retire);
      retire();
    };
  }, [admission, mount]);
  if (!runtime || runtime.props.signal.aborted) {
    return <output aria-busy="true">Loading page…</output>;
  }
  return (
    <QueryClientProvider client={runtime.query}>
      {children(runtime.props)}
    </QueryClientProvider>
  );
}
