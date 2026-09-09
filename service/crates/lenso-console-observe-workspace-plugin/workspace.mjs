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
              "button",
              { onClick: () => navigation.go([]), type: "button" },
              "All requests"
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
        ? h(TraceView, { h, logs, orderedSpans, trace })
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

const TraceView = ({ h, trace, logs, orderedSpans }) => {
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
          "div",
          { className: "observe-span", key: span.span_id },
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
