import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import type { RuntimeStory } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import { formatRuntimeDuration, serviceColor } from "../../lib/runtime-style";
import { getServiceSummaryPanelLayout } from "./service-summary-strip-layout";

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
      className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-t border-(--border-subtle) bg-(--surface)"
      style={{ height: initialPanelLayoutRef.current.panelHeight }}
    >
      <div
        className={cn(
          "flex h-7 min-w-0 items-center gap-2 px-3",
          expanded && "border-b border-(--border-subtle)"
        )}
      >
        <button
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse services" : "Expand services"}
          className="flex min-w-0 items-center gap-1.5 text-left transition hover:text-(--foreground)"
          onClick={() => onExpandedChange(!expanded)}
          type="button"
        >
          <ChevronDown
            ref={iconRef}
            className="shrink-0 text-(--muted)"
            size={13}
          />
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-(--secondary)">
            Services
          </span>
          <span className="rounded-[2px] border border-(--border-subtle) bg-(--elevated) px-1 font-mono text-[10px] text-(--muted)">
            {services.length}
          </span>
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-3 overflow-hidden font-mono text-[11px] text-(--muted)">
          <span>p50 {formatRuntimeDuration(serviceSummary.p50)}</span>
          <span>p95 {formatRuntimeDuration(serviceSummary.p95)}</span>
          <span>max {formatRuntimeDuration(serviceSummary.max)}</span>
        </div>
      </div>
      <div
        ref={contentRef}
        className="min-h-0 overflow-hidden"
        style={{
          height: initialPanelLayoutRef.current.contentHeight,
          opacity: initialPanelLayoutRef.current.contentHeight > 0 ? 1 : 0,
        }}
      >
        <div className="h-full min-h-0 overflow-auto">
          {services.map((item) => (
            <div
              className="grid min-w-175 grid-cols-[12px_minmax(150px,1fr)_64px_82px_82px_82px_minmax(104px,190px)] items-center gap-2 border-b border-(--border-subtle) px-3 py-1.5 font-mono text-[11px] last:border-b-0"
              key={item.service}
            >
              <div
                className="size-2 rounded-xs"
                style={{ backgroundColor: serviceColor(item.service) }}
              />
              <span className="min-w-0 truncate text-xs font-medium text-(--foreground)">
                {item.service}
              </span>
              <span className="text-(--muted)">{item.nodes} nodes</span>
              <span className="text-(--muted)">
                p50 {formatRuntimeDuration(item.p50)}
              </span>
              <span className="text-(--muted)">
                p95 {formatRuntimeDuration(item.p95)}
              </span>
              <span className="text-(--muted)">
                p99 {formatRuntimeDuration(item.p99)}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={
                    item.errors > 0
                      ? "w-10 text-(--error)"
                      : "w-10 text-(--muted)"
                  }
                >
                  {item.errors} err
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-[1px] bg-(--elevated)">
                  <div
                    className="h-full rounded-[1px]"
                    style={{
                      backgroundColor: serviceColor(item.service),
                      opacity: 0.7,
                      width: `${Math.max(2, (item.duration / story.durationMs) * 100)}%`,
                    }}
                  />
                </div>
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
