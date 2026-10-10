import * as stylex from "@stylexjs/stylex";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  Component,
  createContext,
  useContext,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type {
  ConsoleDockController,
  ConsoleDockExitReason,
  ConsoleDockViewState,
  ConsolePosition,
} from "./composition";
import { useConsoleActivation } from "./console-activation";
import {
  ConsoleDockProjectionProvider,
  useDockProjection,
} from "./console-dock-projection";
import { ConsoleIconButton } from "./console-icon-button";
import type { ConsoleDockViewItem } from "./console-model";

export interface ConsoleDockContentProps {
  bar: ReactNode;
  tray?: { label: string; content: ReactNode };
  initialFocus: RefObject<HTMLElement | null>;
  beforeExit?: (reason: ConsoleDockExitReason) => boolean | Promise<boolean>;
}

type Presentation = {
  token: object;
  item: ConsoleDockViewItem;
  pathname: string;
  scopeKey: string;
  opener: HTMLElement | null;
  instant: boolean;
  expanded: boolean;
};
type ContentRegistration = Pick<
  ConsoleDockContentProps,
  "initialFocus" | "beforeExit"
> & {
  hasTray: boolean;
  trayElement: HTMLElement | null;
  focusBar(): void;
};
type ExitRequest = (
  reason: ConsoleDockExitReason,
  afterExit?: () => void
) => void;
type ViewContext = {
  dock: ConsoleDockController;
  label: string;
  position: ConsolePosition;
  presentation: Presentation | null;
  registration: RefObject<ContentRegistration | null>;
};
const DockViewContext = createContext<ViewContext | null>(null);

class DockViewBoundary extends Component<
  { children: ReactNode; onFailure(): void },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode; onFailure(): void }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? <UnavailableDockView /> : this.props.children;
  }
}

function UnavailableDockView() {
  const message = useRef<HTMLParagraphElement>(null);
  return (
    <ConsoleDockContent
      initialFocus={message}
      bar={
        <p ref={message} tabIndex={-1} role="alert">
          This Dock view could not be displayed.
        </p>
      }
    />
  );
}

function sameViewIdentity(
  left: ConsoleDockViewItem,
  right: ConsoleDockViewItem
) {
  return (
    left.id === right.id &&
    left.binding.definition === right.binding.definition &&
    left.binding.services === right.binding.services &&
    left.definition === right.definition
  );
}

/** Shell-owned presentation, with retained owners outside route-keyed page mounts. */
export function ConsoleDockViewHost({
  items,
  pathname,
  scopeKey,
  position,
  blocked,
  children,
}: {
  items: readonly ConsoleDockViewItem[];
  pathname: string;
  scopeKey: string;
  position: ConsolePosition;
  blocked: boolean;
  children(input: {
    active: boolean;
    restoreFocus(): void;
    entries: readonly {
      id: string;
      label: string;
      icon: ReactNode;
      disabled: boolean;
      onInvoke: (instant: boolean) => void;
    }[];
  }): ReactNode;
}) {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  const exitRequest = useRef<ExitRequest | null>(null);
  const pendingFocus = useRef<{
    itemId: string;
    opener: HTMLElement | null;
    previous: Element | null;
  } | null>(null);
  const active =
    presentation &&
    items.some((item) => sameViewIdentity(item, presentation.item)) &&
    presentation.pathname === pathname &&
    presentation.scopeKey === scopeKey
      ? presentation
      : null;
  const committed = useRef(active);
  const admission = useRef({ items, pathname, scopeKey, blocked });
  useInsertionEffect(() => {
    committed.current = active;
    admission.current = { items, pathname, scopeKey, blocked };
  });
  const lifetime = useRef(true);
  useInsertionEffect(() => {
    lifetime.current = true;
    return () => {
      lifetime.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (presentation && !active) {
      pendingFocus.current = {
        itemId: presentation.item.id,
        opener: presentation.opener,
        previous: document.activeElement,
      };
      setPresentation(null);
    }
  }, [active, presentation]);
  const restoreFocus = () => {
    const pending = pendingFocus.current;
    if (!pending || !lifetime.current || committed.current) {
      return;
    }
    if (
      document.activeElement !== pending.previous &&
      document.activeElement !== document.body
    ) {
      pendingFocus.current = null;
      return;
    }
    const entry = [
      ...document.querySelectorAll<HTMLElement>("[data-console-dock-entry]"),
    ].find((element) => element.dataset.consoleDockEntry === pending.itemId);
    const preferred = [pending.opener, entry].find(
      (element) => element?.isConnected && !element.matches(":disabled")
    );
    // A retained navigation pane may still be inert while its geometry returns.
    // Its readiness callback, not a fallback focus, finishes restoration.
    if (preferred?.closest("[inert]")) {
      return;
    }
    const target = [
      pending.opener,
      entry,
      document.querySelector<HTMLElement>(
        '[data-dashboard-control="dock-item"][aria-current="page"]'
      ),
      document.querySelector<HTMLElement>(
        'button[aria-label="Console navigation"]'
      ),
      document.querySelector<HTMLElement>(
        '[data-dashboard-control="dock-item"]'
      ),
      document.querySelector<HTMLElement>("main[tabindex='-1']"),
    ].find(
      (element) =>
        element?.isConnected &&
        !element.closest('[inert], [aria-hidden="true"]') &&
        !element.matches(":disabled") &&
        element.getClientRects().length > 0
    );
    if (target) {
      target.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  };
  const close = (expected: Presentation) => {
    if (committed.current !== expected) {
      return;
    }
    pendingFocus.current = {
      itemId: expected.item.id,
      opener: expected.opener,
      previous: document.activeElement,
    };
    setPresentation(null);
  };
  useLayoutEffect(() => {
    if (!active) {
      restoreFocus();
    }
  });
  return (
    <ConsoleDockProjectionProvider>
      {children({
        active: !!active,
        restoreFocus,
        entries: items.map((item) => ({
          id: item.id,
          label: item.definition.label,
          icon: item.definition.icon,
          disabled: active?.item.id === item.id || blocked,
          onInvoke: (instant) => {
            if (blocked || committed.current?.item.id === item.id) {
              return;
            }
            const next: Presentation = {
              token: {},
              item,
              pathname,
              scopeKey,
              instant,
              expanded: false,
              opener:
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null,
            };
            const open = () => {
              const { current } = admission;
              if (
                !lifetime.current ||
                current.blocked ||
                current.pathname !== next.pathname ||
                current.scopeKey !== next.scopeKey ||
                !current.items.some((candidate) =>
                  sameViewIdentity(candidate, next.item)
                )
              ) {
                return;
              }
              setVisited((previous) => new Set([...previous, item.id]));
              pendingFocus.current = null;
              setPresentation(next);
            };
            if (committed.current) {
              exitRequest.current?.("navigation", open);
            } else {
              open();
            }
          },
        })),
      })}
      {items
        .filter((item) => visited.has(item.id))
        .map((item) => (
          <DockViewOwner
            key={JSON.stringify([scopeKey, item.id])}
            item={item}
            position={position}
            presentation={active?.item.id === item.id ? active : null}
            onChange={(expected, expanded) => {
              if (committed.current === expected) {
                setPresentation({ ...expected, expanded });
              }
            }}
            onExit={close}
            exitRequest={exitRequest}
          />
        ))}
    </ConsoleDockProjectionProvider>
  );
}

function DockViewOwner({
  item,
  position,
  presentation,
  onChange,
  onExit,
  exitRequest,
}: {
  item: ConsoleDockViewItem;
  position: ConsolePosition;
  presentation: Presentation | null;
  onChange(expected: Presentation, expanded: boolean): void;
  onExit(expected: Presentation): void;
  exitRequest: RefObject<ExitRequest | null>;
}) {
  const identity = useMemo(
    () => ({
      bindingDefinition: item.binding.definition,
      services: item.binding.services,
      view: item.definition,
    }),
    [item.binding.definition, item.binding.services, item.definition]
  );
  const [failedIdentity, setFailedIdentity] = useState<object | null>(null);
  const failed = failedIdentity === identity;
  const leaseIdentity = useMemo(
    () => ({ identity, failed }),
    [identity, failed]
  );
  const { activation, signal } = useConsoleActivation(leaseIdentity);
  const committed = useRef({ presentation, onChange, onExit });
  const registration = useRef<ContentRegistration | null>(null);
  const exitSequence = useRef(0);
  useInsertionEffect(() => {
    committed.current = { presentation, onChange, onExit };
  });
  useInsertionEffect(() => {
    exitSequence.current += 1;
  }, [presentation, activation]);
  const controller = useMemo<
    Omit<ConsoleDockController, "state"> & { requestExit: ExitRequest }
  >(
    () => ({
      expand() {
        const { current } = committed;
        if (
          !activation.isCurrent() ||
          !current.presentation ||
          current.presentation.expanded ||
          !registration.current?.hasTray
        ) {
          return false;
        }
        current.onChange(current.presentation, true);
        return true;
      },
      collapse() {
        const { current } = committed;
        if (!activation.isCurrent() || !current.presentation?.expanded) {
          return false;
        }
        // An explicit collapse returns to the editable bar even when the click
        // moved focus from the tray onto the Shell's collapse control first.
        registration.current?.focusBar();
        current.onChange(current.presentation, false);
        return true;
      },
      requestExit(reason: ConsoleDockExitReason, afterExit?: () => void) {
        const { current } = committed;
        if (!activation.isCurrent() || !current.presentation) {
          return;
        }
        exitSequence.current += 1;
        const sequence = exitSequence.current;
        const finish = (allowed: boolean) => {
          if (
            allowed &&
            activation.isCurrent() &&
            sequence === exitSequence.current &&
            committed.current.presentation === current.presentation
          ) {
            if (afterExit) {
              afterExit();
            } else {
              committed.current.onExit(current.presentation!);
            }
          }
        };
        try {
          const result = registration.current?.beforeExit?.(reason) ?? true;
          if (typeof result === "boolean") {
            finish(result);
          } else {
            const resolve = async () => {
              try {
                finish(await result);
              } catch {
                // Rejected guards leave presentation unchanged.
              }
            };
            void resolve();
          }
        } catch {
          // A failed business guard must leave its view available.
        }
      },
    }),
    [activation]
  );
  useInsertionEffect(() => {
    if (!presentation) {
      return;
    }
    exitRequest.current = controller.requestExit;
    return () => {
      if (exitRequest.current === controller.requestExit) {
        exitRequest.current = null;
      }
    };
  }, [controller, exitRequest, presentation]);
  const dock = useMemo<ConsoleDockController>(
    () => ({
      state: (signal.aborted || !presentation
        ? "inactive"
        : presentation.expanded
          ? "tray"
          : "bar") satisfies ConsoleDockViewState,
      expand: controller.expand,
      collapse: controller.collapse,
      requestExit: controller.requestExit,
    }),
    [presentation, controller, signal]
  );
  const context = useMemo<ViewContext>(
    () => ({
      dock,
      label: item.definition.label,
      position,
      presentation,
      registration,
    }),
    [dock, item.definition.label, position, presentation]
  );
  const View = item.definition.component;
  return (
    <DockViewContext.Provider value={context}>
      <DockViewBoundary
        key={activation.key}
        onFailure={() => setFailedIdentity(identity)}
      >
        {failed ? (
          <UnavailableDockView />
        ) : (
          <View
            services={item.binding.services}
            activation={activation}
            signal={signal}
            dock={dock}
          />
        )}
      </DockViewBoundary>
    </DockViewContext.Provider>
  );
}

const styles = stylex.create({
  surface: {
    position: "relative",
    width: "min(640px, calc(100vw - 40px))",
    maxWidth:
      "calc(100vw - max(20px, env(safe-area-inset-left)) - max(20px, env(safe-area-inset-right)))",
    color: "var(--foreground)",
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 8,
    boxSizing: "border-box",
  },
  bottom: {
    flexDirection: "column-reverse",
  },
  top: { flexDirection: "column" },
  left: {
    flexDirection: "column-reverse",
  },
  right: {
    flexDirection: "column-reverse",
  },
  hidden: { display: "none" },
  collapsedTray: { position: "absolute", bottom: "100%", left: 8, right: 8 },
  collapsedTopTray: { bottom: "auto", top: "100%" },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  composer: { minWidth: 0, flexGrow: 1 },
  tray: {
    minWidth: 0,
    maxHeight: "min(480px, calc(100dvh - 168px))",
    overflowY: "auto",
    overflowX: "hidden",
    padding: 8,
    overflowWrap: "anywhere",
  },
});

/** Portals preserve the plugin's providers; bar and tray retain their single React owner. */
export function ConsoleDockContent({
  bar,
  tray,
  initialFocus,
  beforeExit,
}: ConsoleDockContentProps) {
  const context = useContext(DockViewContext);
  if (!context) {
    throw new Error("ConsoleDockContent requires a Console Dock view.");
  }
  const { dock, label, position, presentation, registration } = context;
  const projection = useDockProjection();
  const reduced = useReducedMotion();
  const [keyboardInstant, setKeyboardInstant] = useState(false);
  const [readyFor, setReadyFor] = useState<object | null>(null);
  const [geometryReadyFor, setGeometryReadyFor] = useState<object | null>(null);
  const instant =
    !!reduced ||
    keyboardInstant ||
    (!!presentation?.instant && readyFor !== presentation.token);
  const active = !!presentation;
  const ready = active && (instant || readyFor === presentation?.token);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const focusPending = useRef(false);
  const pointerStarted = useRef(false);
  const previousActive = useRef(false);
  const setProjection = projection?.setActive;
  const setInstant = projection?.setInstant;
  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!active || !element || !setProjection || !presentation) {
      return;
    }
    const contribution = {
      element,
      token: presentation.token,
      expanded: presentation.expanded,
      instant,
      onReady: () => {
        setReadyFor(presentation.token);
        setGeometryReadyFor(presentation);
      },
    };
    setInstant?.(instant);
    setProjection(contribution);
    return () => {
      setProjection((current) => (current === contribution ? null : current));
    };
  }, [
    active,
    presentation,
    instant,
    setProjection,
    setInstant,
    projection?.target,
  ]);
  useInsertionEffect(() => {
    registration.current = {
      initialFocus,
      beforeExit,
      hasTray: !!tray,
      trayElement: trayRef.current,
      focusBar: () => {
        (
          initialFocus.current ??
          surfaceRef.current?.querySelector<HTMLElement>("button")
        )?.focus({ preventScroll: true });
      },
    };
    return () => {
      registration.current = null;
    };
  }, [registration, initialFocus, beforeExit, tray]);
  useLayoutEffect(() => {
    if (registration.current) {
      registration.current.trayElement = trayRef.current;
    }
    if (active && !previousActive.current) {
      focusPending.current = true;
    }
    if (!active) {
      focusPending.current = false;
      setReadyFor(null);
      setGeometryReadyFor(null);
      setKeyboardInstant(false);
    }
    previousActive.current = active;
    if (ready && focusPending.current) {
      focusPending.current = false;
      if (
        document.activeElement === presentation?.opener ||
        document.activeElement === document.body ||
        surfaceRef.current?.contains(document.activeElement)
      ) {
        (
          initialFocus.current ??
          surfaceRef.current?.querySelector<HTMLElement>("button")
        )?.focus({ preventScroll: true });
      }
    }
  }, [active, ready, initialFocus, presentation, registration]);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const cancelFocus = (event: Event) => {
      if (
        event.target instanceof Node &&
        !surfaceRef.current?.contains(event.target) &&
        event.target !== presentation?.opener
      ) {
        focusPending.current = false;
      }
    };
    document.addEventListener("pointerdown", cancelFocus, true);
    document.addEventListener("focusin", cancelFocus);
    return () => {
      document.removeEventListener("pointerdown", cancelFocus, true);
      document.removeEventListener("focusin", cancelFocus);
    };
  }, [active, presentation?.opener]);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const surface = surfaceRef.current;
    const root = surface?.closest<HTMLElement>(".console-layout");
    const clearance =
      position === "top"
        ? "--console-dock-top-clearance"
        : "--console-dock-bottom-clearance";
    const update = () => {
      if (!surface || !root) {
        return;
      }
      const rect = surface.getBoundingClientRect();
      const size =
        position === "top"
          ? rect.bottom + 16
          : window.innerHeight - rect.top + 16;
      root.style.setProperty(clearance, `${size}px`);
    };
    const observer = new ResizeObserver(update);
    if (surface) {
      observer.observe(surface);
    }
    update();
    return () => {
      observer.disconnect();
      root?.style.removeProperty(clearance);
    };
  }, [active, position]);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const viewport = window.visualViewport;
    const surface = surfaceRef.current;
    const trayElement = trayRef.current;
    const update = () => {
      if (!surfaceRef.current || !viewport) {
        return;
      }
      surfaceRef.current.style.maxHeight = `${Math.max(0, viewport.height - 100)}px`;
      if (trayRef.current) {
        trayRef.current.style.maxHeight = `${Math.max(0, viewport.height - 168)}px`;
      }
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      surface?.style.removeProperty("bottom");
      surface?.style.removeProperty("top");
      surface?.style.removeProperty("max-height");
      trayElement?.style.removeProperty("max-height");
    };
  }, [active, position]);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing
      ) {
        return;
      }
      // Lenso's document-level overlay listeners consume Escape before it reaches window.
      event.preventDefault();
      setKeyboardInstant(true);
      setInstant?.(true);
      if (dock.state === "tray") {
        dock.collapse();
      } else {
        dock.requestExit("escape");
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [active, dock, setInstant]);
  if (!projection?.target) {
    return null;
  }
  return createPortal(
    <motion.div
      ref={surfaceRef}
      {...stylex.props(
        styles.surface,
        styles[position],
        !active && styles.hidden
      )}
      data-console-dock-view={
        active ? (presentation.expanded ? "tray" : "bar") : "inactive"
      }
      inert={!ready}
      aria-hidden={!active || undefined}
      initial={instant ? false : { opacity: 0 }}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{
        duration: instant ? 0 : 0.13,
        delay: instant ? 0 : 0.08,
        ease: [0.23, 1, 0.32, 1],
      }}
      onPointerDownCapture={() => {
        setKeyboardInstant(false);
        setInstant?.(false);
        pointerStarted.current = ready;
      }}
      onKeyDownCapture={() => {
        setKeyboardInstant(true);
        setInstant?.(true);
      }}
      onClickCapture={(event) => {
        if (event.detail > 0 && !pointerStarted.current) {
          event.preventDefault();
          event.stopPropagation();
        }
        pointerStarted.current = false;
      }}
    >
      <section {...stylex.props(styles.bar)} aria-label={label}>
        <ConsoleIconButton
          label="Back to navigation"
          onClick={() => dock.requestExit("back-button")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </ConsoleIconButton>
        <div {...stylex.props(styles.composer)}>{bar}</div>
        <ConsoleIconButton
          label={`${presentation?.expanded ? "Collapse" : "Expand"} ${label}`}
          aria-expanded={!!presentation?.expanded}
          disabled={!tray}
          onClick={() => {
            if (presentation?.expanded) {
              dock.collapse();
            } else {
              dock.expand();
            }
          }}
        >
          {presentation?.expanded ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronUp size={16} aria-hidden="true" />
          )}
        </ConsoleIconButton>
      </section>
      <motion.section
        ref={trayRef}
        {...stylex.props(
          styles.tray,
          !presentation?.expanded && styles.collapsedTray,
          !presentation?.expanded &&
            position === "top" &&
            styles.collapsedTopTray
        )}
        initial={false}
        animate={{ opacity: presentation?.expanded ? 1 : 0 }}
        transition={{ duration: instant ? 0 : 0.1 }}
        inert={
          !presentation?.expanded ||
          (!instant && geometryReadyFor !== presentation)
        }
        aria-label={tray?.label}
        aria-hidden={!presentation?.expanded || undefined}
      >
        {tray?.content}
      </motion.section>
    </motion.div>,
    projection.target
  );
}
