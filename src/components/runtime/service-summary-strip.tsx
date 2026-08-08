import { useGSAP } from "@gsap/react";
import * as stylex from "@stylexjs/stylex";
import gsap from "gsap";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import type { RuntimeStory } from "../../data/mock-runtime";
import { formatRuntimeDuration, serviceColor } from "../../lib/runtime-style";
import { getServiceSummaryPanelLayout } from "./service-summary-strip-layout";

const localStyles = stylex.create({
  utilityFlex: {
    display: "flex",
  },
  utilityH30px: {
    height: "30px",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap7px: {
    gap: "7px",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityTransition: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityHoverTextForeground: {
    ":hover": {
      color: "var(--foreground)",
    },
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityTextMuted: {
    color: "var(--muted)",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityText95px: {
    fontSize: "9.5px",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityH4: {
    height: "calc(0.25rem * 4)",
  },
  utilityMinW45: {
    minWidth: "calc(0.25rem * 4.5)",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgSurfaceRaised: {
    backgroundColor: "var(--bg-surface-raised)",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText8px: {
    fontSize: "8px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityText85px: {
    fontSize: "8.5px",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityH10: {
    height: "calc(0.25rem * 10)",
  },
  utilityMinW600px: {
    minWidth: "600px",
  },
  utilityGridCols8px94px46px56px56px56px38pxMinmax96px1fr: {
    gridTemplateColumns: "8px 94px 46px 56px 56px 56px 38px minmax(96px,1fr)",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderBgCanvas: {
    borderColor: "var(--bg-canvas)",
  },
  utilityLastBorderB0: {
    ":last-child": {
      borderBottomWidth: "0px",
    },
  },
  utilityH15: {
    height: "calc(0.25rem * 1.5)",
  },
  utilityRounded1px: {
    borderRadius: "1px",
  },
  utilityBgBgSurfaceMuted: {
    backgroundColor: "var(--bg-surface-muted)",
  },
});

const styles = stylex.create({
  container: (height: number) => ({
    backgroundColor: "var(--surface)",
    borderBlockStartColor: "var(--line-subtle)",
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    height,
    minWidth: 0,
    overflow: "hidden",
  }),
  content: (height: number, opacity: number) => ({
    height,
    minHeight: 0,
    opacity,
    overflow: "hidden",
  }),
  errorCount: (hasErrors: boolean) => ({
    color: hasErrors ? "var(--tone-error-fg)" : "var(--fg-tertiary)",
  }),
  serviceBar: (color: string, width: string) => ({
    backgroundColor: color,
    borderRadius: "1px",
    height: "100%",
    width,
  }),
  serviceDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "1px",
    height: 8,
    width: 8,
  }),
  serviceName: (color: string) => ({
    color,
    fontFamily: "var(--font-ui)",
    fontSize: 10,
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
});

gsap.registerPlugin(useGSAP);

type ServiceSummary = {
  duration: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  service: string;
  nodes: number;
};

export function ServiceSummaryStrip({
  expanded,
  height,
  onExpandedChange,
  story,
}: {
  expanded: boolean;
  height?: number;
  onExpandedChange: (expanded: boolean) => void;
  story: RuntimeStory;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const hasMountedRef = useRef(false);
  const iconRef = useRef<SVGSVGElement | null>(null);
  const previousExpandedRef = useRef(expanded);
  const panelLayout = getServiceSummaryPanelLayout({ expanded, height });
  const initialPanelLayoutRef = useRef(panelLayout);
  const serviceSummary = summarizeServices(story);
  const { services } = serviceSummary;

  useGSAP(
    () => {
      const container = containerRef.current;
      const content = contentRef.current;
      const icon = iconRef.current;

      if (!container || !content || !icon) {
        return;
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const didExpandedChange = previousExpandedRef.current !== expanded;
      const shouldAnimate = hasMountedRef.current && didExpandedChange;
      previousExpandedRef.current = expanded;
      hasMountedRef.current = true;

      gsap.killTweensOf([container, content, icon]);

      if (reduceMotion || !shouldAnimate) {
        gsap.set(container, {
          height: panelLayout.panelHeight,
        });
        gsap.set(content, {
          height: panelLayout.contentHeight,
          opacity: expanded ? 1 : 0,
        });
        gsap.set(icon, {
          rotate: expanded ? 0 : -90,
        });
        return;
      }

      gsap.to(icon, {
        duration: 0.22,
        ease: "power2.out",
        rotate: expanded ? 0 : -90,
      });

      gsap.to(container, {
        duration: expanded ? 0.32 : 0.24,
        ease: expanded ? "power3.out" : "power2.inOut",
        height: panelLayout.panelHeight,
      });

      gsap.to(content, {
        duration: expanded ? 0.32 : 0.2,
        ease: expanded ? "power3.out" : "power2.inOut",
        height: panelLayout.contentHeight,
        opacity: expanded ? 1 : 0,
      });
    },
    {
      dependencies: [
        expanded,
        height ?? null,
        panelLayout.contentHeight,
        panelLayout.panelHeight,
        services.length,
      ],
      scope: containerRef,
    }
  );

  return (
    <div
      ref={containerRef}
      {...stylex.props(
        styles.container(initialPanelLayoutRef.current.panelHeight)
      )}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH30px,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap7px,
          localStyles.utilityPx3,
        ])}
      >
        <button
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse services" : "Expand services"}
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap15,
            localStyles.utilityTextLeft,
            localStyles.utilityTransition,
            localStyles.utilityHoverTextForeground,
          ])}
          onClick={() => onExpandedChange(!expanded)}
          type="button"
        >
          <ChevronDown
            ref={iconRef}
            {...stylex.props([
              localStyles.utilityShrink0,
              localStyles.utilityTextMuted,
            ])}
            size={12}
          />
          <span
            {...stylex.props([
              localStyles.utilityFontSans,
              localStyles.utilityText95px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            Services
          </span>
          <span
            {...stylex.props([
              localStyles.utilityGrid,
              localStyles.utilityH4,
              localStyles.utilityMinW45,
              localStyles.utilityPlaceItemsCenter,
              localStyles.utilityBorder,
              localStyles.utilityBorderLine,
              localStyles.utilityBgBgSurfaceRaised,
              localStyles.utilityPx1,
              localStyles.utilityFontMono,
              localStyles.utilityText8px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {services.length}
          </span>
        </button>
        <div
          {...stylex.props([
            localStyles.utilityMlAuto,
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap7px,
            localStyles.utilityOverflowHidden,
            localStyles.utilityFontMono,
            localStyles.utilityText85px,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          <span>p50 {formatRuntimeDuration(serviceSummary.p50)}</span>
          <span>p95 {formatRuntimeDuration(serviceSummary.p95)}</span>
          <span>max {formatRuntimeDuration(serviceSummary.max)}</span>
        </div>
      </div>
      <div
        ref={contentRef}
        {...stylex.props(
          styles.content(
            initialPanelLayoutRef.current.contentHeight,
            initialPanelLayoutRef.current.contentHeight > 0 ? 1 : 0
          )
        )}
      >
        <div
          {...stylex.props([
            localStyles.utilityHFull,
            localStyles.utilityMinH0,
            localStyles.utilityOverflowAuto,
          ])}
        >
          {services.map((item) => (
            <div
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityH10,
                localStyles.utilityMinW600px,
                localStyles.utilityGridCols8px94px46px56px56px56px38pxMinmax96px1fr,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap2,
                localStyles.utilityBorderB,
                localStyles.utilityBorderBgCanvas,
                localStyles.utilityPx3,
                localStyles.utilityFontMono,
                localStyles.utilityText85px,
                localStyles.utilityLastBorderB0,
              ])}
              key={item.service}
            >
              <div
                {...stylex.props(styles.serviceDot(serviceColor(item.service)))}
              />
              <span
                {...stylex.props(
                  styles.serviceName(serviceColor(item.service))
                )}
              >
                {item.service}
              </span>
              <span {...stylex.props([localStyles.utilityTextMuted])}>
                {item.nodes} nodes
              </span>
              <span {...stylex.props([localStyles.utilityTextMuted])}>
                p50 {formatRuntimeDuration(item.p50)}
              </span>
              <span {...stylex.props([localStyles.utilityTextMuted])}>
                p95 {formatRuntimeDuration(item.p95)}
              </span>
              <span {...stylex.props([localStyles.utilityTextMuted])}>
                p99 {formatRuntimeDuration(item.p99)}
              </span>
              <span {...stylex.props(styles.errorCount(item.errors > 0))}>
                {item.errors} err
              </span>
              <div
                {...stylex.props([
                  localStyles.utilityH15,
                  localStyles.utilityMinW0,
                  localStyles.utilityOverflowHidden,
                  localStyles.utilityRounded1px,
                  localStyles.utilityBgBgSurfaceMuted,
                ])}
              >
                <div
                  {...stylex.props(
                    styles.serviceBar(
                      serviceColor(item.service),
                      `${Math.max(2, (item.duration / story.durationMs) * 100)}%`
                    )
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function summarizeServices(story: RuntimeStory) {
  const servicesByName = new Map<
    string,
    Omit<ServiceSummary, "p50" | "p95" | "p99"> & { durations: number[] }
  >();
  const allDurations: number[] = [];
  let max = 0;

  for (const node of story.nodes) {
    let service = servicesByName.get(node.service);
    if (!service) {
      service = {
        duration: 0,
        durations: [],
        errors: 0,
        service: node.service,
        nodes: 0,
      };
      servicesByName.set(node.service, service);
    }

    service.duration += node.durationMs;
    service.durations.push(node.durationMs);
    service.errors +=
      node.status === "failed" || node.status === "dead" ? 1 : 0;
    service.nodes += 1;
    allDurations.push(node.durationMs);
    max = Math.max(max, node.durationMs);
  }

  allDurations.sort(compareNumbers);
  return {
    max,
    p50: percentileSorted(allDurations, 50),
    p95: percentileSorted(allDurations, 95),
    services: [...servicesByName.values()].map(({ durations, ...service }) => {
      durations.sort(compareNumbers);
      return {
        ...service,
        p50: percentileSorted(durations, 50),
        p95: percentileSorted(durations, 95),
        p99: percentileSorted(durations, 99),
      };
    }),
  };
}

function percentileSorted(values: number[], pct: number) {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.ceil((pct / 100) * values.length) - 1;
  return values[Math.max(0, index)] ?? 0;
}

function compareNumbers(left: number, right: number) {
  return left - right;
}
