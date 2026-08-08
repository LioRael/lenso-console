import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { useRef, useState } from "react";

const localStyles = stylex.create({
  utilityAbsolute: {
    position: "absolute",
  },
  utilityBottom15: {
    bottom: "-0.375rem",
  },
  utilityTop15: {
    top: "-0.375rem",
  },
  utilityInsetX0: {
    insetInline: "calc(0.25rem * 0)",
  },
  utilityInsetY0: {
    insetBlock: "calc(0.25rem * 0)",
  },
  utilityLeft15: {
    left: "-0.375rem",
  },
  utilityRight15: {
    right: "-0.375rem",
  },
});

const styles = stylex.create({
  handle: {
    backgroundColor: "transparent",
    outlineStyle: "none",
    position: "relative",
    zIndex: 1,
    ":focus-visible": {
      outlineColor: "var(--focus-ring)",
      outlineOffset: -2,
      outlineStyle: "solid",
      outlineWidth: 2,
    },
  },
  handleHorizontal: { cursor: "col-resize", minHeight: 0, width: 8 },
  handleVertical: { cursor: "ns-resize", height: 8, minWidth: 0 },
  line: {
    position: "absolute",
    transitionDuration: "150ms",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionTimingFunction: "ease",
  },
  lineActive: { backgroundColor: "var(--line-strong)" },
  lineDragging: { backgroundColor: "var(--fg-tertiary)" },
  lineHorizontal: { insetBlock: 0, left: 0, width: 1 },
  lineIdle: { backgroundColor: "var(--border-subtle)" },
  lineVertical: { height: 1, insetInline: 0, top: "50%" },
});

export function ResizeHandle({
  ariaLabel,
  axis = "horizontal",
  onResize,
  onReset,
  slot,
  stylex: stylexStyle,
}: {
  ariaLabel: string;
  axis?: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onReset?: () => void;
  slot?: string;
  stylex?: ConsoleStyle;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const suppressHoverRef = useRef(false);
  const isActive = isDragging || isFocused || isHovered;
  const isVertical = axis === "vertical";
  const resizeCursor = isVertical ? "ns-resize" : "col-resize";

  return (
    <button
      aria-label={ariaLabel}
      {...stylex.props(
        styles.handle,
        axis === "vertical" ? styles.handleVertical : styles.handleHorizontal,
        stylexStyle
      )}
      data-resize-slot={slot}
      ref={handleRef}
      onBlur={() => setIsFocused(false)}
      onDoubleClick={onReset}
      onFocus={() => setIsFocused(true)}
      onKeyDown={(event) => {
        if (event.key === (isVertical ? "ArrowUp" : "ArrowLeft")) {
          event.preventDefault();
          onResize(-16);
        }
        if (event.key === (isVertical ? "ArrowDown" : "ArrowRight")) {
          event.preventDefault();
          onResize(16);
        }
        if (event.key === "Enter") {
          onReset?.();
        }
      }}
      onPointerDown={(event) => {
        setIsDragging(true);
        setIsHovered(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = isVertical ? event.clientY : event.clientX;
        let lastDelta = 0;

        const onPointerMove = (moveEvent: PointerEvent) => {
          const delta =
            (isVertical ? moveEvent.clientY : moveEvent.clientX) - start;
          onResize(delta - lastDelta);
          lastDelta = delta;
        };

        const stopDragging = (upEvent: PointerEvent) => {
          suppressHoverRef.current = true;
          setIsDragging(false);
          setIsHovered(false);
          setIsFocused(false);
          if (handleRef.current?.hasPointerCapture(upEvent.pointerId)) {
            handleRef.current.releasePointerCapture(upEvent.pointerId);
          }
          handleRef.current?.blur();
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", stopDragging);
          window.removeEventListener("pointercancel", stopDragging);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };

        document.body.style.cursor = resizeCursor;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", stopDragging, { once: true });
        window.addEventListener("pointercancel", stopDragging, { once: true });
      }}
      onPointerEnter={() => {
        if (!suppressHoverRef.current) {
          setIsHovered(true);
        }
      }}
      onPointerLeave={() => {
        suppressHoverRef.current = false;
        setIsHovered(false);
      }}
      type="button"
    >
      <span
        {...stylex.props(
          isVertical
            ? [
                localStyles.utilityAbsolute,
                localStyles.utilityBottom15,
                localStyles.utilityTop15,
                localStyles.utilityInsetX0,
              ]
            : [
                localStyles.utilityAbsolute,
                localStyles.utilityInsetY0,
                localStyles.utilityLeft15,
                localStyles.utilityRight15,
              ]
        )}
      />
      <span
        {...stylex.props(
          styles.line,
          isVertical ? styles.lineVertical : styles.lineHorizontal,
          isDragging
            ? styles.lineDragging
            : isActive
              ? styles.lineActive
              : styles.lineIdle
        )}
      />
    </button>
  );
}
