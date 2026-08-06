import { stylexClassName } from "@lenso/console-ui";
import { useRef, useState } from "react";

export function ResizeHandle({
  ariaLabel,
  axis = "horizontal",
  className,
  onResize,
  onReset,
}: {
  ariaLabel: string;
  axis?: "horizontal" | "vertical";
  className?: string;
  onResize: (delta: number) => void;
  onReset?: () => void;
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
      className={stylexClassName(
        `group relative z-1 bg-transparent outline-hidden focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:outline-offset-[-2px] ${
          isVertical ? "h-2 min-w-0" : "min-h-0 w-2"
        } ${className ?? ""}`
      )}
      ref={handleRef}
      style={{ cursor: resizeCursor }}
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
        className={
          isVertical
            ? "absolute -bottom-1.5 -top-1.5 inset-x-0"
            : "absolute inset-y-0 -left-1.5 -right-1.5"
        }
      />
      <span
        className={stylexClassName(
          `absolute transition ${
            isVertical ? "inset-x-0 top-1/2 h-px" : "inset-y-0 left-1/2 w-px"
          } ${
            isDragging
              ? "bg-(--fg-tertiary)"
              : isActive
                ? "bg-(--line-strong)"
                : "bg-(--border-subtle)"
          }`
        )}
      />
    </button>
  );
}
