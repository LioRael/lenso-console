import { Accordion } from "@lenso/ui/accordion";
import { Button } from "@lenso/ui/button";
import { useEffect, useId, useRef, useState } from "react";

import type { OperationExecutionEvidence } from "./execution-evidence";
import { useWorkspace } from "./navigation";
import type {
  ConsolePageOperationContext,
  ConsoleOperationInspection,
  ConsoleOperationMetadata,
} from "./protocol";
import type { WorkspaceServices } from "./service-types";

/** Controlled evidence from this invocation only; never infer a task or business outcome. */
export function WorkspaceExecutionEvidence({
  evidence,
  pending = false,
}: {
  evidence?: OperationExecutionEvidence | undefined;
  pending?: boolean;
}) {
  return (
    <Accordion.Root>
      <Accordion.Item value="execution">
        <Accordion.Heading>
          <Accordion.Trigger>
            Latest call evidence
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              {pending ? (
                <output>Waiting for this call…</output>
              ) : evidence ? (
                <>
                  <dl>
                    <dt>Instance</dt>
                    <dd>{evidence.instanceId}</dd>
                    <dt>Operation</dt>
                    <dd>
                      {evidence.operation.pluginId}.{evidence.operation.method}
                    </dd>
                    {evidence.trace && (
                      <>
                        <dt>Trace ID</dt>
                        <dd>{evidence.trace.traceId}</dd>
                        <dt>Span ID</dt>
                        <dd>{evidence.trace.spanId}</dd>
                      </>
                    )}
                  </dl>
                  {!evidence.trace && <p>Trace not provided.</p>}
                  <p>
                    Execution identity only. This does not confirm export,
                    success or durable effects.
                  </p>
                </>
              ) : (
                <p>Execution evidence not provided.</p>
              )}
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}

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

function SourceReference({
  source,
}: {
  source: ConsoleOperationMetadata["source"];
}) {
  return (
    <>
      {source
        ? `${source.file}${source.line ? `:${source.line}` : ""}`
        : "Unavailable"}
    </>
  );
}

function InspectionFacts({
  inspection,
}: {
  inspection: ConsoleOperationInspection | undefined;
}) {
  const runtime = inspection?.runtime;
  const recent = inspection?.recentFailures;
  const execution = inspection?.execution;
  return (
    <dl>
      {execution && (
        <>
          <dt>TS development instance / generation</dt>
          <dd>
            {execution.instanceId} · {execution.generation}
          </dd>
          <dt>Watched input digest (not a release SHA)</dt>
          <dd>{execution.codeRevision.digest}</dd>
          <dt>TS output declaration</dt>
          <dd>{execution.outputSchemaAvailability}</dd>
          <dt>TS declared error codes</dt>
          <dd>
            {execution.errors.map((error) => error.code).join(", ") ||
              "None declared"}
          </dd>
        </>
      )}
      <dt>Runtime instance / generation</dt>
      <dd>
        {runtime?.availability === "measured"
          ? runtime.instances.length
            ? runtime.instances.map((instance) => (
                <p key={instance.id}>
                  {instance.id} · {instance.generation} · {instance.state}
                </p>
              ))
            : "Measured: no matching instances"
          : `Unavailable: ${runtime?.reason ?? "runtime-binding-not-configured"}`}
      </dd>
      {runtime?.availability === "measured" && (
        <>
          <dt>Runtime contract</dt>
          <dd>Static build manifest · unverified</dd>
        </>
      )}
      <dt>Recent failures</dt>
      <dd>
        {recent?.availability === "available" ? (
          <>
            <p>
              {recent.instanceId} · {recent.generation} · transient collector
            </p>
            {recent.references.map((reference) => (
              <p key={reference.id}>
                {reference.id} · {reference.code} · {reference.effectState}
              </p>
            ))}
          </>
        ) : (
          `Unavailable: ${recent?.reason ?? "collector-not-configured"}`
        )}
      </dd>
    </dl>
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
            </dl>
            {context.operations.map((entry) => (
              <article key={entry.name} aria-label={entry.name}>
                <h3>
                  {context.service}.{entry.name}
                </h3>
                <InspectionFacts inspection={entry.inspection} />
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
                  <dt>
                    {entry.inspection?.execution?.operationSource
                      ? "TS source"
                      : "Console source"}
                  </dt>
                  <dd>
                    <SourceReference
                      source={
                        entry.inspection?.execution?.operationSource ??
                        entry.metadata.source
                      }
                    />
                  </dd>
                  <dt>Console output declaration</dt>
                  <dd>
                    {entry.metadata.outputDescription ??
                      "No description declared"}{" "}
                    · {entry.metadata.outputContract.availability}
                  </dd>
                  <dt>Console error declaration</dt>
                  <dd>{entry.metadata.errorContract.availability}</dd>
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
