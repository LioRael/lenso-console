import * as stylex from "@stylexjs/stylex";

import { edgeStyles } from "./console-layout.styles";

export interface TopEdgeOptions {
  enabled: boolean;
  height: number;
  maxBlur: number;
  maskOpacity: number;
  reducedTransparency: boolean;
}

export const TOP_EDGE_DEFAULTS: Readonly<TopEdgeOptions> = Object.freeze({
  enabled: true,
  height: 96,
  maxBlur: 8,
  maskOpacity: 0.32,
  reducedTransparency: false,
});

export const TOP_EDGE_LIMITS = Object.freeze({
  height: Object.freeze({ min: 0, max: 240 }),
  maxBlur: Object.freeze({ min: 0, max: 16 }),
  maskOpacity: Object.freeze({ min: 0, max: 0.8 }),
});

function finiteRange(
  value: number | undefined,
  fallback: number,
  limits: { min: number; max: number }
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(limits.max, Math.max(limits.min, value))
    : fallback;
}

export function normalizeTopEdgeOptions(
  options: Partial<TopEdgeOptions> = {}
): TopEdgeOptions {
  return {
    enabled:
      typeof options.enabled === "boolean"
        ? options.enabled
        : TOP_EDGE_DEFAULTS.enabled,
    height: finiteRange(
      options.height,
      TOP_EDGE_DEFAULTS.height,
      TOP_EDGE_LIMITS.height
    ),
    maxBlur: finiteRange(
      options.maxBlur,
      TOP_EDGE_DEFAULTS.maxBlur,
      TOP_EDGE_LIMITS.maxBlur
    ),
    maskOpacity: finiteRange(
      options.maskOpacity,
      TOP_EDGE_DEFAULTS.maskOpacity,
      TOP_EDGE_LIMITS.maskOpacity
    ),
    reducedTransparency:
      typeof options.reducedTransparency === "boolean"
        ? options.reducedTransparency
        : TOP_EDGE_DEFAULTS.reducedTransparency,
  };
}

export function ConsoleTopEdge({
  options,
}: {
  options?: Partial<TopEdgeOptions>;
}) {
  const edge = normalizeTopEdgeOptions(options);
  if (!edge.enabled) {
    return null;
  }

  const root = stylex.props(
    edgeStyles.root,
    edgeStyles.parameters(edge.height, edge.maskOpacity)
  );
  const strong = stylex.props(
    edgeStyles.layer,
    !edge.reducedTransparency && edgeStyles.supportedBlur,
    edgeStyles.strong(edge.maxBlur)
  );
  const soft = stylex.props(
    edgeStyles.layer,
    !edge.reducedTransparency && edgeStyles.supportedBlur,
    edgeStyles.soft(edge.maxBlur * 0.5)
  );
  return (
    <div
      {...root}
      className={`console-top-edge ${root.className}`}
      aria-hidden="true"
      data-reduced-transparency={edge.reducedTransparency ? "true" : undefined}
    >
      {/* Two masked radii approximate progressive blur; the radius is constant within each layer. */}
      <div
        {...strong}
        className={`console-top-edge-strong ${strong.className}`}
      />
      <div {...soft} className={`console-top-edge-soft ${soft.className}`} />
    </div>
  );
}
