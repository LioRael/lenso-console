import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import GridLayout, {
  type EventCallback,
  type GridLayoutProps,
} from "react-grid-layout";

// RGL 2.3.0 renders drag/resize pixel refs but memo skips same-cell movement.
// A fresh outer child invalidates only the active item; its key, widget children,
// constraints and stop-only layout persistence remain unchanged.
export function PointerGridLayout({
  children,
  signal,
  onDrag,
  onResize,
  onDragStop,
  onResizeStop,
  ...props
}: GridLayoutProps & { signal: AbortSignal }) {
  const [paint, setPaint] = useState<{ id: string } | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef<string | null>(null);
  const liveRef = useRef(false);
  const enabled =
    props.dragConfig?.enabled !== false ||
    props.resizeConfig?.enabled !== false;
  const cancel = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    activeRef.current = null;
  }, []);

  useEffect(() => {
    liveRef.current = enabled && !signal.aborted;
    const retire = () => {
      liveRef.current = false;
      cancel();
    };
    signal.addEventListener("abort", retire, { once: true });
    if (!liveRef.current) {
      cancel();
      setPaint(null);
    }
    return () => {
      signal.removeEventListener("abort", retire);
      retire();
    };
  }, [cancel, enabled, signal]);

  const schedule = useCallback(
    (id: string | undefined) => {
      if (!id || !liveRef.current || signal.aborted) {
        return;
      }
      activeRef.current = id;
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const active = activeRef.current;
        if (active && liveRef.current && !signal.aborted) {
          setPaint({ id: active });
        }
      });
    },
    [signal]
  );
  const drag = useCallback<EventCallback>(
    (...args) => {
      schedule(args[2]?.i);
      onDrag?.(...args);
    },
    [onDrag, schedule]
  );
  const resize = useCallback<EventCallback>(
    (...args) => {
      schedule(args[2]?.i);
      onResize?.(...args);
    },
    [onResize, schedule]
  );
  const stopDrag = useCallback<EventCallback>(
    (...args) => {
      cancel();
      setPaint(null);
      onDragStop?.(...args);
    },
    [cancel, onDragStop]
  );
  const stopResize = useCallback<EventCallback>(
    (...args) => {
      cancel();
      setPaint(null);
      onResizeStop?.(...args);
    },
    [cancel, onResizeStop]
  );
  const gridChildren: GridLayoutProps["children"][] = [];
  // forEach retains the original keys. map/toArray prefix them, breaking layout i.
  // oxlint-disable-next-line react/no-react-children -- RGL's public children contract requires traversal without changing layout keys.
  Children.forEach(children, (child) => {
    gridChildren.push(
      isValidElement(child) && child.key === paint?.id
        ? // oxlint-disable-next-line react/no-clone-element -- Invalidate the active RGL memo while retaining its key and renderer subtree.
          cloneElement(child)
        : child
    );
  });
  return (
    <GridLayout
      {...props}
      onDrag={drag}
      onResize={resize}
      onDragStop={stopDrag}
      onResizeStop={stopResize}
    >
      {gridChildren}
    </GridLayout>
  );
}
