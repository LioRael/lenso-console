export const apiMajor = 1;

const service = "observe";
const requestLimit = 50;

// Console's admitted service errors carry status/code; domain errors carry the
// public query enum in payload. Never render arbitrary transport error bodies.
const queryFailure = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    return {
      kind: "denied",
      message:
        "Access to this Observe source is unavailable. Sign in with an authorized account, then retry.",
    };
  }
  if (error?.payload === "expired_cursor") {
    return {
      kind: "expired",
      message:
        "This request position has expired. Return to the latest requests.",
    };
  }
  if (error?.payload === "not_found") {
    return {
      kind: "missing",
      message:
        "This trace is no longer available. It may have been removed by retention.",
    };
  }
  return {
    kind: "unavailable",
    message:
      "Observe could not load this data. Retry when the receiver is available.",
  };
};

export const createWorkspace = ({ createElement: h, react, services }) => {
  const { useCallback, useEffect, useMemo, useRef, useState } = react;

  const useRead = ({
    operation,
    request,
    enabled,
    attempt,
    signal,
    access,
    deny,
  }) => {
    const key = `${operation}:${JSON.stringify(request)}`;
    const [state, setState] = useState({
      data: null,
      error: null,
      key: null,
      pending: false,
    });
    useEffect(() => {
      if (!access.current) {
        setState({ data: null, error: null, key, pending: false });
      }
      if (!enabled || signal.aborted) {
        return;
      }
      let active = true;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      setState((current) => ({
        data: current.key === key ? current.data : null,
        error: null,
        key,
        pending: true,
      }));
      const read = async () => {
        try {
          const data = await services.invoke(
            service,
            operation,
            JSON.parse(key.slice(operation.length + 1)),
            { signal: controller.signal }
          );
          if (active && !controller.signal.aborted && access.current) {
            setState({ data, error: null, key, pending: false });
          }
        } catch (error) {
          if (active && !controller.signal.aborted && access.current) {
            const failure = queryFailure(error);
            if (failure.kind === "denied") {
              deny();
            } else {
              setState((current) => ({
                ...current,
                error: failure,
                key,
                pending: false,
              }));
            }
          }
        }
      };
      void read();
      return () => {
        active = false;
        signal.removeEventListener("abort", abort);
        controller.abort();
      };
    }, [key, operation, enabled, attempt, signal, access, deny]);
    return state.key === key
      ? state
      : { data: null, error: null, key, pending: enabled };
  };

  const Page = ({ location, mount, navigation, signal }) => {
    const sourceId = mount.subject.kind === "app" ? mount.subject.appId : "";
    const { selectedTrace, cursor } = requestPosition(location.segments);
    const [attempt, setAttempt] = useState(0);
    const [denied, setDenied] = useState(false);
    const [feed, setFeed] = useState({ kind: "connecting", sourceId });
    const [selectedSpanId, setSelectedSpanId] = useState(null);
    const access = useRef(true);
    const [positions, setPositions] = useState({ cursors: [null], sourceId });
    const previousCursors =
      positions.sourceId === sourceId ? positions.cursors.slice(0, -1) : [];
    const returnTrace = useRef(null);
    const listElement = useRef(null);
    const deny = useCallback(() => {
      access.current = false;
      setDenied(true);
    }, []);
    const enabled = !denied;
    const common = { access, attempt, deny, signal };
    const requestPage = useRead({
      ...common,
      enabled: enabled && !selectedTrace,
      operation: "list_requests",
      request: {
        limit: requestLimit,
        source_id: sourceId,
        ...(cursor ? { cursor } : {}),
      },
    });
    const ingestion = useRead({
      ...common,
      enabled,
      operation: "read_ingestion_health",
      request: { source_id: sourceId },
    });
    const traceRead = useRead({
      ...common,
      enabled: enabled && Boolean(selectedTrace),
      operation: "read_trace",
      request: { source_id: sourceId, trace_id: selectedTrace },
    });
    const logsRead = useRead({
      ...common,
      enabled: enabled && Boolean(selectedTrace),
      operation: "list_trace_logs",
      request: { limit: 200, source_id: sourceId, trace_id: selectedTrace },
    });
    const requests = denied ? [] : (requestPage.data?.requests ?? []);
    const trace = denied ? null : traceRead.data;
    const logs = denied ? [] : (logsRead.data?.logs ?? []);
    const health = denied ? null : ingestion.data;

    useEffect(() => {
      access.current = true;
      setDenied(false);
      setPositions({ cursors: [null], sourceId });
      returnTrace.current = null;
    }, [sourceId]);

    useEffect(() => {
      if (selectedTrace) {
        return;
      }
      setPositions((current) => {
        const cursors =
          current.sourceId === sourceId ? current.cursors : [null];
        const index = cursors.indexOf(cursor);
        return {
          cursors:
            index === -1
              ? [...cursors, cursor].slice(-64)
              : cursors.slice(0, index + 1),
          sourceId,
        };
      });
    }, [sourceId, cursor, selectedTrace]);

    useEffect(() => {
      if (!enabled || selectedTrace || signal.aborted) {
        return;
      }
      let active = true;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      setFeed({ kind: "connecting", sourceId });
      const watch = async () => {
        try {
          for await (const item of services.subscribe(
            service,
            "watch_requests",
            { source_id: sourceId },
            { signal: controller.signal }
          )) {
            if (!active || controller.signal.aborted || !access.current) {
              return;
            }
            // Keep the server cursor's snapshot stable: inserting then trimming
            // live rows would skip the displaced rows on the next page.
            setFeed((current) => ({
              kind:
                item.kind === "lag" || current.kind === "lag"
                  ? "lag"
                  : "changed",
              sourceId,
            }));
          }
          if (active && !controller.signal.aborted && access.current) {
            setFeed({ kind: "stopped", sourceId });
          }
        } catch (error) {
          if (active && !controller.signal.aborted && access.current) {
            if (queryFailure(error).kind === "denied") {
              deny();
            } else {
              setFeed({ kind: "stopped", sourceId });
            }
          }
        }
      };
      void watch();
      return () => {
        active = false;
        signal.removeEventListener("abort", abort);
        controller.abort();
      };
    }, [sourceId, selectedTrace, enabled, attempt, signal, access, deny]);

    useEffect(() => {
      if (selectedTrace || requestPage.pending || !returnTrace.current) {
        return;
      }
      const row = listElement.current?.querySelector(
        `[data-trace-id="${returnTrace.current}"]`
      );
      if (row) {
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: "nearest" });
        returnTrace.current = null;
      }
    }, [selectedTrace, requestPage.pending, requestPage.data]);

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
    const retry = () => {
      access.current = true;
      setDenied(false);
      setAttempt((current) => current + 1);
    };
    const listSegments = cursor ? ["requests", cursor] : [];
    const openTrace = (traceId) => {
      returnTrace.current = traceId;
      setSelectedSpanId(null);
      navigation.go(["traces", traceId, ...listSegments]);
    };
    const older = () => {
      navigation.go(["requests", requestPage.data.next_cursor]);
    };
    const newer = () => {
      const previous = previousCursors.at(-1) ?? null;
      navigation.go(previous ? ["requests", previous] : []);
    };
    const createIssue = () => {
      if (!(trace && navigation.openWorkspace)) {
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
    const error = selectedTrace ? traceRead.error : requestPage.error;
    const pending = selectedTrace ? traceRead.pending : requestPage.pending;

    return h(ObservePage, {
      createIssue,
      cursor,
      denied,
      error,
      feed,
      h,
      health,
      ingestion,
      listElement,
      listSegments,
      logs,
      logsRead,
      navigation,
      newer,
      older,
      openTrace,
      orderedSpans,
      pending,
      previousCursors,
      requestPage,
      requests,
      retry,
      selectSpan: setSelectedSpanId,
      selectedSpanId,
      selectedTrace,
      sourceId,
      trace,
    });
  };
  return { Page };
};

const requestPosition = (segments) => {
  if (segments[0] === "traces") {
    return {
      cursor: segments[2] === "requests" ? (segments[3] ?? null) : null,
      selectedTrace: segments[1],
    };
  }
  return {
    cursor: segments[0] === "requests" ? (segments[1] ?? null) : null,
    selectedTrace: null,
  };
};

const ObservePage = (props) => {
  const {
    h,
    denied,
    sourceId,
    selectedTrace,
    listSegments,
    navigation,
    retry,
    pending,
    createIssue,
    trace,
  } = props;
  let refreshLabel = "Refresh";
  if (pending) {
    refreshLabel = "Refreshing…";
  }
  if (denied) {
    refreshLabel = "Retry access";
  }
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
            : `HTTP server requests for ${sourceId}`
        )
      ),
      h(
        "div",
        { className: "observe-header-actions" },
        selectedTrace
          ? h(
              "button",
              { onClick: () => navigation.go(listSegments), type: "button" },
              "All requests"
            )
          : null,
        h(
          "button",
          { disabled: pending && !denied, onClick: retry, type: "button" },
          refreshLabel
        ),
        trace && navigation.openWorkspace
          ? h(
              "button",
              { onClick: createIssue, type: "button" },
              "Create issue"
            )
          : null
      )
    ),
    denied
      ? h(
          "div",
          { className: "observe-banner", role: "alert" },
          queryFailure({ status: 403 }).message
        )
      : h(ObserveContent, props)
  );
};

const ObserveContent = (props) => {
  const {
    h,
    error,
    health,
    ingestion,
    selectedTrace,
    trace,
    logs,
    logsRead,
    orderedSpans,
    selectSpan,
    selectedSpanId,
    navigation,
  } = props;
  let healthLabel = "Loading receiver health…";
  if (ingestion.error) {
    healthLabel = "Receiver health unavailable";
  }
  if (health) {
    healthLabel = `${health.accepted_spans} spans · ${health.accepted_logs} logs · ${health.rejected_records} rejected`;
  }
  let content = h(RequestPage, props);
  if (selectedTrace) {
    content = null;
    if (trace || !error) {
      content = h(TraceView, {
        h,
        logs,
        logsError: logsRead.error,
        logsPending: logsRead.pending,
        logsTruncated: Boolean(logsRead.data?.next_cursor),
        orderedSpans,
        selectSpan,
        selectedSpanId,
        trace,
      });
    }
  }
  return h(
    "div",
    null,
    error
      ? h(
          "div",
          { className: "observe-banner", role: "alert" },
          error.message,
          error.kind === "expired"
            ? h(
                "button",
                { onClick: () => navigation.go([]), type: "button" },
                "Show latest requests"
              )
            : null
        )
      : null,
    h(
      "div",
      { className: "observe-health" },
      h("span", null, "Runtime state unavailable"),
      h("span", null, healthLabel)
    ),
    content
  );
};

const feedMessage = (kind) => {
  if (kind === "lag") {
    return "Telemetry may be incomplete. Refresh to read retained requests.";
  }
  if (kind === "changed") {
    return "New telemetry is available. Refresh to update this request page.";
  }
  return "Live updates stopped. Refresh to reconnect; retained requests are still available.";
};

const RequestPage = ({
  h,
  cursor,
  feed,
  sourceId,
  listElement,
  requestPage,
  openTrace,
  requests,
  previousCursors,
  newer,
  older,
}) => {
  let content = null;
  if (requestPage.pending && !requestPage.data) {
    content = h(
      "p",
      { className: "observe-empty", role: "status" },
      "Loading requests…"
    );
  } else if (!requestPage.error || requestPage.data) {
    content = h(RequestList, { h, open: openTrace, requests });
  }
  return h(
    "div",
    null,
    feed.sourceId === sourceId && feed.kind !== "connecting"
      ? h(
          "div",
          { className: "observe-feed", role: "status" },
          feedMessage(feed.kind)
        )
      : null,
    h("div", { "aria-busy": requestPage.pending, ref: listElement }, content),
    h(
      "nav",
      { "aria-label": "Request pagination", className: "observe-pagination" },
      h("span", null, `${requests.length} requests on this page`),
      h(
        "div",
        { className: "observe-header-actions" },
        h(
          "button",
          {
            disabled: !cursor || requestPage.pending,
            onClick: newer,
            type: "button",
          },
          previousCursors.length ? "Newer requests" : "Latest requests"
        ),
        h(
          "button",
          {
            disabled:
              !requestPage.data?.next_cursor ||
              requestPage.pending ||
              Boolean(requestPage.error),
            onClick: older,
            type: "button",
          },
          "Older requests"
        )
      )
    )
  );
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
          "data-trace-id": request.trace_id,
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
  logsError,
  logsPending,
  logsTruncated,
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
      h(CorrelatedLogs, { h, logs, logsError, logsPending, logsTruncated }),
      h("h2", null, "Runtime"),
      h(
        "p",
        { className: "observe-muted" },
        "Runtime state unavailable. Telemetry hints are not authoritative runtime state."
      )
    )
  );
};

const CorrelatedLogs = ({ h, logs, logsError, logsPending, logsTruncated }) => {
  let emptyLabel = "No correlated logs for this trace.";
  if (logsPending) {
    emptyLabel = "Loading correlated logs…";
  } else if (logsError) {
    emptyLabel = "Log completeness is unknown.";
  }
  return h(
    "section",
    null,
    h("h2", null, "Correlated logs"),
    logsError
      ? h(
          "p",
          { className: "observe-muted", role: "status" },
          "Correlated logs are unavailable. Refresh to retry."
        )
      : null,
    logsTruncated
      ? h(
          "p",
          { className: "observe-muted" },
          "Showing the first 200 retained logs."
        )
      : null,
    ...(logs.length
      ? logs.map((log, index) =>
          h(
            "article",
            { className: "observe-log", key: log.timestamp_unix_nano + index },
            h("small", null, log.severity || "LOG"),
            h("p", null, log.body)
          )
        )
      : [h("p", { className: "observe-muted" }, emptyLabel)])
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
