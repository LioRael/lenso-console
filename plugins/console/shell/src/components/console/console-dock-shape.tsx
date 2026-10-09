import * as stylex from "@stylexjs/stylex";
import { animate, motion, useMotionValue } from "motion/react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
  type RefObject,
} from "react";

import type { Position } from "./console-dock";
import { dockStyles } from "./console-dock.styles";

type Geometry = { width: number; height: number; x: number; y: number };
const shapeSize = 64;

function pixels(length: string) {
  // Computed paddings contain "px"; Number("20px") would produce NaN.
  // oxlint-disable-next-line unicorn/prefer-number-coercion
  return Number.parseFloat(length);
}

export function DockShape({
  children,
  position,
  instant,
  present,
  compact,
  selection,
  dockRef,
  onFocusDock,
}: PropsWithChildren<{
  position: Position;
  instant: boolean;
  present: boolean;
  compact: boolean;
  selection: boolean;
  dockRef: RefObject<HTMLDivElement | null>;
  onFocusDock: () => void;
}>) {
  const foregroundRef = useRef<HTMLDivElement>(null);
  const visual = useRef<Geometry | null>(null);
  const target = useRef<Geometry | null>(null);
  const controller = useRef<ReturnType<typeof animate> | null>(null);
  const progress = useMotionValue(1);
  const transform = useMotionValue("translate3d(0px, 0px, 0)");
  const firstCap = useMotionValue("scale(1)");
  const secondCap = useMotionValue("scale(1)");
  const center = useMotionValue("scale(1)");
  const centerOpacity = useMotionValue(0);
  const clipPath = useMotionValue("inset(0)");
  const visibility = useMotionValue<"hidden" | "visible">("hidden");

  // All shape pieces and the hit-test clip share one frame of geometry.
  const paint = useCallback(
    (geometry: Geometry) => {
      const { width, height, x, y } = geometry;
      const diameter = Math.min(width, height);
      const horizontal = width >= height;
      visual.current = geometry;
      transform.set(`translate3d(${x}px, ${y}px, 0)`);
      firstCap.set(`scale(${diameter / shapeSize}, ${diameter / shapeSize})`);
      secondCap.set(
        `translate3d(${width - diameter}px, ${height - diameter}px, 0) scale(${diameter / shapeSize}, ${diameter / shapeSize})`
      );
      center.set(
        horizontal
          ? `translate3d(${diameter / 2}px, 0px, 0) scale(${(width - diameter) / shapeSize}, ${diameter / shapeSize})`
          : `translate3d(0px, ${diameter / 2}px, 0) scale(${diameter / shapeSize}, ${(height - diameter) / shapeSize})`
      );
      centerOpacity.set(width === height ? 0 : 1);
      const final = target.current ?? geometry;
      clipPath.set(
        `inset(0px ${final.width - width}px ${final.height - height}px 0px round ${diameter / 2}px)`
      );
    },
    [center, centerOpacity, clipPath, firstCap, secondCap, transform]
  );

  const measure = useCallback(() => {
    const foreground = foregroundRef.current;
    if (!foreground || !present) {
      return;
    }
    const { width, height } = foreground.getBoundingClientRect();
    if (!width || !height) {
      return;
    }
    const anchor = foreground.parentElement?.parentElement;
    if (!anchor) {
      return;
    }
    const edges = getComputedStyle(anchor);
    const next: Geometry = {
      width,
      height,
      x:
        position === "left"
          ? pixels(edges.paddingLeft)
          : position === "right"
            ? window.innerWidth - pixels(edges.paddingRight) - width
            : (window.innerWidth - width) / 2,
      y:
        position === "top"
          ? pixels(edges.paddingTop)
          : position === "bottom"
            ? window.innerHeight - pixels(edges.paddingBottom) - height
            : (window.innerHeight - height) / 2,
    };
    const previousTarget = target.current;
    const unchanged =
      previousTarget?.width === next.width &&
      previousTarget.height === next.height &&
      previousTarget.x === next.x &&
      previousTarget.y === next.y;
    if (unchanged && !instant) {
      return;
    }
    controller.current?.stop();
    target.current = next;
    const from = visual.current;
    if (!from || instant) {
      paint(next);
    } else {
      // Rebase the clip to the new natural box before the first animated frame.
      paint(from);
      progress.set(0);
      controller.current = animate(progress, 1, {
        duration: 0.21,
        ease: [0.23, 1, 0.32, 1],
        onUpdate: (value) => {
          paint({
            width: from.width + (next.width - from.width) * value,
            height: from.height + (next.height - from.height) * value,
            x: from.x + (next.x - from.x) * value,
            y: from.y + (next.y - from.y) * value,
          });
        },
      });
    }
    visibility.set("visible");
  }, [instant, paint, position, present, progress, visibility]);

  useLayoutEffect(() => {
    if (present) {
      measure();
    } else {
      controller.current?.stop();
    }
  });

  useLayoutEffect(() => {
    const foreground = foregroundRef.current;
    if (!foreground || !present) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(foreground);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      controller.current?.stop();
      // A recreated observer must resume toward its target after interruption.
      target.current = null;
    };
  }, [measure, present]);

  const foregroundStyle = stylex.props(
    dockStyles.foreground,
    selection && dockStyles.selectionForeground,
    selection &&
      (position === "left" || position === "right") &&
      dockStyles.sideSelectionForeground
  );

  return (
    <motion.div
      ref={dockRef}
      className={`dashboard-dock dashboard-motion-dock ${stylex.props(dockStyles.dock).className}`}
      data-dashboard-dock="true"
      data-compact={compact}
      style={{ ...stylex.props(dockStyles.dock).style, transform, visibility }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { duration: instant ? 0 : 0.1 } }}
      onFocusCapture={onFocusDock}
    >
      <div
        {...stylex.props(dockStyles.shape)}
        className={`dashboard-dock-shape ${stylex.props(dockStyles.shape).className}`}
        aria-hidden="true"
      >
        <motion.div
          className={`dashboard-dock-cap ${stylex.props(dockStyles.piece, dockStyles.cap).className}`}
          data-dock-cap="start"
          aria-hidden="true"
          style={{
            ...stylex.props(dockStyles.piece, dockStyles.cap).style,
            transform: firstCap,
          }}
        />
        <motion.div
          className={`dashboard-dock-fill ${stylex.props(dockStyles.piece).className}`}
          style={{
            ...stylex.props(dockStyles.piece).style,
            transform: center,
            opacity: centerOpacity,
          }}
        />
        <motion.div
          className={`dashboard-dock-cap ${stylex.props(dockStyles.piece, dockStyles.cap).className}`}
          data-dock-cap="end"
          aria-hidden="true"
          style={{
            ...stylex.props(dockStyles.piece, dockStyles.cap).style,
            transform: secondCap,
          }}
        />
      </div>
      <motion.div
        ref={foregroundRef}
        className={`dashboard-dock-foreground ${foregroundStyle.className}`}
        style={{ ...foregroundStyle.style, clipPath }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
