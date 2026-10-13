import { useMediaQuery } from "@lenso/ui/hooks";
import { Surface } from "@lenso/ui/surface";
import { Tabs } from "@lenso/ui/tabs";
import * as stylex from "@stylexjs/stylex";
import { ArrowLeft } from "lucide-react";
import { animate } from "motion/react";
import {
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import type { ConsoleRouterAdapter } from "./composition";
import type { ConsoleTaskContext } from "./console-action-scope";
import { ConsoleIconButton } from "./console-icon-button";
import { shellStyles as styles } from "./console-shell.styles";

const fallbackPlacement = {
  top: null,
  bottom: [styles.tabsBottom, styles.contextBottom],
  left: styles.tabsLeft,
  right: [styles.tabsRight, styles.contextRight],
  content: null,
};

type BodyGeometry = { x: number; y: number; width: number; height: number };
type IslandGeometry = { body: BodyGeometry; cap: BodyGeometry };

function ContextSurface({
  context,
  fallback,
  router,
  instant,
  continuous,
  bodyRef,
}: {
  context?: Exclude<ConsoleTaskContext, { kind: "hidden" }>;
  fallback: ReactNode;
  router: Pick<ConsoleRouterAdapter, "navigate">;
  instant: boolean;
  continuous: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  const returning = context?.return;
  const hasReturn = !!returning;
  const object = context?.kind === "object";
  const identity = object
    ? JSON.stringify(["object", context.label, context.id])
    : "tabs";
  const groupRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const skinRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [capMounted, setCapMounted] = useState(hasReturn);
  const lastReturn = useRef(returning);
  const visual = useRef<IslandGeometry | null>(null);
  const target = useRef<IslandGeometry | null>(null);
  const previousIdentity = useRef(identity);
  const previousContinuous = useRef(continuous);
  const travelling = useRef(false);
  const controller = useRef<ReturnType<typeof animate> | null>(null);
  const capOpacity = useRef(hasReturn ? 1 : 0);

  useLayoutEffect(() => {
    if (returning) {
      lastReturn.current = returning;
      setCapMounted(true);
    } else if (buttonRef.current === document.activeElement) {
      bodyRef.current?.focus({ preventScroll: true });
    }
  }, [returning, bodyRef]);

  const measure = useCallback(() => {
    const body = bodyRef.current;
    const skin = skinRef.current;
    const content = contentRef.current;
    const group = groupRef.current;
    const slot = slotRef.current;
    if (!body || !skin || !content || !group || !slot) {
      return;
    }
    // Read target layout once. Only the small, absolute skin and end cap resize;
    // page content and the island's layout slot never animate or scale.
    const box = body.getBoundingClientRect();
    const foreground = content.getBoundingClientRect();
    const anchor = group.getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }
    const next: IslandGeometry = {
      body: { x: box.x, y: box.y, width: box.width, height: box.height },
      cap: {
        x: anchor.x,
        y: box.y,
        width: hasReturn ? slot.offsetWidth : 0,
        height: box.height,
      },
    };
    const changed = previousIdentity.current !== identity;
    const shared = continuous && previousContinuous.current;
    previousIdentity.current = identity;
    previousContinuous.current = continuous;
    const previous = target.current;
    const sameTarget =
      previous &&
      (["body", "cap"] as const).every((part) =>
        (Object.keys(next[part]) as (keyof BodyGeometry)[]).every(
          (key) => previous[part][key] === next[part][key]
        )
      );
    if (!instant && travelling.current && sameTarget) {
      return;
    }
    controller.current?.stop();
    target.current = next;
    const outgoingCapOpacity = capOpacity.current;
    const paint = (geometry: IslandGeometry, progress: number) => {
      visual.current = geometry;
      const physical = geometry.body;
      const radius = physical.height / 2;
      skin.style.width = `${physical.width}px`;
      skin.style.height = `${physical.height}px`;
      skin.style.transform = `translate3d(${physical.x - box.x}px, ${physical.y - box.y}px, 0)`;
      skin.style.borderRadius = `${radius}px`;
      skin.style.clipPath = `inset(0 round ${radius}px)`;
      skin.dataset.travelling = String(progress !== 1);
      // The same physical rounded clip owns visibility and hit testing.
      content.style.clipPath = `inset(${physical.y - foreground.y}px ${foreground.right - physical.x - physical.width}px ${foreground.bottom - physical.y - physical.height}px ${physical.x - foreground.x}px round ${radius}px)`;
      const reveal = progress === 1 ? 1 : Math.max(0, (progress - 0.6) / 0.4);
      content.style.opacity = String(reveal);
      content.inert = reveal < 1;
      content.style.pointerEvents = reveal < 1 ? "none" : "";
      const cap = capRef.current;
      if (cap) {
        const capRadius = Math.min(geometry.cap.width, geometry.cap.height) / 2;
        cap.style.width = `${geometry.cap.width}px`;
        cap.style.height = `${geometry.cap.height}px`;
        cap.style.transform = `translate3d(${geometry.cap.x - anchor.x}px, ${geometry.cap.y - anchor.y}px, 0)`;
        cap.style.borderRadius = `${capRadius}px`;
        cap.style.clipPath = `inset(0 round ${capRadius}px)`;
        cap.inert = !hasReturn || progress !== 1;
        cap.style.pointerEvents = cap.inert ? "none" : "";
        if (buttonRef.current) {
          capOpacity.current = hasReturn
            ? reveal
            : outgoingCapOpacity * Math.max(0, 1 - progress / 0.4);
          buttonRef.current.style.opacity = String(capOpacity.current);
        }
      }
      if (progress === 1) {
        travelling.current = false;
        if (!hasReturn) {
          setCapMounted(false);
        }
      }
    };
    const from = visual.current;
    if (
      instant ||
      !shared ||
      !from ||
      (!changed && !travelling.current && sameTarget)
    ) {
      paint(next, 1);
      return;
    }
    travelling.current = true;
    paint(from, 0);
    controller.current = animate(0, 1, {
      duration: 0.2,
      ease: [0.77, 0, 0.175, 1],
      onUpdate: (progress) => {
        const interpolate = (part: "body" | "cap"): BodyGeometry => ({
          x: from[part].x + (next[part].x - from[part].x) * progress,
          y: from[part].y + (next[part].y - from[part].y) * progress,
          width:
            from[part].width + (next[part].width - from[part].width) * progress,
          height:
            from[part].height +
            (next[part].height - from[part].height) * progress,
        });
        paint({ body: interpolate("body"), cap: interpolate("cap") }, progress);
      },
    });
  }, [bodyRef, identity, continuous, hasReturn, instant]);

  useLayoutEffect(() => {
    measure();
  });
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      controller.current?.stop();
    };
  }, [bodyRef, measure]);

  return (
    <div
      ref={groupRef}
      {...stylex.props(
        styles.contextObjectGroup,
        instant && styles.contextObjectInstant
      )}
    >
      <div
        ref={slotRef}
        aria-hidden="true"
        {...stylex.props(
          styles.contextReturnSurface,
          hasReturn ? styles.contextReturnSlot : styles.contextReturnSlotEmpty
        )}
      />
      {(hasReturn || capMounted) && (
        <div
          ref={capRef}
          inert={!hasReturn}
          aria-hidden={!hasReturn || undefined}
          {...stylex.props(
            styles.contextReturnSurface,
            styles.contextReturnCap
          )}
        >
          <Surface
            aria-hidden="true"
            data-context-surface="return"
            xstyle={[styles.contextSurfaceSkin, styles.contextReturnSkin]}
          />
          <ConsoleIconButton
            ref={buttonRef}
            label={returning?.label ?? lastReturn.current?.label ?? "Return"}
            variant="ghost"
            xstyle={styles.contextReturnFocus}
            onClick={() => returning?.onInvoke()}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </ConsoleIconButton>
        </div>
      )}
      <div {...stylex.props(styles.contextObjectFrame)}>
        <Surface
          ref={bodyRef}
          tabIndex={-1}
          variant="transparent"
          xstyle={[
            styles.contextBody,
            styles.contextObject,
            !object && styles.contextViews,
            !context && styles.contextFallback,
          ]}
        >
          <Surface
            ref={skinRef}
            aria-hidden="true"
            data-context-body-surface="true"
            data-context-surface={object ? "object" : "tabs"}
            xstyle={[
              styles.contextSurfaceSkin,
              styles.contextMorphSkin,
              !object && styles.contextViewsSkin,
            ]}
          />
          <div
            ref={contentRef}
            data-context-content="true"
            {...stylex.props(styles.contextContent)}
          >
            {context ? (
              <TaskContent context={context} router={router} />
            ) : (
              fallback
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function TaskContent({
  context,
  router,
}: {
  context: Exclude<ConsoleTaskContext, { kind: "hidden" }>;
  router: Pick<ConsoleRouterAdapter, "navigate">;
}) {
  if (context.kind === "object") {
    return (
      <>
        <span {...stylex.props(styles.contextIdentityRow)}>
          <span {...stylex.props(styles.contextLabel)}>{context.label}</span>
          {context.id && (
            <span {...stylex.props(styles.contextIdentity)}>{context.id}</span>
          )}
        </span>
        {context.status && (
          <output {...stylex.props(styles.contextStatus)}>
            {context.status}
          </output>
        )}
      </>
    );
  }
  return (
    <Tabs.Root
      value={context.activeId}
      render={<nav aria-label={context.label} />}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={context.label} activateOnFocus={false}>
          {context.tabs.map((tab) => (
            <Tabs.Tab
              key={tab.id}
              value={tab.id}
              nativeButton={false}
              render={<a href={tab.href}>{tab.label}</a>}
              onClick={(event) => {
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.altKey &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  router.navigate(tab.href);
                }
              }}
            >
              {tab.label}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs.Root>
  );
}

export function ConsoleContextBar({
  context,
  fallback,
  router,
  sidebar,
  instant = false,
  position = "top",
}: {
  context?: ConsoleTaskContext;
  fallback: ReactNode;
  router: Pick<ConsoleRouterAdapter, "navigate">;
  sidebar: boolean;
  instant?: boolean;
  position?: "top" | "bottom" | "left" | "right" | "content";
}) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const bodyRef = useRef<HTMLDivElement>(null);
  if (context?.kind === "hidden" || (!context && !fallback)) {
    return null;
  }
  return (
    <div
      {...stylex.props(
        styles.contextBar,
        !context && fallbackPlacement[position],
        sidebar &&
          (context || position === "top" || position === "bottom") &&
          styles.mainCenteredTabs
      )}
      aria-label="Task context"
    >
      <ContextSurface
        context={context}
        fallback={fallback}
        router={router}
        instant={instant || reduced}
        continuous={!!context || position === "top"}
        bodyRef={bodyRef}
      />
    </div>
  );
}
