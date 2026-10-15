import * as stylex from "@stylexjs/stylex";
import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";

import { ConsoleLayout } from "./console-layout";
import { tableCornerSpacing } from "./console-layout.styles";
import type { ConsoleTablePlacement } from "./console-table-model";

type Geometry = {
  top: number | "auto";
  bottom: number | "auto";
  left: number | "auto";
  right: number | "auto";
  width: number;
  clearance: number;
};

function naturalTop(element: HTMLElement) {
  let top = element.getBoundingClientRect().top + window.scrollY;
  for (
    let parent = element.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    top += parent.scrollTop;
  }
  return top;
}

function measureGroup(
  frame: HTMLElement,
  marker: HTMLElement,
  placement: Exclude<ConsoleTablePlacement, "inline">
): Geometry | null {
  const foreground = frame.closest<HTMLElement>("[data-console-foreground]");
  const region = foreground?.querySelector<HTMLElement>(
    `[data-console-area="${placement}"]`
  );
  if (!foreground || !region) {
    return null;
  }
  const top = placement.startsWith("top");
  const right = placement.endsWith("Right");
  const origin = region.getBoundingClientRect();
  const css = getComputedStyle(frame);
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- Computed CSS margins include a px unit.
  const margin = Number.parseFloat(top ? css.marginTop : css.marginBottom) || 0;
  let edge = top ? origin.top : origin.bottom;
  const controls = Array.from(
    foreground.querySelectorAll<HTMLElement>(
      "button, input, [data-context-body-surface], [data-console-corner]"
    )
  )
    .filter(
      (node) =>
        !frame.contains(node) &&
        !node.closest(
          '[role="dialog"], [role="listbox"], [role="menu"], [hidden]'
        ) &&
        getComputedStyle(node).visibility !== "hidden"
    )
    .map((node) => ({ node, box: node.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0);
  // Explicitly co-located groups get another row; their controls never sit
  // under the filter group while a user is opening or editing a condition.
  for (const { node, box } of controls) {
    if (
      node.closest<HTMLElement>("[data-console-corner]")?.dataset
        .consoleCorner === placement
    ) {
      edge = top
        ? Math.max(edge, box.bottom + 8 - margin)
        : Math.min(edge, box.top - 8 + margin);
    }
  }
  const { height, bottom: frameBottom } = frame.getBoundingClientRect();
  const start = top ? edge + margin : edge - margin - height;
  const end = start + height;
  let leftLimit = 16;
  let rightLimit = innerWidth - 16;
  const occupiedBottom = controls
    .filter(({ node }) =>
      node
        .closest<HTMLElement>("[data-console-corner]")
        ?.dataset.consoleCorner?.startsWith("top")
    )
    .reduce((bottom, { box }) => Math.max(bottom, box.bottom), frameBottom);
  for (const { box } of controls) {
    if (box.bottom <= start || box.top >= end) {
      continue;
    }
    if (right && box.right <= origin.right) {
      leftLimit = Math.max(leftLimit, box.right + 12);
    }
    if (!right && box.left >= origin.left) {
      rightLimit = Math.min(rightLimit, box.left - 12);
    }
  }
  return {
    top: top ? edge : "auto",
    bottom: top ? "auto" : innerHeight - edge,
    left: right ? "auto" : origin.left,
    right: right ? innerWidth - origin.right : "auto",
    width: Math.max(
      44,
      Math.floor(right ? origin.right - leftLimit : rightLimit - origin.left)
    ),
    // A scroll changes the viewport position, not the required initial inset.
    // Otherwise adding clearance during scrolling would pin the first row.
    clearance: top
      ? Math.max(0, Math.ceil(occupiedBottom + 12 - naturalTop(marker)))
      : 0,
  };
}

function equalGeometry(a: Geometry | null, b: Geometry) {
  return (
    a?.top === b.top &&
    a.bottom === b.bottom &&
    a.left === b.left &&
    a.right === b.right &&
    a.width === b.width &&
    a.clearance === b.clearance
  );
}

/** One stable foreground projection for the whole semantic filter group. */
export function ConsoleTableFilterGroup({
  children,
  owner,
  placement,
  active,
}: {
  children: ReactNode;
  owner: string;
  placement: ConsoleTablePlacement;
  active: boolean;
}) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [marker, setMarker] = useState<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const measure = useCallback(() => {
    if (!frame || !marker || !active || placement === "inline") {
      return;
    }
    const next = measureGroup(frame, marker, placement);
    if (next) {
      setGeometry((previous) =>
        equalGeometry(previous, next) ? previous : next
      );
    }
  }, [frame, marker, active, placement]);
  useLayoutEffect(() => {
    measure();
  });
  useLayoutEffect(() => {
    if (!active || placement === "inline" || !frame || !marker) {
      return;
    }
    let raf = 0;
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          measure();
        });
      }
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(frame);
    if (marker.parentElement) {
      resize.observe(marker.parentElement);
    }
    const foreground = frame.closest<HTMLElement>("[data-console-foreground]");
    const mutations = new MutationObserver(schedule);
    if (foreground) {
      mutations.observe(foreground, { childList: true, subtree: true });
      foreground
        .querySelectorAll<HTMLElement>("[data-context-body-surface]")
        .forEach((node) => resize.observe(node));
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [active, placement, frame, marker, measure]);
  if (placement === "inline") {
    return active && <div data-console-table-owner={owner}>{children}</div>;
  }
  return (
    <>
      <div
        ref={setMarker}
        aria-hidden="true"
        {...stylex.props(
          styles.clearance(active ? (geometry?.clearance ?? 0) : 0)
        )}
      />
      <ConsoleLayout.Foreground active={active}>
        <div
          ref={setFrame}
          data-console-corner={placement}
          data-console-table-owner={owner}
          {...stylex.props(
            styles.frame,
            placement.startsWith("top")
              ? tableCornerSpacing.top
              : tableCornerSpacing.bottom,
            geometry
              ? styles.geometry(
                  geometry.top,
                  geometry.bottom,
                  geometry.left,
                  geometry.right,
                  geometry.width
                )
              : styles.pending
          )}
        >
          {children}
        </div>
      </ConsoleLayout.Foreground>
    </>
  );
}

const styles = stylex.create({
  frame: {
    position: "fixed",
    pointerEvents: "auto",
    width: "max-content",
    maxWidth: "calc(100vw - 32px)",
    minWidth: 0,
  },
  pending: { visibility: "hidden" },
  clearance: (height: number) => ({ height, pointerEvents: "none" }),
  geometry: (
    top: number | "auto",
    bottom: number | "auto",
    left: number | "auto",
    right: number | "auto",
    width: number
  ) => ({ top, bottom, left, right, maxWidth: width }),
});
