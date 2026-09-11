export const apiMajor = 1;

const service = "observe";

export const createWorkspace = ({ createElement: h, react, services }) => {
  const { useEffect, useMemo, useState } = react;

  const Page = ({ location, mount, navigation, signal }) => {
    const sourceId = mount.subject.kind === "app" ? mount.subject.appId : "";
    const selectedTrace =
      location.segments[0] === "traces" ? location.segments[1] : null;
    const [requests, setRequests] = useState([]);
    const [trace, setTrace] = useState(null);
    const [logs, setLogs] = useState([]);
    const [selectedSpanId, setSelectedSpanId] = useState(null);
    const [health, setHealth] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    useEffect(() => {
      let active = true;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const load = async () => {
        try {
          const [requestPage, ingestion] = await Promise.all([
            services.invoke(
              service,
              "list_requests",
              { limit: 50, source_id: sourceId },
              { signal: controller.signal }
            ),
            services.invoke(
              service,
              "read_ingestion_health",
              { source_id: sourceId },
              { signal: controller.signal }
            ),
          ]);
          if (active) {
            setRequests(requestPage.requests);
            setHealth(ingestion);
            setErrorMessage(null);
          }
        } catch (error) {
          if (active && !controller.signal.aborted) {
            setErrorMessage(
              error instanceof Error ? error.message : "Observe is unavailable"
            );
          }
        }
      };
      void load();
      const watch = async () => {
        try {
          for await (const item of services.subscribe(
            service,
            "watch_requests",
            { source_id: sourceId },
            { signal: controller.signal }
          )) {
            if (!active) {
              return;
            }
            if (item.kind === "request" && item.trace_id) {
              setRequests((current) =>
                [
                  item,
                  ...current.filter(
                    (entry) => entry.trace_id !== item.trace_id
                  ),
                ].slice(0, 50)
              );
            } else if (item.kind === "lag") {
              setErrorMessage(
                "Telemetry may be incomplete. Refreshing from storage is recommended."
              );
            }
          }
        } catch (error) {
          if (active && !controller.signal.aborted) {
            setErrorMessage(
              error instanceof Error ? error.message : "Live updates stopped"
            );
          }
        }
      };
      void watch();
      return () => {
        active = false;
        signal.removeEventListener("abort", abort);
        controller.abort();
      };
    }, [sourceId, signal]);

    useEffect(() => {
      if (!selectedTrace) {
        setTrace(null);
        setLogs([]);
        setSelectedSpanId(null);
        return;
      }
      let active = true;
      const controller = new AbortController();
      const loadTrace = async () => {
        try {
          const [nextTrace, nextLogs] = await Promise.all([
            services.invoke(
              service,
              "read_trace",
              { source_id: sourceId, trace_id: selectedTrace },
              { signal: controller.signal }
            ),
            services.invoke(
              service,
              "list_trace_logs",
              { limit: 200, source_id: sourceId, trace_id: selectedTrace },
              { signal: controller.signal }
            ),
          ]);
          if (active) {
            setTrace(nextTrace);
            setLogs(nextLogs.logs);
            setSelectedSpanId(nextTrace.spans[0]?.span_id ?? null);
            setErrorMessage(null);
          }
        } catch (error) {
          if (active && !controller.signal.aborted) {
            setErrorMessage(
              error instanceof Error ? error.message : "Trace is unavailable"
            );
          }
        }
      };
      void loadTrace();
      return () => {
        active = false;
        controller.abort();
      };
    }, [selectedTrace, sourceId]);

    const orderedSpans = useMemo(
      () =>
        trace
          ? [...trace.spans].toSorted((a, b) =>
              Number(
                BigInt(a.started_at_unix_nano) - BigInt(b.started_at_unix_nano)
              )
            )
          : [],
      [trace]
    );
    const selectedRequest = requests.find(
      (request) => request.trace_id === selectedTrace
    );
    const createIssue = () => {
      if (!(selectedTrace && navigation.openWorkspace)) {
        return;
      }
      const selectedSpan = orderedSpans.find(
        (span) => span.span_id === selectedSpanId
      );
      const payload = {
        kind: "lenso.observe.trace@1",
        source_id: sourceId,
        trace_id: selectedTrace,
        ...(selectedRequest
          ? {
              duration_nano: selectedRequest.duration_nano,
              method: selectedRequest.method,
              route: selectedRequest.route,
              status_code: selectedRequest.status_code,
            }
          : {}),
        ...(selectedSpan ? { selected_span: selectedSpan.name } : {}),
      };
      navigation.openWorkspace({
        handoff: { kind: payload.kind, payload },
        subject: { kind: "console" },
        workspaceId: "projects",
      });
    };

    return h(
      "section",
      { className: "observe-workspace" },
      h(
        "header",
        { className: "observe-header" },
        h(
          "div",
          null,
          h("p", { className: "observe-eyebrow" }, `OBSERVE · ${sourceId}`),
          h(
            "h1",
            null,
            selectedTrace
              ? `Trace ${selectedTrace.slice(0, 8)}`
              : "Recent requests"
          ),
          h(
            "p",
            { className: "observe-subtitle" },
            selectedTrace
              ? "Trace waterfall and correlated logs"
              : `Live HTTP server requests for ${sourceId}`
          )
        ),
        selectedTrace
          ? h(
              "div",
              { className: "observe-header-actions" },
              h(
                "button",
                { onClick: () => navigation.go([]), type: "button" },
                "All requests"
              ),
              navigation.openWorkspace
                ? h(
                    "button",
                    { onClick: createIssue, type: "button" },
                    "Create issue"
                  )
                : null
            )
          : null
      ),
      errorMessage
        ? h(
            "div",
            { className: "observe-banner", role: "status" },
            errorMessage
          )
        : null,
      h(
        "div",
        { className: "observe-health" },
        h("span", null, "Runtime state unavailable"),
        health
          ? h(
              "span",
              null,
              `${health.accepted_spans} spans · ${
                health.accepted_logs
              } logs · ${health.rejected_records} rejected`
            )
          : h("span", null, "Loading receiver health…")
      ),
      selectedTrace
        ? h(TraceView, {
            h,
            logs,
            orderedSpans,
            selectSpan: setSelectedSpanId,
            selectedSpanId,
            trace,
          })
        : h(RequestList, {
            h,
            open: (traceId) => navigation.go(["traces", traceId]),
            requests,
          })
    );
  };
  return { Page };
};

const RequestList = ({ h, requests, open }) => {
  if (!requests.length) {
    return h(
      "div",
      { className: "observe-empty" },
      h("strong", null, "No requests yet"),
      h(
        "p",
        null,
        "Send OTLP/HTTP traces to this Observe receiver. Application requests are never blocked by this view."
      )
    );
  }
  return h(
    "div",
    { className: "observe-table" },
    h(
      "div",
      { className: "observe-row observe-table-head" },
      h("span", null, "Request"),
      h("span", null, "Status"),
      h("span", null, "Duration"),
      h("span", null, "Telemetry")
    ),
    ...requests.map((request) =>
      h(
        "button",
        {
          className: "observe-row observe-request",
          key: request.trace_id,
          onClick: () => open(request.trace_id),
          type: "button",
        },
        h("span", null, h("b", null, request.method), " ", request.route),
        h(
          "span",
          { className: request.has_error ? "observe-bad" : "observe-good" },
          String(request.status_code || "—")
        ),
        h("span", null, formatDuration(request.duration_nano)),
        h("span", null, request.completeness)
      )
    )
  );
};

const TraceView = ({
  h,
  trace,
  logs,
  orderedSpans,
  selectedSpanId,
  selectSpan,
}) => {
  if (!trace) {
    return h("div", { className: "observe-empty" }, "Loading trace…");
  }
  const [first] = orderedSpans;
  let lastEnd = first ? BigInt(first.ended_at_unix_nano) : 0n;
  for (const span of orderedSpans) {
    const endedAt = BigInt(span.ended_at_unix_nano);
    if (endedAt > lastEnd) {
      lastEnd = endedAt;
    }
  }
  const start = first ? BigInt(first.started_at_unix_nano) : 0n;
  const total = lastEnd > start ? lastEnd - start : 1n;
  const selectedSpan =
    orderedSpans.find((span) => span.span_id === selectedSpanId) ?? first;
  return h(
    "div",
    { className: "observe-trace-layout" },
    h(
      "div",
      { className: "observe-panel" },
      h("h2", null, "Waterfall"),
      ...orderedSpans.map((span) => {
        const offset =
          Number(
            ((BigInt(span.started_at_unix_nano) - start) * 1000n) / total
          ) / 10;
        const width = Math.max(
          1.5,
          Number(
            ((BigInt(span.ended_at_unix_nano) -
              BigInt(span.started_at_unix_nano)) *
              1000n) /
              total
          ) / 10
        );
        return h(
          "button",
          {
            "aria-pressed": span.span_id === selectedSpan?.span_id,
            className: `observe-span${
              span.span_id === selectedSpan?.span_id
                ? " observe-span-selected"
                : ""
            }`,
            key: span.span_id,
            onClick: () => selectSpan(span.span_id),
            type: "button",
          },
          h(
            "div",
            { className: "observe-span-label" },
            h("strong", null, span.name),
            h(
              "small",
              null,
              `${span.kind} · ${formatDuration(
                (
                  BigInt(span.ended_at_unix_nano) -
                  BigInt(span.started_at_unix_nano)
                ).toString()
              )}`
            )
          ),
          h(
            "div",
            { className: "observe-track" },
            h("i", {
              className:
                span.status === "error"
                  ? "observe-bar observe-bar-error"
                  : "observe-bar",
              style: { left: `${offset}%`, width: `${width}%` },
            })
          )
        );
      })
    ),
    h(
      "aside",
      { className: "observe-panel" },
      h("h2", null, "Selected span"),
      selectedSpan
        ? h(
            "div",
            { className: "observe-inspector" },
            h("strong", null, selectedSpan.name),
            h(
              "p",
              { className: "observe-muted" },
              `${selectedSpan.kind} · ${selectedSpan.status} · ${selectedSpan.span_id}`
            ),
            h(AttributeList, {
              attributes: selectedSpan.attributes,
              empty: "No safe attributes retained.",
              h,
            }),
            h("h3", null, `Events · ${selectedSpan.events?.length ?? 0}`),
            ...(selectedSpan.events?.length
              ? selectedSpan.events.map((event, index) =>
                  h(
                    "article",
                    {
                      className: "observe-detail",
                      key: `${event.timestamp_unix_nano}-${index}`,
                    },
                    h("strong", null, event.name),
                    h(AttributeList, { attributes: event.attributes, h })
                  )
                )
              : [h("p", { className: "observe-muted" }, "No span events.")]),
            h("h3", null, `Links · ${selectedSpan.links?.length ?? 0}`),
            ...(selectedSpan.links?.length
              ? selectedSpan.links.map((link, index) =>
                  h(
                    "article",
                    {
                      className: "observe-detail",
                      key: `${link.trace_id}-${link.span_id}-${index}`,
                    },
                    h(
                      "strong",
                      null,
                      `${link.trace_id.slice(0, 8)} · ${link.span_id}`
                    ),
                    h(AttributeList, { attributes: link.attributes, h })
                  )
                )
              : [h("p", { className: "observe-muted" }, "No span links.")])
          )
        : h("p", { className: "observe-muted" }, "No span selected."),
      h("h2", null, "Correlated logs"),
      ...(logs.length
        ? logs.map((log, index) =>
            h(
              "article",
              {
                className: "observe-log",
                key: log.timestamp_unix_nano + index,
              },
              h("small", null, log.severity || "LOG"),
              h("p", null, log.body)
            )
          )
        : [
            h(
              "p",
              { className: "observe-muted" },
              "No correlated logs for this trace."
            ),
          ]),
      h("h2", null, "Runtime"),
      h(
        "p",
        { className: "observe-muted" },
        "Runtime state unavailable. Telemetry hints are not authoritative runtime state."
      )
    )
  );
};

const AttributeList = ({ h, attributes, empty = null }) => {
  const items = attributes ?? [];
  if (items.length) {
    return h(
      "dl",
      { className: "observe-attributes" },
      ...items.flatMap((attribute) => [
        h("dt", { key: `${attribute.key}-key` }, attribute.key),
        h("dd", { key: `${attribute.key}-value` }, attribute.value),
      ])
    );
  }
  if (empty) {
    return h("p", { className: "observe-muted" }, empty);
  }
  return null;
};

const formatDuration = (nanoseconds) => {
  const value = Number(BigInt(nanoseconds));
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)} s`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} ms`;
  }
  return `${Math.round(value / 1_000)} µs`;
};
