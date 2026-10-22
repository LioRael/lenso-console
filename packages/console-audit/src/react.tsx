import {
  ConsolePageScope,
  useConsoleActivation,
  type ConsoleBinding,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { Button } from "@lenso/ui/button";
import { Form } from "@lenso/ui/form";
import { Input } from "@lenso/ui/input";
import { Label } from "@lenso/ui/label";
import { Modal } from "@lenso/ui/modal";
import { Select } from "@lenso/ui/select";
import { TextField } from "@lenso/ui/textfield";
import { Toolbar } from "@lenso/ui/toolbar";
import * as stylex from "@stylexjs/stylex";
import { ScrollText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  auditFilter,
  type AuditClient,
  type AuditCursor,
  type AuditEvent,
  type AuditFilter,
} from "./client";

const results = [
  "all",
  "intent",
  "success",
  "failure",
  "denied",
  "unknown",
].map((value) => ({ value, label: value }));
function AuditContent({
  services,
  signal,
  activation,
}: ConsoleLocalPageProps<AuditClient>) {
  const [page, setPage] = useState<Awaited<ReturnType<AuditClient["query"]>>>();
  const [filter, setFilter] = useState<AuditFilter>({});
  const [result, setResult] = useState("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AuditEvent>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailPending, setDetailPending] = useState(false);
  const [cursor, setCursor] = useState<AuditCursor>();
  const version = useRef(0);
  const detailVersion = useRef(0);
  const live = useCallback(
    () => !signal.aborted && activation.isCurrent(),
    [signal, activation]
  );
  const load = useCallback(
    async (input: AuditFilter, next?: AuditCursor) => {
      version.current += 1;
      const request = version.current;
      detailVersion.current += 1;
      setDetailOpen(false);
      setDetail(undefined);
      setPage(undefined);
      setPending(true);
      setError("");
      try {
        const response = await services.query(input, signal, next);
        if (live() && request === version.current) {
          setPage(response);
          setCursor(next);
          setFilter(input);
        }
      } catch {
        if (live() && request === version.current) {
          setError(
            "Audit records unavailable. Check access or try the filters again."
          );
        }
      } finally {
        if (live() && request === version.current) {
          setPending(false);
        }
      }
    },
    [services, signal, live]
  );
  useEffect(() => {
    void load({});
  }, [load]);
  async function inspect(id: string) {
    detailVersion.current += 1;
    const request = detailVersion.current;
    setDetailOpen(true);
    setDetail(undefined);
    setDetailError("");
    setDetailPending(true);
    try {
      const event = await services.get(id, signal);
      if (live() && request === detailVersion.current) {
        setDetail(event ?? undefined);
        if (!event) {
          setDetailError("Record unavailable in the current authorized scope.");
        }
      }
    } catch {
      if (live() && request === detailVersion.current) {
        setDetailError("Record unavailable. Access may have changed.");
      }
    } finally {
      if (live() && request === detailVersion.current) {
        setDetailPending(false);
      }
    }
  }
  return (
    <main aria-label="Audit" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={activation.key}
        value={{ context: { kind: "object", label: "Audit" } }}
      />
      <p>
        Audit records in the selected host’s authorized scope. An audit outcome
        is historical evidence, not a submission receipt or proof of a business
        effect.
      </p>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const field = (key: string) => String(data.get(key) ?? "").trim();
          const type = field("targetType");
          const id = field("targetId");
          if (!!type !== !!id) {
            setError("Provide both target type and target ID.");
            return;
          }
          const parsed = auditFilter.safeParse({
            ...(field("action") ? { action: field("action") } : {}),
            ...(type ? { target: { type, id } } : {}),
            ...(field("correlationId")
              ? { correlationId: field("correlationId") }
              : {}),
            ...(result === "all" ? {} : { result }),
          });
          if (!parsed.success) {
            setError("Filter values must be at most 512 characters.");
            return;
          }
          void load(parsed.data);
        }}
        {...stylex.props(styles.filters)}
      >
        {[
          ["action", "Action"],
          ["targetType", "Target type"],
          ["targetId", "Target ID"],
          ["correlationId", "Correlation ID"],
        ].map(([name, label]) => (
          <TextField key={name} name={name}>
            <Label>{label}</Label>
            <Input maxLength={512} />
          </TextField>
        ))}
        <Select
          items={results}
          value={result}
          onValueChange={(value) => setResult(value ?? "all")}
        >
          <Select.Label>Result</Select.Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popover>
                <Select.List>
                  {results.map((item) => (
                    <Select.Item key={item.value} value={item.value}>
                      <Select.ItemText>{item.label}</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popover>
            </Select.Positioner>
          </Select.Portal>
        </Select>
        <Button type="submit" variant="primary" disabled={pending}>
          Apply filters
        </Button>
      </Form>
      {error && <p role="alert">{error}</p>}
      {pending && <output>Loading audit records…</output>}
      {page?.events.length === 0 && <p>No audit records match.</p>}
      {page?.events.map((event) => (
        <section key={event.id} {...stylex.props(styles.row)}>
          <h2>{event.action}</h2>
          <p>
            {event.target.type}: {event.target.id} · {event.result}
          </p>
          <p>
            Recorded: {new Date(event.recordedAt).toLocaleString()} ·{" "}
            {event.correlationId ?? "No correlation ID"}
          </p>
          <Button variant="secondary" onClick={() => void inspect(event.id)}>
            View audit record
          </Button>
        </section>
      ))}
      <Toolbar
        isAttached
        aria-label="Audit pagination"
        {...stylex.props(styles.actions)}
      >
        {cursor && (
          <Toolbar.Button disabled={pending} onClick={() => void load(filter)}>
            First page
          </Toolbar.Button>
        )}
        {page?.nextCursor && (
          <Toolbar.Button
            disabled={pending}
            onClick={() => void load(filter, page.nextCursor!)}
          >
            Next page
          </Toolbar.Button>
        )}
      </Toolbar>
      <Modal
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            detailVersion.current += 1;
          }
          setDetailOpen(open);
        }}
      >
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup {...stylex.props(styles.modal)}>
              <Modal.Header>
                <Modal.Title>Audit record</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <Modal.Description>
                  Historical metadata from the current scope
                </Modal.Description>
                {detailPending && <output>Loading record…</output>}
                {detailError && <p role="alert">{detailError}</p>}
                {detail && (
                  <div {...stylex.props(styles.row)}>
                    <p>{detail.id}</p>
                    <p>
                      {detail.action} · {detail.result}
                    </p>
                    <p>
                      {detail.target.type}: {detail.target.id}
                    </p>
                    <p>Reason: {detail.reasonCode}</p>
                    <p>
                      Occurred: {new Date(detail.occurredAt).toLocaleString()}
                    </p>
                    <p>
                      Recorded: {new Date(detail.recordedAt).toLocaleString()}
                    </p>
                    <p>Correlation: {detail.correlationId ?? "None"}</p>
                    {detail.relation && (
                      <>
                        <p>
                          {detail.relation.kind} of {detail.relation.eventId}
                        </p>
                        <Button
                          variant="secondary"
                          onClick={() => void inspect(detail.relation!.eventId)}
                        >
                          View related record
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Modal.Close render={<Button variant="secondary" />}>
                  Close
                </Modal.Close>
              </Modal.Footer>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal>
    </main>
  );
}
export function AuditPage(props: ConsoleLocalPageProps<AuditClient>) {
  const lifetime = useConsoleActivation(props.services, props.signal);
  return (
    <AuditContent
      key={lifetime.activation.key}
      {...props}
      activation={lifetime.activation}
      signal={lifetime.signal}
    />
  );
}
export function auditConsole(options: {
  id: string;
  route: string;
  client: AuditClient;
}): ConsoleBinding<AuditClient> {
  return {
    id: options.id,
    services: options.client,
    routes: { audit: options.route },
    definition: {
      id: "console-audit",
      pages: { audit: { title: "Audit", component: AuditPage } },
      navigation: [
        {
          id: "audit",
          page: "audit",
          label: "Audit",
          icon: <ScrollText size={20} aria-hidden="true" />,
        },
      ],
    },
  };
}
const styles = stylex.create({
  page: { padding: 24, paddingBottom: 120, maxWidth: 1100, margin: "auto" },
  filters: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" },
  row: { paddingBlock: 12, overflowWrap: "anywhere" },
  actions: { flexWrap: "wrap" },
  modal: { maxWidth: 540, width: "calc(100vw - 32px)" },
});
