import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { ConsoleQueryClient } from "./browser-query-client";
import { createWorkspaceReads } from "./browser-reads";
import {
  configureSessionCsrf,
  configureSessionReadScope,
  createSessionWorkspaceServices,
  retireSessionReads,
  sessionFetch,
} from "./browser-session-fetch";
import { consoleHttpPaths } from "./http-paths";
import type { PageProps } from "./index";
import {
  type consolePageDescriptorSchema,
  consolePageCatalogSchema,
  consoleSessionSchema,
} from "./protocol";

export type BrowserMount = ReturnType<
  typeof consolePageDescriptorSchema.parse
> & {
  basePath: string;
};
export type BrowserAdmission = {
  mounts: readonly BrowserMount[];
  subject: string;
  readScope: string;
};

const allMounts = (mounts: readonly BrowserMount[]) => mounts;

/** Session admission is shared by Console and the SDK's backend preview. */
export function useConsoleAdmission(
  selectMounts: (
    mounts: readonly BrowserMount[]
  ) => readonly BrowserMount[] = allMounts
) {
  const [attempt, setAttempt] = useState(0);
  const [admission, setAdmission] = useState<BrowserAdmission>();
  const [admissionError, setAdmissionError] = useState<Error>();
  useEffect(() => {
    const lifetime = new AbortController();
    let admitted = false;
    const retire = () => {
      lifetime.abort();
      retireSessionReads();
      setAdmission(undefined);
      setAdmissionError(
        new Error(
          "The backend session changed. Authenticate with the application owner, then retry."
        )
      );
    };
    window.addEventListener("lenso-session-expired", retire);
    setAdmission(undefined);
    setAdmissionError(undefined);
    const sessionPath = `${consoleHttpPaths.api_base_path}/console/v1/session`;
    const request = async (path: string) => {
      const response = await sessionFetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        signal: lifetime.signal,
      });
      if (!response.ok) {
        if (
          admitted &&
          path === sessionPath &&
          [401, 412].includes(response.status)
        ) {
          retire();
        }
        throw new Error(
          "Console requires an authenticated authorized backend session."
        );
      }
      return response;
    };
    let revalidate: (() => Promise<void>) | undefined;
    const onFocus = async () => {
      try {
        await revalidate?.();
      } catch {
        // A network outage does not establish session revocation.
      }
    };
    window.addEventListener("focus", onFocus);
    const load = async () => {
      const methods = await request(
        `${consoleHttpPaths.auth_base_path}/methods`
      );
      configureSessionCsrf(await methods.json());
      const session = await request(sessionPath);
      const identity = consoleSessionSchema.parse(await session.json());
      const readScope = session.headers.get("x-lenso-read-scope");
      if (
        identity.authenticated !== true ||
        typeof identity.subject !== "string" ||
        !readScope ||
        !/^[a-f0-9]{64}$/u.test(readScope)
      ) {
        throw new Error("Backend session metadata is unavailable.");
      }
      revalidate = async () => {
        const current = await request(sessionPath);
        if (current.headers.get("x-lenso-read-scope") !== readScope) {
          retire();
        }
      };
      configureSessionReadScope(readScope, revalidate);
      const pages = await request(
        `${consoleHttpPaths.api_base_path}/console/v1/pages`
      );
      const catalog = consolePageCatalogSchema.parse(await pages.json());
      const mounts = catalog.mounts.map((mount): BrowserMount => {
        if (!mount.basePath) {
          throw new Error("Backend mount path is unavailable.");
        }
        return { ...mount, basePath: mount.basePath };
      });
      const selectedMounts = selectMounts(mounts);
      assertConsoleMountPaths(selectedMounts);
      lifetime.signal.throwIfAborted();
      admitted = true;
      setAdmission({
        mounts: selectedMounts,
        subject: identity.subject,
        readScope,
      });
    };
    const initialize = async () => {
      try {
        await load();
      } catch (error) {
        if (!lifetime.signal.aborted) {
          setAdmissionError(
            error instanceof Error
              ? error
              : new Error("Backend admission failed.")
          );
        }
      }
    };
    void initialize();
    return () => {
      lifetime.abort();
      retireSessionReads();
      configureSessionCsrf(undefined);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("lenso-session-expired", retire);
    };
  }, [attempt, selectMounts]);
  return {
    admission,
    error: admissionError,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** The browser uses unqualified paths even when the backend catalogs separate subjects. */
export function assertConsoleMountPaths(mounts: readonly BrowserMount[]) {
  for (let index = 0; index < mounts.length; index += 1) {
    const mount = mounts[index]!;
    const base = mount.basePath.replace(/\/$/u, "");
    for (const other of mounts.slice(index + 1)) {
      const otherBase = other.basePath.replace(/\/$/u, "");
      if (
        base === otherBase ||
        base === "" ||
        otherBase === "" ||
        base.startsWith(`${otherBase}/`) ||
        otherBase.startsWith(`${base}/`)
      ) {
        throw new Error(
          `Console browser paths overlap: mount "${mount.id}" (${mount.basePath}) and mount "${other.id}" (${other.basePath}). Assign globally distinct, non-overlapping basePath values to the selected mounts, including mounts from different app subjects.`
        );
      }
    }
  }
}

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
    const lifetime = new AbortController();
    const query = new ConsoleQueryClient();
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
      lifetime.abort();
      query.clear();
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
