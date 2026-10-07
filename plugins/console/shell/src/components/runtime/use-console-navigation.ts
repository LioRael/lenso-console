import { useCallback, useEffect, useRef, useState } from "react";

export function useConsoleNavigation(path: string) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setMobileOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);
  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 720px)");
    const resize = () => {
      setNarrow(viewport.matches);
      if (!viewport.matches) {
        setMobileOpen(false);
      }
    };
    viewport.addEventListener("change", resize);
    resize();
    return () => viewport.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const controls = () =>
      Array.from(
        regionRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled])"
        ) ?? []
      ).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        document.activeElement?.closest('[role="menu"]')
      ) {
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = controls();
      const [first] = focusable;
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
    };
  }, [mobileOpen]);

  return {
    mobileOpen,
    collapsed,
    narrow,
    triggerRef,
    regionRef,
    close,
    handleOpenChange: (open: boolean) => {
      if (window.matchMedia("(max-width: 720px)").matches) {
        setMobileOpen(open);
      } else {
        setCollapsed(!open);
      }
    },
  };
}

export type ConsoleNavigationState = ReturnType<typeof useConsoleNavigation>;
