import { Button } from "@lenso/ui/button";
import { useEffect, useId, useRef, useState } from "react";

import { useWorkspace } from "./navigation";
import type { ConsolePageOperationContext } from "./protocol";
import type { WorkspaceServices } from "./service-types";

/** Opt-in inline inspection. UI and agents consume the same services.inspect result. */
export function WorkspaceOperationContext({
  service,
  operation,
}: {
  service: string;
  operation?: string;
}) {
  const workspace = useWorkspace();
  return (
    <OperationContextPanel
      key={JSON.stringify([
        workspace.activation?.key,
        workspace.mount.id,
        workspace.mount.revision,
        service,
        operation,
      ])}
      service={service}
      operation={operation}
      services={workspace.services}
      signal={workspace.signal}
    />
  );
}

function OperationContextPanel({
  service,
  operation,
  services,
  signal,
}: {
  service: string;
  operation?: string | undefined;
  services: WorkspaceServices;
  signal: AbortSignal;
}) {
  const id = useId();
  const [context, setContext] = useState<ConsolePageOperationContext>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const retire = () => {
      pending.current?.abort();
      pending.current = undefined;
      setContext(undefined);
      setBusy(false);
      setError(false);
    };
    retire();
    signal.addEventListener("abort", retire, { once: true });
    return () => {
      signal.removeEventListener("abort", retire);
      pending.current?.abort();
      pending.current = undefined;
    };
  }, [services, signal]);
  const inspect = async () => {
    if (!services.inspect || pending.current || signal.aborted) {
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const combined = AbortSignal.any([signal, controller.signal]);
    setBusy(true);
    setContext(undefined);
    setError(false);
    try {
      const result = await services.inspect(
        service,
        operation ? { operation } : {},
        { signal: combined }
      );
      combined.throwIfAborted();
      setContext(result);
    } catch {
      if (!combined.aborted) {
        setError(true);
      }
    } finally {
      if (!combined.aborted) {
        setBusy(false);
      }
      if (pending.current === controller) {
        pending.current = undefined;
      }
    }
  };
  return (
    <section
      aria-label="Operation context"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <Button
        variant="secondary"
        aria-controls={id}
        disabled={busy || !services.inspect}
        onClick={() => {
          void inspect();
        }}
      >
        {busy ? "Inspecting…" : "Inspect operation context"}
      </Button>
      {!services.inspect && (
        <p>Operation context is unavailable on this host.</p>
      )}
      {error && (
        <p role="alert">Operation context could not be read. Try again.</p>
      )}
      <div id={id} aria-live="polite" aria-busy={busy}>
        {context && (
          <>
            <p>Static declarations · unverified</p>
            <dl>
              <dt>Page</dt>
              <dd>
                {context.page.mountId} · revision {context.page.revision}
              </dd>
              <dt>Owner instance</dt>
              <dd>{context.page.ownerInstance}</dd>
              <dt>Runtime instance / generation</dt>
              <dd>Unavailable: no Runtime binding configured.</dd>
              <dt>Recent failures</dt>
              <dd>Unavailable: no collector configured.</dd>
            </dl>
            {context.operations.map((entry) => (
              <article key={entry.name} aria-label={entry.name}>
                <h3>
                  {context.service}.{entry.name}
                </h3>
                <dl>
                  <dt>Owner method</dt>
                  <dd>
                    {entry.pluginId}.{entry.method}
                  </dd>
                  <dt>Effect</dt>
                  <dd>{entry.effect}</dd>
                  <dt>Retry</dt>
                  <dd>{entry.metadata.retry}</dd>
                  <dt>Cancellation</dt>
                  <dd>{entry.metadata.cancellation}</dd>
                  <dt>Source</dt>
                  <dd>
                    {entry.metadata.source
                      ? `${entry.metadata.source.file}${entry.metadata.source.line ? `:${entry.metadata.source.line}` : ""}`
                      : "Unavailable"}
                  </dd>
                  <dt>Output</dt>
                  <dd>
                    {entry.metadata.outputDescription ??
                      "No description declared"}{" "}
                    · schema unavailable
                  </dd>
                  <dt>Error schema</dt>
                  <dd>Unavailable</dd>
                </dl>
              </article>
            ))}
            {context.nextOffset !== null && (
              <p>
                More declarations exist. Narrow the operation query to inspect a
                specific method.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
