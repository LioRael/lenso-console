import { useEffect, useEffectEvent, useRef, useState } from "react";

import { readAdmissionBootstrap } from "./admission-bootstrap";
import {
  consoleAdmissionSchema,
  type ConsoleOperationCatalog,
  type consolePageDescriptorSchema,
  consolePageCatalogSchema,
  consoleSessionSchema,
  type ConsoleSession,
} from "./admission-protocol";
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
import { consoleHttpPaths } from "./http-paths";
import {
  subscribeIdentityTransitions,
  withIdentityTransition,
  withConditionalIdentityTransition,
} from "./identity-transition";
import {
  configureSessionCsrf,
  configureSessionReadScope,
  retireSessionReads,
  sessionFetch,
} from "./session-fetch";
import {
  parseSessionRenewalStatus,
  sessionRenewalDue,
  startSessionRenewal,
} from "./session-renewal";

export type BrowserMount = ReturnType<
  typeof consolePageDescriptorSchema.parse
> & {
  basePath: string;
};
export type BrowserAdmission = {
  mounts: readonly BrowserMount[];
  subject: string;
  readScope: string;
  /** Fresh entry metadata from the same admitted HTTP request, never a permission grant. */
  catalog?: ConsoleOperationCatalog;
  /** Logical retirement precedes React unmount, including retained page handles. */
  signal?: AbortSignal;
};

const allMounts = (mounts: readonly BrowserMount[]) => mounts;

/** Session admission is shared by Console and the SDK's backend preview. */
export function useConsoleAdmission(
  selectMounts: (
    mounts: readonly BrowserMount[]
  ) => readonly BrowserMount[] = allMounts,
  options: { catalog?: boolean } = {}
) {
  const includeCatalog = options.catalog === true;
  const [attempt, setAttempt] = useState(0);
  const [admission, setAdmission] = useState<BrowserAdmission>();
  const [admissionError, setAdmissionError] = useState<Error>();
  const [discovery, setDiscovery] = useState<ConsoleAuthDiscovery>();
  const [session, setSession] = useState<ConsoleSession>();
  const [state, setState] = useState<ConsoleAuthenticationState>("loading");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<Error>();
  const operation = useRef<AbortController | undefined>(undefined);
  const pendingLogout = useRef<AbortController | undefined>(undefined);
  const lease = useRef<AbortController | undefined>(undefined);
  const activationEpoch = useRef(0);
  const epoch = activationEpoch.current;
  const previouslyAdmitted = useRef(false);
  useEffect(() => {
    const lifetime = new AbortController();
    lease.current = lifetime;
    let admitted = false;
    const loggingOut = () =>
      pendingLogout.current !== undefined &&
      !pendingLogout.current.signal.aborted;
    const retire = (
      reason: "expired" | "forbidden" = "expired",
      preserveAction = loggingOut()
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
    const pageHide = () => retire();
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        retire();
        if (!loggingOut()) {
          setAttempt((value) => value + 1);
        }
      }
    };
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    const stopStorage = onConsoleSessionChange(() => {
      retire();
      if (!loggingOut()) {
        setAttempt((value) => value + 1);
      }
    });
    const stopTransitions = subscribeIdentityTransitions((phase, remote) => {
      if (phase === "begin") {
        // A queued logout must survive a renewal that already owns the lock.
        // Keep its admission retired until that explicit logout finishes.
        retire(
          "expired",
          loggingOut() || (!remote && operation.current !== undefined)
        );
      } else if (remote && !loggingOut()) {
        // Renewal/login/logout all re-enter through a fresh authoritative admission.
        setAttempt((value) => value + 1);
      }
    });
    setAdmission(undefined);
    setSession(undefined);
    setAdmissionError(undefined);
    setActionError(undefined);
    setDiscovery(undefined);
    setState("loading");
    const sessionPath = `${consoleHttpPaths.api_base_path}/console/v1/session`;
    const request = async (path: string, allowMissing = false) => {
      const response = await sessionFetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        signal: lifetime.signal,
      });
      if (allowMissing && response.status === 404) {
        return response;
      }
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
      const [methodsResult, sessionResult] = await readAdmissionBootstrap(
        () => request(`${consoleHttpPaths.auth_base_path}/methods`),
        () =>
          request(
            `${consoleHttpPaths.api_base_path}/console/v1/admission${includeCatalog ? "?catalog=1" : ""}`,
            true
          )
      );
      lifetime.signal.throwIfAborted();
      if (methodsResult.status === "rejected") {
        throw methodsResult.reason;
      }
      const metadata = await methodsResult.value.json();
      lifetime.signal.throwIfAborted();
      const available = parseConsoleAuthDiscovery(
        metadata,
        methodsResult.value.url
      );
      configureSessionCsrf(available, methodsResult.value.url);
      setDiscovery(available);
      if (sessionResult.status === "rejected") {
        throw sessionResult.reason;
      }
      const entryResponse = sessionResult.value;
      // Only an absent protocol permits the older two-request entry. Authentication,
      // cancellation and service failures never replay admission through another path.
      const entry =
        entryResponse.status === 404
          ? undefined
          : consoleAdmissionSchema.parse(await entryResponse.json());
      if (!entry) {
        await entryResponse.body?.cancel();
      }
      const sessionResponse = entry
        ? entryResponse
        : await request(sessionPath);
      const identity =
        entry?.session ??
        consoleSessionSchema.parse(await sessionResponse.json());
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
      const validateSession = async () => {
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
      let revalidation: Promise<void> | undefined;
      const sharedRevalidate = async () => {
        try {
          await validateSession();
        } finally {
          revalidation = undefined;
        }
      };
      revalidate = () => (revalidation ??= sharedRevalidate());
      configureSessionReadScope(readScope, revalidate);
      let catalog = entry?.pages;
      if (!catalog) {
        const pagesResponse = await request(
          `${consoleHttpPaths.api_base_path}/console/v1/pages`
        );
        catalog = consolePageCatalogSchema.parse(await pagesResponse.json());
      }
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
        ...(entry?.catalog ? { catalog: entry.catalog } : {}),
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
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      stopStorage();
      stopTransitions();
    };
  }, [attempt, selectMounts, includeCatalog]);
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
      pendingLogout.current = controller;
      lease.current.abort();
      retireSessionReads();
      setAdmission(undefined);
      setSession(undefined);
      setState("loading");
    }
    try {
      if (kind === "renew" && discovery?.session?.status) {
        const changed = await withConditionalIdentityTransition(
          async () => {
            const status = await renewalStatus(
              discovery.session!.status!,
              subject,
              controller.signal,
              true
            );
            return sessionRenewalDue(status);
          },
          () =>
            submitConsoleAuthAction(action, input, controller.signal, subject),
          controller.signal
        );
        if (!changed) {
          return;
        }
      } else {
        await withIdentityTransition(
          () =>
            submitConsoleAuthAction(action, input, controller.signal, subject),
          controller.signal
        );
      }
      controller.signal.throwIfAborted();
      if (logout) {
        pendingLogout.current = undefined;
      }
      if (kind !== "renew") {
        broadcastConsoleSessionChange();
      }
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
      if (pendingLogout.current === controller) {
        pendingLogout.current = undefined;
      }
      if (operation.current === controller) {
        operation.current = undefined;
        setBusy(false);
      }
    }
  }
  const automaticRenew = useEffectEvent(() =>
    discovery?.session?.renew
      ? act(discovery.session.renew, {}, "renew")
      : Promise.resolve()
  );
  useEffect(() => {
    if (
      state !== "authenticated" ||
      !session ||
      !discovery?.session?.status ||
      !discovery.session.renew ||
      typeof navigator === "undefined" ||
      !navigator.locks
    ) {
      return;
    }
    const controller = new AbortController();
    const stop = startSessionRenewal({
      signal: controller.signal,
      status: () =>
        renewalStatus(
          discovery.session!.status!,
          session.subject,
          controller.signal
        ),
      renew: () => automaticRenew(),
      unavailable(error) {
        if (
          error instanceof ConsoleAuthenticationError &&
          ["expired", "unauthenticated", "forbidden"].includes(error.state)
        ) {
          setAttempt((value) => value + 1);
          return;
        }
        setActionError(
          error instanceof Error
            ? error
            : new Error("Session renewal unavailable")
        );
      },
    });
    return () => {
      controller.abort();
      stop();
    };
  }, [
    state,
    session,
    discovery?.session?.status,
    discovery?.session?.renew,
    attempt,
  ]);
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
        safeConsoleReturnPath(
          returnTo ??
            `${window.location.pathname}${window.location.search}${window.location.hash}`,
          allowedRoots
        )
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
export function assertConsoleMountPaths(
  mounts: readonly Pick<BrowserMount, "id" | "basePath">[]
) {
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

async function renewalStatus(
  path: string,
  subject: string | undefined,
  signal: AbortSignal,
  writeLockHeld = false
) {
  // The conditional renewal check already owns the exclusive identity lock.
  // Re-entering sessionFetch would queue a shared lock behind ourselves.
  const reader = writeLockHeld ? fetch : sessionFetch;
  const response = await reader(path, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
    headers: subject ? { "x-lenso-expected-subject": subject } : {},
  });
  if (!response.ok) {
    throw consoleAuthenticationError(response.status, true);
  }
  const status = parseSessionRenewalStatus(await response.json());
  signal.throwIfAborted();
  if (status.subjectId !== subject) {
    throw new ConsoleAuthenticationError("expired");
  }
  return status;
}

export {
  parseSessionRenewalStatus,
  sessionRenewalDue,
  startSessionRenewal,
} from "./session-renewal";
export type { SessionRenewalStatus } from "./session-renewal";
