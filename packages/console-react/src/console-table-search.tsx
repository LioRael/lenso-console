import { SearchField } from "@lenso/ui/search-field";
import * as stylex from "@stylexjs/stylex";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useIsPresent,
  usePresenceData,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ConsoleIconButton } from "./console-icon-button";
import { iconButtonStyles } from "./console-icon-button.styles";

export interface ConsoleTableSearchProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

function SearchPanel({
  label,
  value,
  onValueChange,
  disabled,
  close,
  width,
  size,
  offset,
  fromRight,
  instant,
  panelId,
}: ConsoleTableSearchProps & {
  close: (instant: boolean) => void;
  width: number;
  size: number;
  offset: number;
  fromRight: boolean;
  instant: boolean;
  panelId: string;
}) {
  const present = useIsPresent();
  const exitInstant = Boolean(usePresenceData());
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (present) {
      input.current?.focus({ preventScroll: true });
    }
  }, [present]);
  const collapsed = fromRight
    ? `inset(0px 0px 0px ${width - size}px round ${size / 2}px)`
    : `inset(0px ${width - size}px 0px 0px round ${size / 2}px)`;
  return (
    <m.div
      id={panelId}
      data-console-search-panel=""
      inert={!present}
      aria-hidden={!present || undefined}
      initial={instant ? false : { clipPath: collapsed }}
      animate={{ clipPath: `inset(-4px -4px -4px -4px round ${size / 2}px)` }}
      exit={{ clipPath: collapsed }}
      transition={{
        duration: (present ? instant : exitInstant) ? 0 : 0.18,
        ease: [0.23, 1, 0.32, 1],
      }}
      {...stylex.props(
        styles.panel,
        styles.size(width, size),
        styles.offset(offset),
        fromRight ? styles.end : styles.start,
        !present && styles.retiring
      )}
    >
      <SearchField.Root variant="secondary" xstyle={styles.fill}>
        <SearchField.Group xstyle={[styles.field, fromRight && styles.reverse]}>
          <ConsoleIconButton
            label={`Collapse ${label.toLowerCase()}`}
            variant="ghost"
            xstyle={styles.trigger}
            onClick={(event) => close(event.detail === 0)}
          >
            {fromRight ? (
              <ArrowRight size={18} aria-hidden="true" />
            ) : (
              <ArrowLeft size={18} aria-hidden="true" />
            )}
          </ConsoleIconButton>
          <SearchField.Input
            ref={input}
            aria-label={label}
            placeholder={label}
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            xstyle={styles.input}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
            }}
          />
          <SearchField.ClearButton
            aria-label={`Clear ${label.toLowerCase()}`}
            disabled={disabled || !value}
          >
            <X size={16} aria-hidden="true" />
          </SearchField.ClearButton>
        </SearchField.Group>
      </SearchField.Root>
    </m.div>
  );
}

/** A disclosure only: collapsing never changes the page-owned search predicate. */
export function ConsoleTableSearch(props: ConsoleTableSearchProps) {
  const [open, setOpen] = useState(false);
  const [geometry, setGeometry] = useState({
    width: 300,
    size: 36,
    offset: 0,
    fromRight: false,
  });
  const [instant, setInstant] = useState(false);
  const reduced = useReducedMotion();
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef(false);
  const id = useId();
  useLayoutEffect(() => {
    if (!open && restore.current) {
      restore.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [open]);
  const close = (immediate: boolean) => {
    setInstant(immediate);
    restore.current = true;
    setOpen(false);
  };
  const measure = useCallback(() => {
    const button = trigger.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const corner = button.closest<HTMLElement>("[data-console-corner]")?.dataset
      .consoleCorner;
    const fromRight = corner?.endsWith("Right") ?? rect.left > innerWidth / 2;
    let start = 16;
    let end = innerWidth - 16;
    let { bottom } = rect;
    const foreground = button.closest("[data-console-area]")?.parentElement;
    for (const control of foreground?.querySelectorAll<HTMLElement>(
      "button, input, select, [role=button], [data-console-filters]"
    ) ?? []) {
      if (
        root.current?.contains(control) ||
        getComputedStyle(control).visibility === "hidden"
      ) {
        continue;
      }
      const box = control.getBoundingClientRect();
      if (
        control
          .closest<HTMLElement>("[data-console-corner]")
          ?.dataset.consoleCorner?.startsWith("top")
      ) {
        bottom = Math.max(bottom, box.bottom);
      }
      if (box.bottom <= rect.top || box.top >= rect.bottom || box.width === 0) {
        continue;
      }
      if (box.right <= rect.left) {
        start = Math.max(start, box.right + 8);
      }
      if (box.left >= rect.right) {
        end = Math.min(end, box.left - 8);
      }
    }
    const available = fromRight ? rect.right - start : end - rect.left;
    const below = available < Math.min(180, innerWidth - 32);
    setGeometry({
      width: Math.max(
        rect.width,
        Math.min(
          300,
          below
            ? fromRight
              ? rect.right - 16
              : innerWidth - rect.left - 16
            : available
        )
      ),
      fromRight,
      size: rect.width,
      offset: below ? bottom - rect.top + 8 : 0,
    });
  }, []);
  useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener("resize", measure);
    const onFilterFocus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "[data-console-filters], [data-console-filter-popup]"
        )
      ) {
        restore.current = false;
        setInstant(true);
        setOpen(false);
      }
    };
    document.addEventListener("focusin", onFilterFocus);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", onFilterFocus);
    };
  }, [open, measure]);
  return (
    <LazyMotion features={domAnimation}>
      <div
        ref={root}
        {...stylex.props(styles.root, iconButtonStyles.iconButton)}
      >
        <ConsoleIconButton
          ref={trigger}
          label={props.label}
          tooltip={props.value ? `${props.label} (filter active)` : props.label}
          aria-description={
            props.value ? "A search filter is active." : undefined
          }
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          variant={props.value ? "primary" : "secondary"}
          disabled={props.disabled}
          xstyle={[styles.trigger, open && styles.hidden]}
          onClick={(event) => {
            measure();
            setInstant(event.detail === 0);
            setOpen(true);
          }}
        >
          <Search size={18} aria-hidden="true" />
        </ConsoleIconButton>
        <AnimatePresence initial={false} custom={instant || !!reduced}>
          {open && (
            <SearchPanel
              key="search"
              {...props}
              {...geometry}
              panelId={id}
              instant={instant || !!reduced}
              close={close}
            />
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}

const styles = stylex.create({
  root: { position: "relative", flexShrink: 0 },
  trigger: {
    position: "relative",
    zIndex: 2,
  },
  hidden: { visibility: "hidden" },
  panel: { position: "absolute", top: 0, zIndex: 1 },
  retiring: { pointerEvents: "none" },
  start: { left: 0 },
  end: { right: 0 },
  size: (width: number, height: number) => ({ width, height }),
  offset: (top: number) => ({ top }),
  fill: { height: "100%" },
  field: { height: "100%", minHeight: 0, paddingBlock: 0, borderRadius: 22 },
  reverse: { flexDirection: "row-reverse" },
  input: {
    "::-webkit-search-cancel-button": { display: "none" },
    minWidth: 0,
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    height: "100%",
    minHeight: 0,
    paddingBlock: 0,
  },
});
