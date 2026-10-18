import type { ConsoleSessionAdapter } from "@lenso/console-react";

/** Supplied by the authenticated host, never URL/storage/chat-derived identity. */
export interface AgentResumeScope {
  session: ConsoleSessionAdapter;
  projectId: string;
}
export interface AgentSessionResume {
  getScope(): string | undefined;
  subscribe(listener: () => void): () => void;
  read(scope: string, signal: AbortSignal): Promise<string | undefined>;
  save(scope: string, sessionId: string, signal: AbortSignal): Promise<void>;
  clear(scope: string): void;
  dispose(): void;
}
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/u.test(value);

const fingerprint = async (scope: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope))
    ),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");

/** One opt-in record per installation, no cross-project session collection.
 * Use sessionStorage; the host must dispose this observer when its host ends. */
export function createAgentSessionResume(options: {
  key: string;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  scope: {
    getSnapshot(): AgentResumeScope | undefined;
    subscribe(listener: () => void): () => void;
  };
}): AgentSessionResume {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(options.key)) {
    throw new TypeError("An explicit installation key is required");
  }
  const key = `lenso.agent-session.v1:${options.key}`;
  const listeners = new Set<() => void>();
  const trusted = () => {
    const snapshot = options.scope.getSnapshot();
    if (
      !snapshot ||
      snapshot.session.state !== "ready" ||
      !snapshot.projectId.trim() ||
      snapshot.projectId.length > 512 ||
      !snapshot.session.scopeKey.trim() ||
      snapshot.session.scopeKey === "local" ||
      snapshot.session.scopeKey.length > 2048
    ) {
      return undefined;
    }
    return JSON.stringify([snapshot.projectId, snapshot.session.scopeKey]);
  };
  let current = trusted(),
    disposed = false;
  let revision = 0;
  const remove = () => options.storage.removeItem(key);
  const changed = () => {
    const next = trusted();
    const state = options.scope.getSnapshot()?.session.state;
    // Initial auth loading may precede the verified scope after a reload.
    // It never permits reads; a known scope transition or logout clears eagerly.
    if ((current && current !== next) || (!next && state !== "loading")) {
      try {
        remove();
      } catch {
        // No authority or cached content depends on storage.
      }
    }
    if (current !== next) {
      revision += 1;
      current = next;
      for (const listener of listeners) {
        listener();
      }
    }
  };
  changed();
  const unsubscribe = options.scope.subscribe(changed);
  const check = (scope: string, signal?: AbortSignal, expected = revision) => {
    signal?.throwIfAborted();
    if (
      disposed ||
      expected !== revision ||
      !scope ||
      current !== scope ||
      trusted() !== scope
    ) {
      throw new Error("The trusted Agent scope has changed");
    }
  };
  return {
    getScope: () => (disposed ? undefined : trusted()),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async read(scope, signal) {
      check(scope, signal);
      const expected = revision;
      const hash = await fingerprint(scope);
      check(scope, signal, expected);
      const raw = options.storage.getItem(key);
      if (!raw) {
        return undefined;
      }
      let record: unknown;
      try {
        record = raw.length <= 1024 ? JSON.parse(raw) : null;
      } catch {
        record = null;
      }
      if (
        !Array.isArray(record) ||
        record.length !== 2 ||
        record[0] !== hash ||
        !validId(record[1])
      ) {
        remove();
        return undefined;
      }
      return record[1];
    },
    async save(scope, sessionId, signal) {
      if (!validId(sessionId)) {
        throw new TypeError("Invalid session ID");
      }
      check(scope, signal);
      const expected = revision;
      const hash = await fingerprint(scope);
      check(scope, signal, expected);
      options.storage.setItem(key, JSON.stringify([hash, sessionId]));
    },
    clear(scope) {
      check(scope);
      remove();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      for (const listener of listeners) {
        listener();
      }
      listeners.clear();
    },
  };
}
