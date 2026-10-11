import type { ButtonRootProps } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight, Ellipsis, X } from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useMotionValueEvent,
  usePresence,
  usePresenceData,
  useTransform,
  type MotionValue,
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

import {
  useConsoleLongPress,
  useConsolePresetKeys,
} from "./console-dock-interactions";
import { useDockProjection } from "./console-dock-projection";
import { DockShape } from "./console-dock-shape";
import { SharedDockShape } from "./console-dock-shared-shape";
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
  blocked?: boolean;
  onExit: () => void;
};

export type ConsoleDockProps = {
  visible: boolean;
  navigationVisible?: boolean;
  position: Position;
  compact: boolean;
  activeId: string;
  items: readonly {
    id: string;
    label: string;
    tooltip?: string;
    icon: ReactNode;
  }[];
  leading?: readonly {
    id: string;
    label: string;
    icon: ReactNode;
    disabled?: boolean;
    onInvoke: (instant: boolean) => void;
  }[];
  onNavigationReady?: () => void;
  overflow?: {
    label: string;
    onInvoke: () => void;
    icon?: ReactNode;
    expanded?: boolean;
    controls?: string;
  };
  selection: ConsoleDockSelection | null;
  running: boolean;
  instant?: boolean;
  dockRef: RefObject<HTMLDivElement | null>;
  onNavigate: (id: string) => void;
  onExpand: () => void;
  onFocusDock: () => void;
  /** An expanded local surface, presented in place of the bar, not beside it. */
  directory?: ReactNode;
  presets?: {
    names: readonly string[];
    activeIndex: number;
    onSelect: (index: number, keyboard?: boolean) => void;
  };
  onEdit?: () => void;
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
  progress,
}: PropsWithChildren<{
  instant: boolean;
  kind: "navigation" | "compact" | "selection";
  position: Position;
  progress: MotionValue<number>;
}>) {
  const [present, safeToRemove] = usePresence();
  const immediateExit = Boolean(usePresenceData());
  const opacity = useMotionValue(instant ? 1 : 0);
  const filter = useMotionValue("blur(0px)");
  const [ready, setReady] = useState(instant);
  const paneRef = useRef<HTMLDivElement>(null);
  const presentation = useTransform([opacity, progress], ([fade, surface]) => {
    const reveal = Math.max(0, (Number(fade) - 0.6) / 0.4);
    return present && !instant ? reveal * Number(surface) : Number(fade);
  });
  useMotionValueEvent(progress, "change", (value) => {
    setReady(present && value === 1 && opacity.get() === 1);
  });
  useMotionValueEvent(opacity, "change", (value) => {
    setReady(present && value === 1 && progress.get() === 1);
  });

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
    const controller = animate(opacity, present ? 1 : 0, {
      duration: (present ? instant : immediateExit) ? 0 : present ? 0.21 : 0.08,
      ease: present ? [0.77, 0, 0.175, 1] : paneEase,
      onComplete: () => {
        if (present) {
          setReady(progress.get() === 1);
        } else {
          safeToRemove?.();
        }
      },
    });
    const blur = animate(
      filter,
      present || immediateExit ? "blur(0px)" : "blur(2px)",
      { duration: immediateExit ? 0 : 0.08 }
    );
    return () => {
      controller.stop();
      blur.stop();
    };
  }, [
    present,
    instant,
    immediateExit,
    opacity,
    filter,
    progress,
    safeToRemove,
  ]);

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
      style={{ ...paneStyle.style, opacity: presentation, filter }}
    >
      {children}
    </motion.div>
  );
}

function DockOverflow({
  overflow,
  divided,
  position,
  side,
  running,
  onInvoke,
}: {
  overflow: NonNullable<ConsoleDockProps["overflow"]>;
  divided: boolean;
  position: Position;
  side: "top" | "bottom" | "left" | "right";
  running: boolean;
  onInvoke: (pointer: boolean) => void;
}) {
  return (
    <>
      {divided && (
        <span
          {...stylex.props(
            dockStyles.divider,
            (position === "left" || position === "right") &&
              dockStyles.sideDivider
          )}
          data-dashboard-control="dock-divider"
          aria-hidden="true"
        />
      )}
      <ConsoleIconButton
        xstyle={dockStyles.control}
        glyphXstyle={dockStyles.glyph}
        label={overflow.label}
        side={side}
        variant="ghost"
        data-dashboard-control="dock-item"
        aria-haspopup={overflow.expanded === undefined ? undefined : "dialog"}
        aria-expanded={overflow.expanded}
        aria-controls={overflow.controls}
        disabled={running}
        onClick={(event) => onInvoke(event.detail > 0)}
      >
        {overflow.icon ?? (
          <Ellipsis
            {...stylex.props(dockStyles.icon)}
            size={16}
            aria-hidden="true"
          />
        )}
      </ConsoleIconButton>
    </>
  );
}

function DirectoryPane({
  children,
  instant,
}: PropsWithChildren<{ instant: boolean }>) {
  const present = useIsPresent();
  return (
    <motion.div
      {...stylex.props(!present && dockStyles.exitingPane)}
      inert={!present}
      aria-hidden={!present || undefined}
      initial={false}
      exit={{ opacity: 0, transition: { duration: instant ? 0 : 0.08 } }}
    >
      {children}
    </motion.div>
  );
}

function DockDestinations({
  items,
  activeId,
  side,
  running,
  instant,
  pointerIntent,
  onNavigate,
  onEdit,
}: Pick<
  ConsoleDockProps,
  "items" | "activeId" | "running" | "onNavigate" | "onEdit"
> & {
  side: Position;
  instant: boolean;
  pointerIntent: RefObject<boolean>;
}) {
  const longPress = useConsoleLongPress(running ? undefined : onEdit);
  return items.map((module) => {
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
            transition={instant ? { duration: 0 } : geometryTransition}
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
          tooltip={module.tooltip ?? module.label}
          side={side}
          variant="ghost"
          data-dashboard-control="dock-item"
          aria-current={active ? "page" : undefined}
          disabled={running}
          {...longPress}
          onClick={(event) => {
            pointerIntent.current = event.detail > 0;
            onNavigate(module.id);
          }}
        >
          {module.icon}
        </ConsoleIconButton>
      </motion.div>
    );
  });
}

function DockPresetChevron({
  presets,
  direction,
  side,
}: {
  presets: NonNullable<ConsoleDockProps["presets"]>;
  direction: -1 | 1;
  side: Position;
}) {
  return (
    <ConsoleIconButton
      xstyle={dockStyles.control}
      label={`${direction === -1 ? "Previous" : "Next"} Dock preset, current: ${presets.names[presets.activeIndex]}`}
      side={side}
      variant="ghost"
      onClick={(event) =>
        presets.onSelect(
          (presets.activeIndex + direction + presets.names.length) %
            presets.names.length,
          event.detail === 0
        )
      }
    >
      {direction === -1 ? (
        <ChevronLeft size={16} aria-hidden="true" />
      ) : (
        <ChevronRight size={16} aria-hidden="true" />
      )}
    </ConsoleIconButton>
  );
}

function DockSurface({
  position,
  compact,
  activeId,
  items,
  leading = noLeadingEntries,
  navigationVisible = true,
  onNavigationReady,
  overflow,
  selection,
  running,
  instant: keyboardInstant = false,
  dockRef,
  onNavigate,
  onExpand,
  onFocusDock,
  directory,
  presets,
  onEdit,
  presetSwitching = false,
}: Omit<ConsoleDockProps, "visible"> & { presetSwitching?: boolean }) {
  const present = useIsPresent();
  const projection = useDockProjection();
  const rich = projection?.active;
  const richActive = !!rich;
  const anchorRef = useRef<HTMLDivElement>(null);
  const navigationPointerStarted = useRef(false);
  const [navigationReady, setNavigationReady] = useState(true);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false
  );
  const pointerIntent = useRef(true);
  const [keyboardInput, setKeyboardInput] = useState(false);
  const surfaceProgress = useMotionValue(1);
  const focusAfterExpand = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [capacity, setCapacity] = useState(5);
  const held = presetSwitching && !selection && !running && !directory;
  const groupId = useId();
  const instant =
    !!reduced ||
    keyboardInstant ||
    keyboardInput ||
    !pointerIntent.current ||
    !!rich?.instant ||
    !!projection?.instant;
  const paneInstant = instant || !mounted;
  const hasOverflow = !!overflow;
  const dockModules = items.slice(
    0,
    Math.max(0, capacity - leading.length - (overflow ? 1 : 0) - (held ? 2 : 0))
  );
  const activeModule = items.find((module) => module.id === activeId);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const viewport = window.visualViewport;
    if (!richActive || !anchor || !viewport) {
      return;
    }
    const update = () => {
      anchor.style.top = `${viewport.offsetTop}px`;
      anchor.style.height = `${viewport.height}px`;
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      anchor.style.removeProperty("top");
      anchor.style.removeProperty("height");
    };
  }, [richActive]);

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
            Math.floor(
              (available -
                16 +
                4 -
                (hasOverflow ? 13 : 0) -
                (leading.length > 0 ? 13 : 0)) /
                (size + 4)
            )
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
  }, [position, hasOverflow, leading.length]);
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
      )?.focus({ preventScroll: true });
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
    (position === "left" || position === "right") && dockStyles.sideNavigation
  );
  const shared = directory !== undefined || !!projection;
  const Shape = shared ? SharedDockShape : DockShape;
  const paneKey = rich
    ? `view:${rich.expanded ? "tray" : "bar"}`
    : directory
      ? "directory"
      : selection
        ? (selection.activationKey ?? "selection")
        : compact
          ? "compact"
          : "navigation";

  return (
    <div
      ref={anchorRef}
      {...stylex.props(
        dockStyles.anchor,
        shared && dockStyles.sharedAnchor,
        shared && position === "top" && dockStyles.sharedTop,
        shared && position === "left" && dockStyles.sharedLeft,
        shared && position === "right" && dockStyles.sharedRight
      )}
      data-position={position}
      inert={!present}
      aria-hidden={!present || undefined}
      onPointerDownCapture={() => {
        pointerIntent.current = true;
        setKeyboardInput(false);
      }}
      onKeyDownCapture={() => {
        pointerIntent.current = false;
        setKeyboardInput(true);
      }}
    >
      <MotionConfig reducedMotion="user">
        <LayoutGroup id={groupId}>
          <Shape
            position={position}
            instant={instant}
            present={present}
            {...(shared ? { visible: navigationVisible || !!rich } : {})}
            compact={compact && !selection}
            selection={!!selection}
            dockRef={dockRef}
            onFocusDock={onFocusDock}
            progress={surfaceProgress}
            {...(shared
              ? {
                  expanded: !!directory || !!rich?.expanded,
                  contentKey: paneKey,
                }
              : {})}
          >
            <div
              {...stylex.props(
                dockStyles.navigationOwner,
                !!rich && dockStyles.retainedNavigation
              )}
              inert={!!rich || (!!projection && !navigationReady)}
              aria-hidden={!!rich || undefined}
              onPointerDownCapture={() => {
                navigationPointerStarted.current = !rich && navigationReady;
              }}
              onClickCapture={(event) => {
                if (
                  projection &&
                  !directory &&
                  event.detail > 0 &&
                  !navigationPointerStarted.current
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                navigationPointerStarted.current = false;
              }}
            >
              <AnimatePresence initial={false} mode="sync" custom={paneInstant}>
                {directory ? (
                  <DirectoryPane key="directory" instant={instant}>
                    {directory}
                  </DirectoryPane>
                ) : selection ? (
                  <DockPane
                    key={paneKey}
                    kind="selection"
                    instant={paneInstant}
                    position={position}
                    progress={surfaceProgress}
                  >
                    <div
                      {...selectionStyle}
                      className={`dashboard-dock-selection ${selectionStyle.className}`}
                      role="toolbar"
                      aria-label={`${selection.scopeLabel} selection actions`}
                      aria-busy={selection.running}
                    >
                      {leading.map((entry) => (
                        <ConsoleIconButton
                          key={entry.id}
                          xstyle={dockStyles.control}
                          label={entry.label}
                          data-console-dock-entry={entry.id}
                          side={side}
                          disabled={
                            entry.disabled ||
                            selection.running ||
                            selection.blocked
                          }
                          onClick={(event) =>
                            entry.onInvoke(event.detail === 0)
                          }
                        >
                          {entry.icon}
                        </ConsoleIconButton>
                      ))}
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
                    progress={surfaceProgress}
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
                    progress={surfaceProgress}
                  >
                    <nav
                      {...navigationStyle}
                      className={`dashboard-dock-nav ${navigationStyle.className}`}
                      aria-label="Pinned navigation"
                    >
                      {leading.length > 0 && (
                        <>
                          <fieldset
                            aria-label="Dock views"
                            {...stylex.props(
                              dockStyles.row,
                              dockStyles.group,
                              (position === "left" || position === "right") &&
                                dockStyles.sideNavigation
                            )}
                          >
                            {leading.map((entry) => (
                              <ConsoleIconButton
                                key={entry.id}
                                xstyle={dockStyles.control}
                                glyphXstyle={dockStyles.glyph}
                                label={entry.label}
                                data-console-dock-entry={entry.id}
                                side={side}
                                variant="ghost"
                                disabled={entry.disabled || running}
                                onClick={(event) =>
                                  entry.onInvoke(event.detail === 0)
                                }
                              >
                                {entry.icon}
                              </ConsoleIconButton>
                            ))}
                          </fieldset>
                          {(dockModules.length > 0 || overflow) && (
                            <span
                              aria-hidden="true"
                              {...stylex.props(
                                dockStyles.divider,
                                (position === "left" || position === "right") &&
                                  dockStyles.sideDivider
                              )}
                            />
                          )}
                        </>
                      )}
                      {held && presets && (
                        <DockPresetChevron
                          presets={presets}
                          direction={-1}
                          side={side}
                        />
                      )}
                      <DockDestinations
                        items={dockModules}
                        activeId={activeId}
                        side={side}
                        running={running}
                        instant={instant}
                        pointerIntent={pointerIntent}
                        onNavigate={onNavigate}
                        {...(onEdit ? { onEdit } : {})}
                      />
                      {overflow && (
                        <DockOverflow
                          overflow={overflow}
                          divided={dockModules.length > 0}
                          position={position}
                          side={side}
                          running={running}
                          onInvoke={(pointer) => {
                            pointerIntent.current = pointer;
                            overflow.onInvoke();
                          }}
                        />
                      )}
                      {held && presets && (
                        <DockPresetChevron
                          presets={presets}
                          direction={1}
                          side={side}
                        />
                      )}
                    </nav>
                  </DockPane>
                )}
              </AnimatePresence>
            </div>
          </Shape>
        </LayoutGroup>
      </MotionConfig>
    </div>
  );
}

export function ConsoleDock({ visible, ...props }: ConsoleDockProps) {
  const held = useConsolePresetKeys(
    !!props.presets &&
      props.presets.names.length > 1 &&
      !props.selection &&
      !props.running &&
      !props.directory,
    props.presets?.names.length ?? 0,
    (index) => props.presets?.onSelect(index, true)
  );
  return (
    <AnimatePresence initial={false}>
      {visible && <DockSurface key="dock" {...props} presetSwitching={held} />}
    </AnimatePresence>
  );
}
