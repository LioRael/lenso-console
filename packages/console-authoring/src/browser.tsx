import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  broadcastConsoleSessionChange,
  consoleAuthenticationError,
  ConsoleAuthenticationError,
  onConsoleSessionChange,
  parseConsoleAuthDiscovery,
  safeConsoleReturnPath,
  submitConsoleAuthAction,
  type ConsoleAuthDiscovery,
  type ConsoleAuthenticationState,
  type ConsoleLoginMethod,
} from "./authentication";
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
import {
  subscribeIdentityTransitions,
  withIdentityTransition,
} from "./identity-transition";
import type { PageProps } from "./index";
import {
  type consolePageDescriptorSchema,
  consolePageCatalogSchema,
  consoleSessionSchema,
  type ConsoleSession,
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
  /** Logical retirement precedes React unmount, including retained page handles. */
  signal?: AbortSignal;
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
  const [discovery, setDiscovery] = useState<ConsoleAuthDiscovery>();
  const [session, setSession] = useState<ConsoleSession>();
  const [state, setState] = useState<ConsoleAuthenticationState>("loading");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<Error>();
  const operation = useRef<AbortController | undefined>(undefined);
  const lease = useRef<AbortController | undefined>(undefined);
  const activationEpoch = useRef(0);
  const epoch = activationEpoch.current;
  const previouslyAdmitted = useRef(false);
  useEffect(() => {
    const lifetime = new AbortController();
    lease.current = lifetime;
    let admitted = false;
    const retire = (
      reason: "expired" | "forbidden" = "expired",
      preserveAction = false
    ) => {
      activationEpoch.current += 1;
      lifetime.abort();
      if (!preserveAction) {
        operation.current?.abort();
        operation.current = undefined;
        setBusy(false);
      }
      retireSessionReads();
      setAdmission(undefined);
      if (reason === "expired") {
        setSession(undefined);
      }
      setState(preserveAction ? "loading" : reason);
      setAdmissionError(new ConsoleAuthenticationError(reason));
    };
    const expired = () => retire();
    window.addEventListener("lenso-session-expired", expired);
    const stopStorage = onConsoleSessionChange(expired);
    const stopTransitions = subscribeIdentityTransitions((phase, remote) => {
      if (phase === "begin") {
        retire("expired", !remote && operation.current !== undefined);
      }
    });
    setAdmission(undefined);
    setSession(undefined);
    setAdmissionError(undefined);
    setActionError(undefined);
    setDiscovery(undefined);
    setState("loading");
    const sessionPath = `${consoleHttpPaths.api_base_path}/console/v1/session`;
    const request = async (path: string) => {
      const response = await sessionFetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        signal: lifetime.signal,
      });
      if (!response.ok) {
        let explicitlyExpired = false;
        if (response.status === 401) {
          try {
            const problem = await response.json();
            explicitlyExpired = problem.code === "session_expired";
          } catch {
            lifetime.signal.throwIfAborted();
          }
        }
        if (
          admitted &&
          path === sessionPath &&
          [401, 403, 412].includes(response.status)
        ) {
          retire(response.status === 403 ? "forbidden" : "expired");
        }
        throw consoleAuthenticationError(
          path === `${consoleHttpPaths.auth_base_path}/methods` &&
            response.status === 403
            ? 503
            : response.status,
          previouslyAdmitted.current || explicitlyExpired
        );
      }
      return response;
    };
    let revalidate: (() => Promise<void>) | undefined;
    const onFocus = async () => {
      try {
        await revalidate?.();
      } catch (error) {
        if (!lifetime.signal.aborted) {
          setState("unavailable");
          setAdmissionError(
            error instanceof Error
              ? error
              : new ConsoleAuthenticationError("unavailable")
          );
        }
      }
    };
    window.addEventListener("focus", onFocus);
    const load = async () => {
      const methods = await request(
        `${consoleHttpPaths.auth_base_path}/methods`
      );
      const metadata = await methods.json();
      lifetime.signal.throwIfAborted();
      const available = parseConsoleAuthDiscovery(metadata);
      configureSessionCsrf(available);
      setDiscovery(available);
      const sessionResponse = await request(sessionPath);
      const identity = consoleSessionSchema.parse(await sessionResponse.json());
      lifetime.signal.throwIfAborted();
      setSession(identity);
      const readScope = sessionResponse.headers.get("x-lenso-read-scope");
      if (
        identity.authenticated !== true ||
        typeof identity.subject !== "string" ||
        !readScope ||
        !/^[a-f0-9]{64}$/u.test(readScope)
      ) {
        throw new Error("Backend session metadata is unavailable.");
      }
      if (!identity.console_access) {
        throw new ConsoleAuthenticationError("forbidden");
      }
      revalidate = async () => {
        const current = await request(sessionPath);
        const currentSession = consoleSessionSchema.parse(await current.json());
        lifetime.signal.throwIfAborted();
        if (!currentSession.console_access) {
          retire("forbidden");
        } else if (
          current.headers.get("x-lenso-read-scope") !== readScope ||
          currentSession.subject !== identity.subject
        ) {
          retire();
        } else {
          setState("authenticated");
          setAdmissionError(undefined);
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
      previouslyAdmitted.current = true;
      setState("authenticated");
      setAdmission({
        mounts: selectedMounts,
        subject: identity.subject,
        readScope,
        signal: lifetime.signal,
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
          setState(
            error instanceof ConsoleAuthenticationError
              ? error.state
              : "unavailable"
          );
        }
      }
    };
    void initialize();
    return () => {
      lifetime.abort();
      lease.current = undefined;
      activationEpoch.current += 1;
      operation.current?.abort();
      operation.current = undefined;
      retireSessionReads();
      configureSessionCsrf(undefined);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("lenso-session-expired", expired);
      stopStorage();
      stopTransitions();
    };
  }, [attempt, selectMounts]);
  async function act(
    action: string,
    input: unknown,
    kind: "login" | "logout" | "renew" = "login"
  ) {
    const logout = kind === "logout";
    if (
      !lease.current ||
      activationEpoch.current !== epoch ||
      operation.current
    ) {
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setActionError(undefined);
    const subject = session?.subject;
    if (logout) {
      lease.current.abort();
      retireSessionReads();
      setAdmission(undefined);
      setSession(undefined);
      setState("loading");
    }
    try {
      await withIdentityTransition(
        () =>
          submitConsoleAuthAction(action, input, controller.signal, subject),
        controller.signal
      );
      controller.signal.throwIfAborted();
      broadcastConsoleSessionChange();
      if (logout) {
        previouslyAdmitted.current = false;
      }
      setAttempt((value) => value + 1);
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure =
          error instanceof ConsoleAuthenticationError &&
          (logout || state === "authenticated") &&
          error.state === "unauthenticated"
            ? new ConsoleAuthenticationError("expired")
            : error instanceof Error
              ? error
              : new ConsoleAuthenticationError("unavailable");
        setActionError(failure);
        if (
          kind === "renew" &&
          !(
            failure instanceof ConsoleAuthenticationError &&
            failure.state === "expired"
          )
        ) {
          // The write lock retired admission before dispatch. A rejected renewal
          // is not proof of expiry; only a fresh session read can re-admit it.
          setAttempt((value) => value + 1);
          return;
        }
        setState(
          failure instanceof ConsoleAuthenticationError &&
            failure.state === "expired"
            ? "expired"
            : logout || state === "authenticated"
              ? "unavailable"
              : state
        );
      }
    } finally {
      if (operation.current === controller) {
        operation.current = undefined;
        setBusy(false);
      }
    }
  }
  return {
    admission,
    error: admissionError,
    state,
    discovery,
    session,
    busy,
    actionError,
    login: (method: ConsoleLoginMethod, input: unknown) => {
      if (!discovery?.methods.includes(method) || method.kind === "redirect") {
        return Promise.reject(new TypeError("Login method is not installed."));
      }
      return act(method.action, input);
    },
    redirect: (
      method: ConsoleLoginMethod,
      returnTo?: string,
      allowedRoots?: readonly string[]
    ) => {
      if (
        activationEpoch.current !== epoch ||
        operation.current ||
        !discovery?.methods.includes(method) ||
        method.kind !== "redirect"
      ) {
        return;
      }
      const url = new URL(method.action, window.location.origin);
      url.searchParams.set(
        "return_to",
        safeConsoleReturnPath(returnTo, allowedRoots)
      );
      window.location.assign(url.href);
    },
    logout: () =>
      discovery?.session?.logout
        ? act(discovery.session.logout, {}, "logout")
        : Promise.reject(new TypeError("Logout is not installed.")),
    renew: () =>
      discovery?.session?.renew
        ? act(discovery.session.renew, {}, "renew")
        : Promise.reject(new TypeError("Renewal is not installed.")),
    cancel: () => {
      if (activationEpoch.current !== epoch) {
        return;
      }
      operation.current?.abort();
      operation.current = undefined;
      setBusy(false);
      setAttempt((value) => value + 1);
    },
    retry: () => {
      if (activationEpoch.current === epoch) {
        setAttempt((value) => value + 1);
      }
    },
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
