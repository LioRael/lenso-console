import { bootstrapTelemetry } from "@lenso/otel/bun";

type Options = NonNullable<Parameters<typeof bootstrapTelemetry>[0]>;

/** Real host-owned SDK telemetry, with no remote exporter or business attributes. */
export async function executionTelemetry() {
  const spans: {
    traceId: string;
    spanId: string;
    instanceId: unknown;
    pluginId: unknown;
    method: unknown;
  }[] = [];
  const traceExporter: NonNullable<Options["traceExporter"]> = {
    export(batch, complete) {
      for (const span of batch) {
        if (span.name === "lenso.operation") {
          spans.push({
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
            instanceId: span.attributes["lenso.instance.id"],
            pluginId: span.attributes["lenso.plugin.id"],
            method: span.attributes["lenso.operation"],
          });
        }
      }
      complete({ code: 0 });
    },
    async shutdown() {
      /* No external resources are owned. */
    },
    async forceFlush() {
      /* Exports are collected synchronously. */
    },
  };
  const metricExporter: NonNullable<Options["metricExporter"]> = {
    export(_metrics, complete) {
      complete({ code: 0 });
    },
    async shutdown() {
      /* No external resources are owned. */
    },
    async forceFlush() {
      /* Metrics are intentionally discarded. */
    },
  };
  return {
    ...(await bootstrapTelemetry({ traceExporter, metricExporter })),
    spans,
  };
}
