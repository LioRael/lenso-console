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

import { DockShape } from "./console-dock-shape";
import { dockStyles } from "./console-dock.styles";
import { ConsoleIconButton } from "./console-icon-button";

export type Position = "bottom" | "top" | "left" | "right";

export type ConsoleDockSelection = {
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
  onExit: () => void;
};

export type ConsoleDockProps = {
  visible: boolean;
  position: Position;
  compact: boolean;
  activeId: string;
  items: readonly { id: string; label: string; icon: ReactNode }[];
  overflow?: { label: string; onInvoke: () => void; icon?: ReactNode };
  selection: ConsoleDockSelection | null;
  running: boolean;
  instant?: boolean;
  dockRef: RefObject<HTMLDivElement | null>;
  onNavigate: (id: string) => void;
  onExpand: () => void;
  onFocusDock: () => void;
};

const geometryTransition: Transition = {
  type: "tween",
  duration: 0.14,
  ease: [0.77, 0, 0.175, 1],
};

const paneEase = [0.23, 1, 0.32, 1] as const;

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
  overflow,
  selection,
  running,
  instant: keyboardInstant = false,
  dockRef,
  onNavigate,
  onExpand,
  onFocusDock,
}: Omit<ConsoleDockProps, "visible">) {
  const present = useIsPresent();
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false
  );
  const pointerIntent = useRef(true);
  const focusAfterExpand = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [capacity, setCapacity] = useState(5);
  const groupId = useId();
  const instant = !!reduced || keyboardInstant || !pointerIntent.current;
  const paneInstant = instant || !mounted;
  const hasOverflow = items.length > capacity;
  const dockModules = items.slice(
    0,
    hasOverflow && overflow ? capacity - 1 : capacity
  );
  const activeModule = items.find((module) => module.id === activeId);
  if (hasOverflow && activeModule && !dockModules.includes(activeModule)) {
    dockModules[dockModules.length - 1] = activeModule;
  }

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
        Math.max(2, Math.min(5, Math.floor((available - 16 + 4) / (size + 4))))
      );
    };
    updateCapacity();
    window.addEventListener("resize", updateCapacity);
    coarse.addEventListener("change", updateCapacity);
    return () => {
      window.removeEventListener("resize", updateCapacity);
      coarse.removeEventListener("change", updateCapacity);
    };
  }, [position]);
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
    (position === "left" || position === "right") && dockStyles.sideNavigation
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
            instant={instant}
            present={present}
            compact={compact && !selection}
            selection={!!selection}
            dockRef={dockRef}
            onFocusDock={onFocusDock}
          >
            <AnimatePresence initial={false} mode="sync" custom={paneInstant}>
              {selection ? (
                <DockPane
                  key="selection"
                  kind="selection"
                  instant={paneInstant}
                  position={position}
                >
                  <div
                    {...selectionStyle}
                    className={`dashboard-dock-selection ${selectionStyle.className}`}
                    role="toolbar"
                    aria-label={`${selection.scopeLabel}选择操作`}
                    aria-busy={selection.running}
                  >
                    <span
                      {...countStyle}
                      className={`dashboard-dock-count ${countStyle.className}`}
                    >
                      {selection.scopeLabel} · {selection.count} 条
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
                      label="退出选择"
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
                        ? `展开导航，当前为${activeModule.label}`
                        : "展开导航"
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
                    aria-label="常用模块"
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
                                instant ? { duration: 0 } : geometryTransition
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
                    {overflow && (hasOverflow || items.length === 0) && (
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
                    )}
                  </nav>
                </DockPane>
              )}
            </AnimatePresence>
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
