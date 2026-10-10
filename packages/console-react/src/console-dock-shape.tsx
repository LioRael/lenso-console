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
import { useDockProjection } from "./console-dock-projection";
import { dockStyles } from "./console-dock.styles";

type Geometry = {
  width: number;
  height: number;
  x: number;
  y: number;
  radius: number;
};
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
  visible = true,
  compact,
  selection,
  dockRef,
  onFocusDock,
}: PropsWithChildren<{
  position: Position;
  instant: boolean;
  present: boolean;
  visible?: boolean;
  compact: boolean;
  selection: boolean;
  dockRef: RefObject<HTMLDivElement | null>;
  onFocusDock: () => void;
}>) {
  const foregroundRef = useRef<HTMLDivElement>(null);
  const projection = useDockProjection();
  const rich = projection?.active;
  const visual = useRef<Geometry | null>(null);
  const target = useRef<Geometry | null>(null);
  const controller = useRef<ReturnType<typeof animate> | null>(null);
  const progress = useMotionValue(1);
  const transform = useMotionValue("translate3d(0px, 0px, 0)");
  const firstCap = useMotionValue("scale(1)");
  const secondCap = useMotionValue("scale(1)");
  const thirdCap = useMotionValue("scale(1)");
  const fourthCap = useMotionValue("scale(1)");
  const center = useMotionValue("scale(1)");
  const cross = useMotionValue("scale(1)");
  const centerOpacity = useMotionValue(0);
  const clipPath = useMotionValue("inset(0)");
  const contentTransform = useMotionValue("translate3d(0px, 0px, 0)");
  const visibility = useMotionValue<"hidden" | "visible">("hidden");

  // All shape pieces and the hit-test clip share one frame of geometry.
  const paint = useCallback(
    (geometry: Geometry) => {
      const { width, height, x, y, radius } = geometry;
      const diameter = radius * 2;
      visual.current = geometry;
      transform.set(`translate3d(${x}px, ${y}px, 0)`);
      if (dockRef.current) {
        dockRef.current.style.width = `${width}px`;
        dockRef.current.style.height = `${height}px`;
      }
      firstCap.set(`scale(${diameter / shapeSize}, ${diameter / shapeSize})`);
      secondCap.set(
        `translate3d(${width - diameter}px, 0px, 0) scale(${diameter / shapeSize}, ${diameter / shapeSize})`
      );
      thirdCap.set(
        `translate3d(0px, ${height - diameter}px, 0) scale(${diameter / shapeSize}, ${diameter / shapeSize})`
      );
      fourthCap.set(
        `translate3d(${width - diameter}px, ${height - diameter}px, 0) scale(${diameter / shapeSize}, ${diameter / shapeSize})`
      );
      center.set(
        `translate3d(${radius}px, 0px, 0) scale(${Math.max(0, width - diameter) / shapeSize}, ${height / shapeSize})`
      );
      cross.set(
        `translate3d(0px, ${radius}px, 0) scale(${width / shapeSize}, ${Math.max(0, height - diameter) / shapeSize})`
      );
      centerOpacity.set(1);
      const final = target.current ?? geometry;
      const offsetY = rich && position !== "top" ? height - final.height : 0;
      contentTransform.set(`translate3d(0px, ${offsetY}px, 0)`);
      clipPath.set(
        `inset(${-offsetY}px ${final.width - width}px ${final.height - height + offsetY}px 0px round ${radius}px)`
      );
      if (rich) {
        dockRef.current
          ?.closest<HTMLElement>(".console-layout")
          ?.style.setProperty(
            position === "top"
              ? "--console-dock-top-clearance"
              : "--console-dock-bottom-clearance",
            `${position === "top" ? y + height + 16 : window.innerHeight - y + 16}px`
          );
      }
    },
    [
      center,
      cross,
      centerOpacity,
      clipPath,
      contentTransform,
      dockRef,
      firstCap,
      secondCap,
      thirdCap,
      fourthCap,
      transform,
      rich,
      position,
    ]
  );

  const measure = useCallback(() => {
    const foreground = foregroundRef.current;
    if (!foreground || !present) {
      return;
    }
    const natural = rich?.element ?? foreground.firstElementChild;
    if (!natural) {
      return;
    }
    const box = natural.getBoundingClientRect();
    const padding = rich
      ? 0
      : pixels(getComputedStyle(foreground).paddingLeft) * 2;
    const paddingY = rich
      ? 0
      : pixels(getComputedStyle(foreground).paddingTop) * 2;
    const width = box.width + padding;
    const height = box.height + paddingY;
    if (!width || !height) {
      return;
    }
    const anchor = foreground.parentElement?.parentElement;
    if (!anchor) {
      return;
    }
    const edges = getComputedStyle(anchor);
    const viewport = rich ? window.visualViewport : null;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const next: Geometry = {
      width,
      height,
      radius: rich
        ? Math.min(rich.expanded ? 16 : 28, width / 2, height / 2)
        : Math.min(width, height) / 2,
      x:
        position === "left"
          ? pixels(edges.paddingLeft)
          : position === "right"
            ? window.innerWidth - pixels(edges.paddingRight) - width
            : (window.innerWidth - width) / 2,
      y:
        position === "top"
          ? Math.max(pixels(edges.paddingTop), viewportTop + 20)
          : position === "bottom"
            ? viewportTop +
              viewportHeight -
              pixels(edges.paddingBottom) -
              height
            : viewportTop + (viewportHeight - height) / 2,
    };
    const previousTarget = target.current;
    visibility.set(visible ? "visible" : "hidden");
    const unchanged =
      previousTarget?.width === next.width &&
      previousTarget.height === next.height &&
      previousTarget.radius === next.radius &&
      previousTarget.x === next.x &&
      previousTarget.y === next.y;
    if (unchanged && !instant) {
      return;
    }
    controller.current?.stop();
    target.current = next;
    if (dockRef.current) {
      dockRef.current.dataset.geometryReady = "false";
    }
    foreground.style.width = `${width}px`;
    foreground.style.height = `${height}px`;
    const ready = () => {
      if (dockRef.current) {
        dockRef.current.dataset.geometryReady = "true";
      }
      dockRef.current?.dispatchEvent(
        new Event("console-dock-ready", { bubbles: true })
      );
      rich?.onReady();
    };
    const from = visual.current;
    if (!from || instant) {
      paint(next);
      ready();
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
            radius: from.radius + (next.radius - from.radius) * value,
          });
        },
        onComplete: ready,
      });
    }
    visibility.set(visible ? "visible" : "hidden");
  }, [
    dockRef,
    instant,
    paint,
    position,
    present,
    progress,
    visibility,
    visible,
    rich,
  ]);

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
    observer.observe(
      rich?.element ?? foreground.firstElementChild ?? foreground
    );
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      controller.current?.stop();
      // A recreated observer must resume toward its target after interruption.
      target.current = null;
    };
  }, [measure, present, rich?.element]);

  const foregroundStyle = stylex.props(
    dockStyles.foreground,
    rich && dockStyles.richForeground,
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
      inert={!visible}
      aria-hidden={!visible || undefined}
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
            transform: fourthCap,
          }}
        />
        {[secondCap, thirdCap].map((cap, index) => (
          <motion.div
            key={index}
            {...stylex.props(dockStyles.piece, dockStyles.cap)}
            aria-hidden="true"
            style={{
              ...stylex.props(dockStyles.piece, dockStyles.cap).style,
              transform: cap,
            }}
          />
        ))}
        <motion.div
          {...stylex.props(dockStyles.piece)}
          style={{ ...stylex.props(dockStyles.piece).style, transform: cross }}
        />
      </div>
      <motion.div
        ref={foregroundRef}
        className={`dashboard-dock-foreground ${foregroundStyle.className}`}
        style={{
          ...foregroundStyle.style,
          clipPath,
          transform: contentTransform,
        }}
      >
        {children}
        {projection && (
          <div
            ref={projection.setTarget}
            {...stylex.props(dockStyles.projection)}
            data-console-dock-projection="true"
          />
        )}
      </motion.div>
    </motion.div>
  );
}
