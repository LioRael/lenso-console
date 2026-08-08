import { ScrollArea } from "@base-ui/react/scroll-area";
import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode, WheelEvent } from "react";

const styles = stylex.create({
  content: {
    minWidth: "100%",
    width: "max-content",
  },
  heightFull: { height: "100%" },
  root: {
    minWidth: 0,
    position: "relative",
  },
  viewport: {
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
    scrollbarWidth: "none",
  },
});

export function HorizontalScrollArea({
  children,
  contentStylex,
  stylex: rootStylex,
  viewportStylex,
}: {
  children: ReactNode;
  contentStylex?: ConsoleStyle;
  stylex?: ConsoleStyle;
  viewportStylex?: ConsoleStyle;
}) {
  return (
    <ScrollArea.Root
      {...stylex.props(styles.root, rootStylex)}
      overflowEdgeThreshold={1}
    >
      <ScrollArea.Viewport
        {...stylex.props(styles.viewport, viewportStylex)}
        onWheel={handleWheel}
      >
        <ScrollArea.Content {...stylex.props(styles.content, contentStylex)}>
          {children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  );
}

export function HorizontalTabScroll({ children }: { children: ReactNode }) {
  return (
    <HorizontalScrollArea
      contentStylex={styles.heightFull}
      stylex={styles.heightFull}
      viewportStylex={styles.heightFull}
    >
      {children}
    </HorizontalScrollArea>
  );
}

function handleWheel(event: WheelEvent<HTMLDivElement>) {
  const viewport = event.currentTarget;
  const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;

  if (maxScrollLeft <= 0) {
    return;
  }

  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

  if (delta === 0) {
    return;
  }

  const nextScrollLeft = Math.max(
    0,
    Math.min(maxScrollLeft, viewport.scrollLeft + delta)
  );

  if (nextScrollLeft === viewport.scrollLeft) {
    return;
  }

  event.preventDefault();
  viewport.scrollLeft = nextScrollLeft;
}
