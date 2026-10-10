import type { ButtonRootProps } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { Ellipsis, X } from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useIsPresent,
  useMotionValue,
  usePresenceData,
  type Transition,
} from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from "react";

import { useDockProjection } from "./console-dock-projection";
import { DockShape } from "./console-dock-shape";
import { dockStyles } from "./console-dock.styles";
import { ConsoleIconButton } from "./console-icon-button";

export type Position = "bottom" | "top" | "left" | "right";

export type ConsoleDockSelection = {
  /** Set by the scope host so pointer retirement also covers scope-to-scope swaps. */
  activationKey?: string;
  count: number;
  scopeLabel: string;
  actions: readonly {
    id: string;
    label: string;
    tooltip?: string;
    icon: ReactNode;
    variant?: ButtonRootProps["variant"];
    onInvoke: () => void;
  }[];
  running: boolean;
  /** Confirmation or other page-owned work that must not permit switching views. */
  blocked?: boolean;
  onExit: () => void;
};

export type ConsoleDockProps = {
  visible: boolean;
  /** Keep rich-content owners mounted when navigation is presented in the sidebar. */
  navigationVisible?: boolean;
  position: Position;
  compact: boolean;
  activeId: string;
  items: readonly { id: string; label: string; icon: ReactNode }[];
  leading?: readonly {
    id: string;
    label: string;
    icon: ReactNode;
    onInvoke: (instant: boolean) => void;
  }[];
  overflow?: { label: string; onInvoke: () => void; icon?: ReactNode };
  selection: ConsoleDockSelection | null;
  running: boolean;
  instant?: boolean;
  dockRef: RefObject<HTMLDivElement | null>;
  onNavigate: (id: string) => void;
  onExpand: () => void;
  onFocusDock: () => void;
  onNavigationReady?: () => void;
};

const geometryTransition: Transition = {
  type: "tween",
  duration: 0.14,
  ease: [0.77, 0, 0.175, 1],
};

const paneEase = [0.23, 1, 0.32, 1] as const;
const noLeadingEntries: NonNullable<ConsoleDockProps["leading"]> = [];

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function DockPane({
  children,
  instant,
  kind,
  position,
}: PropsWithChildren<{
  instant: boolean;
  kind: "navigation" | "compact" | "selection";
  position: Position;
}>) {
  const present = useIsPresent();
  const immediateExit = Boolean(usePresenceData());
  const opacity = useMotionValue(instant ? 1 : 0);
  const filter = useMotionValue("blur(0px)");
  const [ready, setReady] = useState(instant);
  const paneRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!present) {
      setReady(false);
    } else if (instant) {
      opacity.jump(1);
      filter.jump("blur(0px)");
      setReady(true);
    }
    if (!present && immediateExit) {
      opacity.jump(0);
      filter.jump("blur(0px)");
    }
    if (!present && paneRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement)?.blur();
    }
  }, [present, instant, immediateExit, opacity, filter]);

  const paneStyle = stylex.props(
    dockStyles.pane,
    !present && dockStyles.exitingPane,
    !present && kind === "selection" && dockStyles.exitingSelectionPane,
    !present &&
      kind === "selection" &&
      (position === "left" || position === "right") &&
      dockStyles.exitingSideSelectionPane,
    !(instant || ready) && dockStyles.unavailablePane
  );

  return (
    <motion.div
      ref={paneRef}
      className={`dashboard-dock-pane ${paneStyle.className}`}
      data-present={present}
      data-ready={instant || ready}
      data-kind={kind}
      inert={!present || (!instant && !ready)}
      aria-hidden={!present || undefined}
      style={{ ...paneStyle.style, opacity, filter }}
      initial={instant ? false : { opacity: 0, filter: "blur(0px)" }}
      animate="visible"
      exit="exit"
      variants={{
        visible: {
          opacity: 1,
          filter: "blur(0px)",
          transition: {
            duration: instant ? 0 : 0.13,
            delay: instant ? 0 : 0.04,
            ease: paneEase,
          },
        },
        exit: {
          opacity: 0,
          filter: immediateExit ? "blur(0px)" : "blur(2px)",
          transition: { duration: immediateExit ? 0 : 0.08, ease: paneEase },
        },
      }}
      onAnimationComplete={(definition) => {
        if (definition === "visible" && present && opacity.get() === 1) {
          setReady(true);
        }
      }}
    >
      {children}
    </motion.div>
  );
}

function DockSurface({
  position,
  compact,
  activeId,
  items,
  leading = noLeadingEntries,
  overflow,
  selection,
  running,
  instant: keyboardInstant = false,
  dockRef,
  onNavigate,
  onExpand,
  onFocusDock,
  onNavigationReady,
  navigationVisible = true,
}: Omit<ConsoleDockProps, "visible">) {
  const present = useIsPresent();
  const projection = useDockProjection();
  const rich = projection?.active;
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false
  );
  const pointerIntent = useRef(true);
  const focusAfterExpand = useRef(false);
  const navigationPointerStarted = useRef(false);
  const [navigationReady, setNavigationReady] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [capacity, setCapacity] = useState(5);
  const groupId = useId();
  const instant = !!reduced || keyboardInstant || !pointerIntent.current;
  const paneInstant = instant || !mounted;
  const pinCapacity = Math.max(
    0,
    capacity - leading.length - (overflow ? 1 : 0)
  );
  const separatorCount =
    (leading.length > 0 && (items.length > 0 || overflow) ? 1 : 0) +
    (items.length > 0 && overflow ? 1 : 0);
  const dockModules = items.slice(0, pinCapacity);
  const activeModule = items.find((module) => module.id === activeId);

  useLayoutEffect(() => {
    const element = dockRef.current;
    const notify = () => {
      if (!rich && element?.dataset.geometryReady === "true") {
        setNavigationReady(true);
      }
    };
    if (rich) {
      setNavigationReady(false);
      navigationPointerStarted.current = false;
    }
    element?.addEventListener("console-dock-ready", notify);
    notify();
    return () => element?.removeEventListener("console-dock-ready", notify);
  }, [dockRef, rich]);
  useLayoutEffect(() => {
    if (!rich && navigationReady) {
      onNavigationReady?.();
    }
  }, [rich, navigationReady, onNavigationReady]);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const updateCapacity = () => {
      const size = coarse.matches ? 44 : 36;
      const vertical =
        (position === "left" || position === "right") &&
        window.innerHeight > 360;
      const available = vertical
        ? window.innerHeight - 176
        : window.innerWidth - 40;
      setCapacity(
        Math.max(
          2,
          Math.min(
            5,
            Math.floor((available - 16 - separatorCount * 11 + 4) / (size + 4))
          )
        )
      );
    };
    updateCapacity();
    window.addEventListener("resize", updateCapacity);
    coarse.addEventListener("change", updateCapacity);
    return () => {
      window.removeEventListener("resize", updateCapacity);
      coarse.removeEventListener("change", updateCapacity);
    };
  }, [position, separatorCount]);
  const side =
    position === "top"
      ? "bottom"
      : position === "left"
        ? "right"
        : position === "right"
          ? "left"
          : "top";

  useLayoutEffect(() => {
    if (present && !compact && !selection && focusAfterExpand.current) {
      focusAfterExpand.current = false;
      const navigation = dockRef.current;
      (
        navigation?.querySelector<HTMLButtonElement>(
          '[data-dashboard-control="dock-item"][aria-current="page"]'
        ) ??
        navigation?.querySelector<HTMLButtonElement>(
          '[data-dashboard-control="dock-item"]'
        )
      )?.focus();
    }
  }, [compact, selection, present, dockRef]);

  const selectionStyle = stylex.props(
    dockStyles.row,
    dockStyles.selection,
    (position === "left" || position === "right") && dockStyles.sideSelection
  );
  const countStyle = stylex.props(
    dockStyles.count,
    (position === "left" || position === "right") && dockStyles.sideCount
  );
  const navigationStyle = stylex.props(
    dockStyles.row,
    dockStyles.group,
    leading.length > 0 && dockStyles.extensionNavigation,
    (position === "left" || position === "right") && dockStyles.sideNavigation
  );
  const divider = (
    <span
      aria-hidden="true"
      {...stylex.props(
        dockStyles.divider,
        (position === "left" || position === "right") && dockStyles.sideDivider
      )}
    />
  );
  const leadingControls = leading.length > 0 && (
    <fieldset aria-label="Dock views" {...navigationStyle}>
      {leading.map((entry) => (
        <ConsoleIconButton
          key={entry.id}
          xstyle={dockStyles.control}
          glyphXstyle={dockStyles.glyph}
          label={entry.label}
          data-console-dock-entry={entry.id}
          side={side}
          variant="ghost"
          disabled={running || !!selection?.blocked}
          onClick={(event) => entry.onInvoke(event.detail === 0)}
        >
          {entry.icon}
        </ConsoleIconButton>
      ))}
    </fieldset>
  );

  return (
    <div
      style={stylex.props(dockStyles.anchor).style}
      className={`dashboard-dock-anchor ${stylex.props(dockStyles.anchor).className}`}
      data-position={position}
      inert={!present}
      aria-hidden={!present || undefined}
      onPointerDownCapture={() => {
        pointerIntent.current = true;
      }}
      onKeyDownCapture={() => {
        pointerIntent.current = false;
      }}
    >
      <MotionConfig reducedMotion="user">
        <LayoutGroup id={groupId}>
          <DockShape
            position={position}
            instant={rich?.instant ?? (instant || !!projection?.instant)}
            present={present}
            visible={navigationVisible || !!rich}
            compact={compact && !selection}
            selection={!!selection}
            dockRef={dockRef}
            onFocusDock={onFocusDock}
          >
            <div
              {...stylex.props(
                dockStyles.navigationOwner,
                rich && dockStyles.retainedNavigation
              )}
              inert={!!rich || !navigationReady}
              aria-hidden={!!rich || undefined}
              onPointerDownCapture={() => {
                navigationPointerStarted.current = !rich && navigationReady;
              }}
              onClickCapture={(event) => {
                if (event.detail > 0 && !navigationPointerStarted.current) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                navigationPointerStarted.current = false;
              }}
            >
              <AnimatePresence initial={false} mode="sync" custom={paneInstant}>
                {selection ? (
                  <DockPane
                    key={selection.activationKey ?? "selection"}
                    kind="selection"
                    instant={paneInstant}
                    position={position}
                  >
                    <div
                      {...selectionStyle}
                      className={`dashboard-dock-selection ${selectionStyle.className}`}
                      role="toolbar"
                      aria-label={`${selection.scopeLabel} selection actions`}
                      aria-busy={selection.running}
                    >
                      {leadingControls}
                      {leading.length > 0 && divider}
                      <span
                        {...countStyle}
                        className={`dashboard-dock-count ${countStyle.className}`}
                      >
                        {selection.scopeLabel} · {selection.count} selected
                      </span>
                      {selection.actions.map((action) => (
                        <ConsoleIconButton
                          key={action.id}
                          xstyle={dockStyles.control}
                          glyphXstyle={dockStyles.glyph}
                          label={action.label}
                          tooltip={action.tooltip ?? action.label}
                          side={side}
                          variant={action.variant ?? "ghost"}
                          disabled={selection.running}
                          onClick={() => action.onInvoke()}
                        >
                          {action.icon}
                        </ConsoleIconButton>
                      ))}
                      <ConsoleIconButton
                        xstyle={dockStyles.control}
                        glyphXstyle={dockStyles.glyph}
                        label="Exit selection"
                        side={side}
                        variant="ghost"
                        disabled={selection.running}
                        onClick={() => selection.onExit()}
                      >
                        <X
                          {...stylex.props(dockStyles.icon)}
                          size={16}
                          aria-hidden="true"
                        />
                      </ConsoleIconButton>
                    </div>
                  </DockPane>
                ) : compact ? (
                  <DockPane
                    key="compact"
                    kind="compact"
                    instant={paneInstant}
                    position={position}
                  >
                    <ConsoleIconButton
                      xstyle={dockStyles.control}
                      glyphXstyle={dockStyles.glyph}
                      variant="ghost"
                      side={side}
                      data-dashboard-control="compact-handle"
                      label={
                        activeModule
                          ? `Expand navigation, current: ${activeModule.label}`
                          : "Expand navigation"
                      }
                      onClick={(event) => {
                        pointerIntent.current = event.detail > 0;
                        focusAfterExpand.current = event.detail === 0;
                        onExpand();
                      }}
                    >
                      {activeModule?.icon ?? (
                        <Ellipsis size={16} aria-hidden="true" />
                      )}
                    </ConsoleIconButton>
                  </DockPane>
                ) : (
                  <DockPane
                    key="navigation"
                    kind="navigation"
                    instant={paneInstant}
                    position={position}
                  >
                    <nav
                      {...navigationStyle}
                      className={`dashboard-dock-nav ${navigationStyle.className}`}
                      aria-label="Pinned navigation"
                    >
                      {leadingControls}
                      {leading.length > 0 &&
                        (dockModules.length > 0 || !!overflow) &&
                        divider}
                      {dockModules.length > 0 && (
                        <fieldset
                          aria-label="Pinned destinations"
                          {...navigationStyle}
                        >
                          {dockModules.map((module) => {
                            const active = activeId === module.id;
                            return (
                              <motion.div
                                key={module.id}
                                {...stylex.props(dockStyles.slot)}
                                className={`dashboard-dock-slot ${stylex.props(dockStyles.slot).className}`}
                              >
                                {active && (
                                  <motion.div
                                    {...stylex.props(dockStyles.indicator)}
                                    className={`dashboard-active-indicator ${stylex.props(dockStyles.indicator).className}`}
                                    layoutId="active-item"
                                    aria-hidden="true"
                                    transition={
                                      instant
                                        ? { duration: 0 }
                                        : geometryTransition
                                    }
                                  />
                                )}
                                <ConsoleIconButton
                                  xstyle={[
                                    dockStyles.control,
                                    dockStyles.slottedControl,
                                    active && dockStyles.currentControl,
                                  ]}
                                  glyphXstyle={dockStyles.glyph}
                                  label={module.label}
                                  side={side}
                                  variant="ghost"
                                  data-dashboard-control="dock-item"
                                  aria-current={active ? "page" : undefined}
                                  disabled={running}
                                  onClick={(event) => {
                                    pointerIntent.current = event.detail > 0;
                                    onNavigate(module.id);
                                  }}
                                >
                                  {module.icon}
                                </ConsoleIconButton>
                              </motion.div>
                            );
                          })}
                        </fieldset>
                      )}
                      {dockModules.length > 0 && overflow && divider}
                      {overflow && (
                        <fieldset
                          {...stylex.props(dockStyles.group)}
                          aria-label="Dock directory"
                        >
                          <ConsoleIconButton
                            xstyle={dockStyles.control}
                            glyphXstyle={dockStyles.glyph}
                            label={overflow.label}
                            side={side}
                            variant="ghost"
                            data-dashboard-control="dock-item"
                            disabled={running}
                            onClick={(event) => {
                              pointerIntent.current = event.detail > 0;
                              overflow.onInvoke();
                            }}
                          >
                            {overflow.icon ?? (
                              <Ellipsis
                                {...stylex.props(dockStyles.icon)}
                                size={16}
                                aria-hidden="true"
                              />
                            )}
                          </ConsoleIconButton>
                        </fieldset>
                      )}
                    </nav>
                  </DockPane>
                )}
              </AnimatePresence>
            </div>
          </DockShape>
        </LayoutGroup>
      </MotionConfig>
    </div>
  );
}

export function ConsoleDock({ visible, ...props }: ConsoleDockProps) {
  return (
    <AnimatePresence initial={false}>
      {visible && <DockSurface key="dock" {...props} />}
    </AnimatePresence>
  );
}
