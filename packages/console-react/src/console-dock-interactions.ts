import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export function isConsoleTextTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'
    )
  );
}

export function consoleCommandKey(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "metaKey"
    | "ctrlKey"
    | "altKey"
    | "shiftKey"
    | "isComposing"
    | "repeat"
    | "defaultPrevented"
  >,
  mac: boolean
) {
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.repeat &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k" &&
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}

/** Unlike preset shortcuts, Command is available in text fields and with one preset. */
export function useConsoleCommandKey(
  enabled: boolean,
  onInvoke: () => void,
  dockRef: RefObject<HTMLElement | null>
) {
  const callback = useRef(onInvoke);
  useLayoutEffect(() => {
    callback.current = onInvoke;
  });
  useEffect(() => {
    let composing = false;
    const start = () => {
      composing = true;
    };
    const end = () => {
      composing = false;
    };
    const down = (event: KeyboardEvent) => {
      if (
        !enabled ||
        composing ||
        !consoleCommandKey(event, /Mac|iPhone|iPad/.test(navigator.platform))
      ) {
        return;
      }
      // A non-modal overlay may leave focus on its outside trigger. Eligibility
      // belongs to the open layer, not just the shortcut's event target.
      const overlays = document.querySelectorAll<HTMLElement>(
        'dialog[open], [popover]:popover-open, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
      );
      if (
        Array.from(overlays).some(
          (overlay) =>
            !(
              dockRef.current?.contains(overlay) &&
              Object.hasOwn(overlay.dataset, "consoleDockView")
            ) &&
            !overlay.closest(
              '[inert], [hidden], [aria-hidden="true"], [data-closed]'
            ) &&
            overlay.getClientRects().length > 0 &&
            getComputedStyle(overlay).visibility !== "hidden"
        )
      ) {
        return;
      }
      event.preventDefault();
      callback.current();
    };
    window.addEventListener("keydown", down);
    document.addEventListener("compositionstart", start);
    document.addEventListener("compositionend", end);
    return () => {
      window.removeEventListener("keydown", down);
      document.removeEventListener("compositionstart", start);
      document.removeEventListener("compositionend", end);
    };
  }, [enabled, dockRef]);
}

export function consolePresetOrdinal(
  event: Pick<
    KeyboardEvent,
    | "code"
    | "metaKey"
    | "ctrlKey"
    | "altKey"
    | "shiftKey"
    | "isComposing"
    | "repeat"
    | "getModifierState"
  >,
  mac: boolean
) {
  if (
    event.isComposing ||
    event.repeat ||
    event.shiftKey ||
    event.getModifierState("AltGraph") ||
    !event.altKey ||
    (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) ||
    !/^Digit[1-9]$/.test(event.code)
  ) {
    return null;
  }
  return Number(event.code.slice(-1)) - 1;
}

export function useConsolePresetKeys(
  enabled: boolean,
  count: number,
  onSelect: (index: number) => void
) {
  const [held, setHeld] = useState(false);
  const callback = useRef(onSelect);
  useLayoutEffect(() => {
    callback.current = onSelect;
  });
  useEffect(() => {
    setHeld(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let composing = false;
    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
      setHeld(false);
    };
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const down = (event: KeyboardEvent) => {
      if (
        !enabled ||
        !event.isTrusted ||
        event.defaultPrevented ||
        composing ||
        event.isComposing ||
        isConsoleTextTarget(event.target)
      ) {
        clear();
        return;
      }
      const ordinal = consolePresetOrdinal(event, mac);
      if (ordinal !== null && ordinal < count) {
        clear();
        event.preventDefault();
        callback.current(ordinal);
        return;
      }
      if (
        event.key === "Meta" &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey
      ) {
        clear();
        timer = setTimeout(() => setHeld(true), 550);
      } else if (event.key !== "Meta") {
        clear();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Meta" || !event.metaKey) {
        clear();
      }
    };
    const compositionStart = () => {
      composing = true;
      clear();
    };
    const compositionEnd = () => {
      composing = false;
    };
    const visibility = () => {
      if (document.hidden) {
        clear();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("compositionstart", compositionStart);
    document.addEventListener("compositionend", compositionEnd);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("compositionstart", compositionStart);
      document.removeEventListener("compositionend", compositionEnd);
    };
  }, [enabled, count]);
  return enabled && held;
}

/** Capture only after a hold succeeds; ordinary touch movement remains scrolling. */
export function useConsoleLongPress(onHold?: () => void) {
  const callback = useRef(onHold);
  useLayoutEffect(() => {
    callback.current = onHold;
  });
  const gesture = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
    held: boolean;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const suppress = useRef(false);
  useEffect(
    () => () => {
      if (gesture.current) {
        clearTimeout(gesture.current.timer);
      }
    },
    []
  );
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      suppress.current = false;
      if (
        !onHold ||
        event.button !== 0 ||
        !event.isPrimary ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const element = event.currentTarget;
      const current = {
        timer: setTimeout(() => {
          if (
            gesture.current === current &&
            !current.moved &&
            callback.current
          ) {
            current.held = true;
            suppress.current = true;
            element.setPointerCapture(current.pointerId);
            callback.current();
          }
        }, 550),
        x: event.clientX,
        y: event.clientY,
        held: false,
        moved: false,
        pointerId: event.pointerId,
      };
      gesture.current = current;
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const { current } = gesture;
      if (
        current &&
        Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8
      ) {
        current.moved = true;
        suppress.current = true;
        clearTimeout(current.timer);
      }
    },
    onPointerUp: () => {
      if (gesture.current) {
        clearTimeout(gesture.current.timer);
      }
      gesture.current = null;
    },
    onPointerLeave: () => {
      if (gesture.current && !gesture.current.held) {
        clearTimeout(gesture.current.timer);
        gesture.current = null;
        suppress.current = true;
      }
    },
    onPointerCancel: () => {
      if (gesture.current) {
        clearTimeout(gesture.current.timer);
      }
      gesture.current = null;
      suppress.current = true;
    },
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      if (gesture.current?.held || suppress.current) {
        event.preventDefault();
      }
    },
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      if (event.detail > 0 && suppress.current) {
        event.preventDefault();
        event.stopPropagation();
        suppress.current = false;
      }
    },
  };
}
