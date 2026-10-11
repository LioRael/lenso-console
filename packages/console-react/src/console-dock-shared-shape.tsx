import * as stylex from "@stylexjs/stylex";
import {
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
  type RefObject,
} from "react";

import type { Position } from "./console-dock";
import { useDockProjection } from "./console-dock-projection";
import { dockStyles } from "./console-dock.styles";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export function SharedDockShape({
  children,
  expanded = false,
  contentKey,
  compact,
  selection,
  position,
  instant,
  present,
  visible = true,
  progress,
  dockRef,
  onFocusDock,
}: PropsWithChildren<{
  expanded?: boolean;
  contentKey?: string;
  position: Position;
  compact: boolean;
  selection: boolean;
  present: boolean;
  visible?: boolean;
  instant: boolean;
  progress: MotionValue<number>;
  dockRef: RefObject<HTMLDivElement | null>;
  onFocusDock: () => void;
}>) {
  const projection = useDockProjection();
  const rich = projection?.active;
  const richToken = rich?.token ?? null;
  const contentRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const guardRef = useRef<HTMLDivElement>(null);
  const visual = useRef<Geometry | null>(null);
  const target = useRef<Geometry | null>(null);
  const measuredContentKey = useRef(contentKey);
  const measuredRichToken = useRef<object | null>(null);
  const preserveSelection = useRef(selection && !expanded);
  const revealing = useRef(false);
  const controller = useRef<ReturnType<typeof animate> | null>(null);
  const transform = useMotionValue("none");
  const radius = useMotionValue("28px");
  const clipPath = useMotionValue("inset(0)");
  const opacity = useMotionValue(1);
  const pointerEvents = useMotionValue<"none" | "auto">("auto");

  useLayoutEffect(() => {
    const changed =
      measuredContentKey.current !== contentKey ||
      measuredRichToken.current !== richToken;
    if (changed) {
      measuredContentKey.current = contentKey;
      revealing.current = true;
    }
    preserveSelection.current =
      (selection && !expanded) || (richToken !== null && !changed);
    measuredRichToken.current = richToken;
  }, [contentKey, selection, expanded, richToken]);

  const measure = useCallback(() => {
    const frame = dockRef.current;
    const content = contentRef.current;
    if (!frame || !content || !present) {
      return;
    }
    // Read natural layout once per target, including the portal's later mount.
    const box = frame.getBoundingClientRect();
    const inner = content.getBoundingClientRect();
    const next: Geometry = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      radius: rich
        ? Math.min(rich.expanded ? 16 : 28, box.width / 2, box.height / 2)
        : expanded
          ? 24
          : Math.min(box.width, box.height) / 2,
    };
    const previous = target.current;
    if (
      !box.width ||
      !box.height ||
      (!instant &&
        previous &&
        Object.keys(next).every(
          (key) =>
            next[key as keyof Geometry] === previous[key as keyof Geometry]
        ))
    ) {
      if (progress.get() === 1) {
        revealing.current = false;
        rich?.onReady();
      }
      return;
    }
    controller.current?.stop();
    target.current = next;
    frame.dataset.geometryReady = "false";
    if (!preserveSelection.current) {
      revealing.current = true;
    }
    const paint = (geometry: Geometry, value: number) => {
      visual.current = geometry;
      const sx = geometry.width / next.width;
      const sy = geometry.height / next.height;
      const nextTransform =
        value === 1
          ? "none"
          : `translate3d(${geometry.x - next.x}px, ${geometry.y - next.y}px, 0) scale(${sx}, ${sy})`;
      const nextRadius = `${geometry.radius / sx}px / ${geometry.radius / sy}px`;
      const clip = (bounds: DOMRect) =>
        `inset(${geometry.y - bounds.y}px ${bounds.right - geometry.x - geometry.width}px ${bounds.bottom - geometry.y - geometry.height}px ${geometry.x - bounds.x}px round ${geometry.radius}px)`;
      const nextClip = clip(inner);
      transform.set(nextTransform);
      radius.set(nextRadius);
      clipPath.set(nextClip);
      // Content swaps and the directory reveal at the end of travel. Resizing
      // the same selection keeps it visible; the guard protects moving controls.
      const reveal =
        instant || value === 1 || !revealing.current
          ? 1
          : Math.max(0, (value - 0.8) / 0.2);
      opacity.set(reveal);
      pointerEvents.set(value === 1 ? "auto" : "none");
      // A ResizeObserver can run after Motion's render queue for this frame.
      // Commit the initial rebase and its clip atomically before browser paint.
      if (surfaceRef.current) {
        surfaceRef.current.style.transform = nextTransform;
        surfaceRef.current.style.borderRadius = nextRadius;
      }
      content.style.clipPath = nextClip;
      content.style.opacity = String(reveal);
      content.style.pointerEvents = value === 1 ? "auto" : "none";
      // UI controls can opt back into pointer events. A physical interaction
      // guard retires those hits without making the initially focused input inert.
      // Use the foreground's unscaled clip coordinates: a transformed guard's
      // box hit-test can miss fractional edges that the foreground clip admits.
      if (guardRef.current) {
        guardRef.current.style.clipPath = clip(box);
        guardRef.current.style.pointerEvents = value === 1 ? "none" : "auto";
      }
      progress.set(reveal);
      if (value === 1) {
        revealing.current = false;
        frame.dataset.geometryReady = "true";
        frame.dispatchEvent(new Event("console-dock-ready", { bubbles: true }));
        rich?.onReady();
      }
    };
    const from = visual.current;
    const settled =
      from &&
      Object.keys(next).every(
        (key) => next[key as keyof Geometry] === from[key as keyof Geometry]
      );
    if (!from || instant || settled) {
      paint(next, 1);
      return;
    }
    paint(from, 0);
    controller.current = animate(0, 1, {
      duration: 0.24,
      ease: [0.77, 0, 0.175, 1],
      onUpdate: (value) => {
        paint(
          {
            x: from.x + (next.x - from.x) * value,
            y: from.y + (next.y - from.y) * value,
            width: from.width + (next.width - from.width) * value,
            height: from.height + (next.height - from.height) * value,
            radius: from.radius + (next.radius - from.radius) * value,
          },
          value
        );
      },
    });
  }, [
    dockRef,
    expanded,
    instant,
    present,
    progress,
    transform,
    radius,
    clipPath,
    opacity,
    pointerEvents,
    rich,
  ]);

  useLayoutEffect(() => {
    measure();
  });
  useLayoutEffect(() => {
    const frame = dockRef.current;
    if (!frame || !present) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      controller.current?.stop();
      // Retarget from the last painted geometry, not a stale completion.
      target.current = null;
    };
  }, [dockRef, measure, present]);

  const frameStyle = stylex.props(
    dockStyles.sharedFrame,
    !expanded && selection && dockStyles.selectionForeground,
    !expanded &&
      selection &&
      (position === "left" || position === "right") &&
      dockStyles.sideSelectionForeground,
    expanded && !rich && dockStyles.directorySurface,
    !!rich && dockStyles.richSurface,
    !visible && dockStyles.hiddenFrame
  );
  return (
    <div
      ref={dockRef}
      {...frameStyle}
      className={`dashboard-dock ${frameStyle.className}`}
      data-dashboard-dock="true"
      data-expanded={expanded}
      data-compact={compact}
      inert={!visible}
      aria-hidden={!visible || undefined}
      onFocusCapture={onFocusDock}
    >
      <motion.div
        ref={surfaceRef}
        {...stylex.props(dockStyles.sharedSurface)}
        data-dashboard-dock-surface="true"
        aria-hidden="true"
        style={{ transform, transformOrigin: "0 0", borderRadius: radius }}
      />
      <motion.div
        ref={contentRef}
        data-dashboard-dock-content="true"
        style={{ clipPath, opacity, pointerEvents }}
      >
        {children}
        {projection && (
          <div ref={projection.setTarget} data-console-dock-projection="true" />
        )}
      </motion.div>
      <div
        ref={guardRef}
        {...stylex.props(dockStyles.presentationGuard)}
        data-dashboard-dock-guard="true"
        aria-hidden="true"
      />
    </div>
  );
}
