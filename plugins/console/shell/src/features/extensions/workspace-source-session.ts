import {
  consoleApiPath,
  type WorkspaceSource,
} from "../../lib/console-http-paths";
import {
  withIdentityRead,
  withWorkspaceIdentityTransition,
} from "../../lib/identity-transition";
import {
  parseSessionCsrf,
  sessionFetch,
  type SessionFetchScope,
} from "../../lib/session-fetch";

export type WorkspaceSourceTransport = SessionFetchScope & {
  sourceId: string;
  subject: string;
  readScope: string;
  signal: AbortSignal;
};

const sessions = new Map<string, WorkspaceSourceTransport>();
const generations = new Map<string, number>();
export const workspaceSourceRetiredEvent = "lenso-workspace-source-retired";

export function retireWorkspaceSources(sourceIds?: readonly string[]) {
  for (const id of sourceIds ?? generations.keys()) {
    const session = sessions.get(id);
    if (session) {
      session.retire();
    } else {
      generations.set(id, (generations.get(id) ?? 0) + 1);
    }
  }
}

async function json(
  response: Response,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  signal?.throwIfAborted();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workspace session response is invalid");
  }
  return value as Record<string, unknown>;
}

async function binding(
  source: WorkspaceSource,
  account: string,
  signal: AbortSignal
) {
  const response = await sessionFetch(`${source.auth_base_path}/session`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ?? null,
  });
  if ([401, 403, 404].includes(response.status)) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Workspace access could not be checked. Try again.");
  }
  const value = await json(response, signal);
  return value.eligible === true &&
    value.source_issuer === source.account_issuer &&
    value.source_subject === account &&
    typeof value.operator_subject === "string" &&
    value.operator_subject.length > 0
    ? value.operator_subject
    : null;
}

async function policy(source: WorkspaceSource, signal?: AbortSignal) {
  const response = await sessionFetch(`${source.auth_base_path}/methods`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ?? null,
  });
  if (!response.ok) {
    throw new Error("Workspace authentication configuration is unavailable");
  }
  const csrf = parseSessionCsrf(await json(response, signal));
  if (!csrf) {
    throw new Error("Workspace authentication configuration is invalid");
  }
  return csrf;
}

async function operatorSession(
  source: WorkspaceSource,
  expected: string,
  signal: AbortSignal
) {
  const response = await fetch(`${source.api_base_path}/console/v1/session`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  signal.throwIfAborted();
  if ([401, 403, 412].includes(response.status)) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Workspace session is unavailable. Try again.");
  }
  const value = await json(response, signal);
  const readScope = response.headers.get("x-lenso-read-scope");
  if (
    value.mode !== "required" ||
    value.authenticated !== true ||
    value.subject !== expected
  ) {
    return null;
  }
  if (!readScope || !/^[a-f0-9]{64}$/u.test(readScope)) {
    throw new Error("Workspace session scope is invalid");
  }
  return readScope;
}

// Called inside the origin-wide exclusive lock, before any account-cookie write.
export async function signOutWorkspaceSources(
  sources: readonly WorkspaceSource[]
) {
  retireWorkspaceSources(sources.map((source) => source.id));
  for (const source of sources) {
    const csrf = await policy(source);
    const response = await sessionFetch(
      `${source.auth_base_path}/logout`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      { apiBasePath: source.api_base_path, csrf, retire: () => undefined }
    );
    const signedOut = await json(response);
    if (!response.ok || signedOut.signed_out !== true) {
      throw new Error(
        "Workspace could not be signed out. Try again before switching accounts."
      );
    }
  }
}

export async function readWorkspaceSourceSession(
  source: WorkspaceSource,
  account: string,
  signal: AbortSignal
): Promise<WorkspaceSourceTransport | null> {
  let generation = generations.get(source.id) ?? 0;
  generations.set(source.id, generation);
  const admitted = await withIdentityRead(async () => {
    const subject = await binding(source, account, signal);
    return subject
      ? { subject, readScope: await operatorSession(source, subject, signal) }
      : null;
  }, signal);
  if (generation !== generations.get(source.id)) {
    return null;
  }
  if (!admitted) {
    sessions.get(source.id)?.retire();
    return null;
  }
  let { subject, readScope } = admitted;
  if (!readScope) {
    readScope = await withWorkspaceIdentityTransition(async () => {
      signal.throwIfAborted();
      generation = generations.get(source.id) ?? 0;
      const accountResponse = await fetch(
        consoleApiPath("/api/console/v1/session"),
        {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        }
      );
      const accountSession = await json(accountResponse, signal);
      if (!accountResponse.ok || accountSession.subject !== account) {
        throw new Error("The account changed. Refresh workspace access.");
      }
      const liveSubject = await binding(source, account, signal);
      if (!liveSubject) {
        return null;
      }
      subject = liveSubject;
      // Another tab may already have exchanged while this request waited.
      const existing = await operatorSession(source, subject, signal);
      if (existing) {
        return existing;
      }
      await signOutWorkspaceSources([source]);
      generation = generations.get(source.id) ?? 0;
      const response = await sessionFetch(`${source.auth_base_path}/exchange`, {
        // Cookie writes cannot be cancelled by a retired catalog query: the
        // server may still complete them after fetch rejects and releases the lock.
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if ([401, 403, 409, 412].includes(response.status)) {
        return null;
      }
      if (!response.ok) {
        throw new Error(
          "Workspace access is temporarily unavailable. Try again."
        );
      }
      const exchanged = await json(response);
      signal.throwIfAborted();
      if (
        exchanged.authenticated !== true ||
        exchanged.redirect !== `${source.shell_base_path}/`
      ) {
        throw new Error("Workspace exchange response is invalid");
      }
      // Binding state is a candidate; only the independently admitted operator
      // session establishes this transport. A redirect never establishes it.
      return (await binding(source, account, signal)) === subject
        ? operatorSession(source, subject, signal)
        : null;
    }, source.id);
  }
  signal.throwIfAborted();
  if (generation !== generations.get(source.id)) {
    return null;
  }
  if (!readScope) {
    sessions.get(source.id)?.retire();
    return null;
  }
  return withIdentityRead(async () => {
    // A queued account switch must not readmit the preceding operator session.
    const liveSubject = await binding(source, account, signal);
    const liveScope = await operatorSession(source, subject, signal);
    if (generation !== generations.get(source.id)) {
      return null;
    }
    if (liveSubject !== subject || liveScope !== readScope) {
      sessions.get(source.id)?.retire();
      return null;
    }
    const previous = sessions.get(source.id);
    if (
      previous?.subject === subject &&
      previous.readScope === readScope &&
      !previous.signal.aborted
    ) {
      return previous;
    }
    const csrf = await policy(source, signal);
    if (generation !== generations.get(source.id)) {
      return null;
    }
    // Shared readers may finish methods concurrently. Publication has no await:
    // reuse the latest transport instead of leaving an overwritten one alive.
    const current = sessions.get(source.id);
    if (
      current?.subject === subject &&
      current.readScope === readScope &&
      !current.signal.aborted
    ) {
      return current;
    }
    current?.retire();
    const controller = new AbortController();
    const transport: WorkspaceSourceTransport = {
      sourceId: source.id,
      apiBasePath: source.api_base_path,
      subject,
      readScope,
      csrf,
      signal: controller.signal,
      retire: () => {
        controller.abort();
        if (sessions.get(source.id) === transport) {
          generations.set(source.id, (generations.get(source.id) ?? 0) + 1);
          sessions.delete(source.id);
          window.dispatchEvent(new Event(workspaceSourceRetiredEvent));
        }
      },
    };
    signal.throwIfAborted();
    sessions.set(source.id, transport);
    return transport;
  }, signal);
}
