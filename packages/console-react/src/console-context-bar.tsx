import { useMediaQuery } from "@lenso/ui/hooks";
import { Surface } from "@lenso/ui/surface";
import { Tabs } from "@lenso/ui/tabs";
import * as stylex from "@stylexjs/stylex";
import { Liquid } from "liquid-gooey";
import { ArrowLeft } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
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

const MotionSurface = motion.create(Surface);

type BodyGeometry = { x: number; y: number; width: number; height: number };

function useContextHandoff(
  kind: "object" | "tabs",
  instant: boolean,
  continuous: boolean,
  skinTransform: MotionValue<string>,
  bodyRef: RefObject<HTMLDivElement | null>,
  skinRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>
) {
  const previousKind = useRef(kind);
  const previousContinuous = useRef(continuous);
  const visual = useRef<BodyGeometry | null>(null);
  const target = useRef<BodyGeometry | null>(null);
  const travelling = useRef(false);
  const controller = useRef<ReturnType<typeof animate> | null>(null);
  const measure = useCallback(() => {
    const body = bodyRef.current;
    const skin = skinRef.current;
    const content = contentRef.current;
    if (!body || !skin || !content) {
      return;
    }
    const box = body.getBoundingClientRect();
    const next = { x: box.x, y: box.y, width: box.width, height: box.height };
    if (!next.width || !next.height) {
      return;
    }
    const changed = previousKind.current !== kind;
    const sharedLocation = continuous && previousContinuous.current;
    previousKind.current = kind;
    previousContinuous.current = continuous;
    const previous = target.current;
    if (
      !changed &&
      !instant &&
      travelling.current &&
      previous &&
      Object.keys(next).every(
        (key) =>
          next[key as keyof BodyGeometry] ===
          previous[key as keyof BodyGeometry]
      )
    ) {
      return;
    }
    controller.current?.stop();
    target.current = next;
    const paint = (geometry: BodyGeometry, progress: number) => {
      visual.current = geometry;
      const sx = geometry.width / next.width;
      const sy = geometry.height / next.height;
      const transform =
        progress === 1
          ? "none"
          : `translate3d(${geometry.x - next.x}px, ${geometry.y - next.y}px, 0) scale(${sx}, ${sy})`;
      skinTransform.set(transform);
      skin.style.transform = transform;
      // Only the skin resizes. Content enters as the same physical surface
      // reaches its destination; the revoked page never remains interactive.
      const reveal = progress === 1 ? 1 : Math.max(0, (progress - 0.6) / 0.4);
      content.style.opacity = String(reveal);
      content.inert = reveal < 1;
      content.style.pointerEvents = reveal < 1 ? "none" : "";
      skin.dataset.travelling = String(progress !== 1);
    };
    const from = visual.current;
    if (
      instant ||
      !sharedLocation ||
      !from ||
      (!changed && !travelling.current)
    ) {
      travelling.current = false;
      paint(next, 1);
      return;
    }
    travelling.current = true;
    paint(from, 0);
    controller.current = animate(0, 1, {
      duration: 0.2,
      ease: [0.77, 0, 0.175, 1],
      onUpdate: (progress) => {
        paint(
          {
            x: from.x + (next.x - from.x) * progress,
            y: from.y + (next.y - from.y) * progress,
            width: from.width + (next.width - from.width) * progress,
            height: from.height + (next.height - from.height) * progress,
          },
          progress
        );
        if (progress === 1) {
          travelling.current = false;
        }
      },
    });
  }, [kind, instant, continuous, skinTransform, bodyRef, skinRef, contentRef]);
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
      target.current = null;
    };
  }, [bodyRef, measure]);
}

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
  const object = context?.kind === "object";
  const skinRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const skinTransform = useMotionValue("none");
  useContextHandoff(
    object ? "object" : "tabs",
    instant,
    continuous,
    skinTransform,
    bodyRef,
    skinRef,
    contentRef
  );
  const hasReturn = !!returning;
  const [capMounted, setCapMounted] = useState(!!returning);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const previousBodyX = useRef<number | null>(null);
  const bodyOffset = useMotionValue(0);
  const [geometry, setGeometry] = useState({ cap: 36, body: 0, height: 36 });
  const separation = useMotionValue(instant ? 1 : 0);
  const previousObject = useRef(object);
  const radius = useMotionValue(18);
  const capTransform = useTransform(
    separation,
    (value) => `translateX(${4 * (1 - value)}px)`
  );
  const bodyTransform = useTransform(
    () =>
      `translateX(${bodyOffset.get() - (capMounted ? 4 * (1 - separation.get()) : 0)}px)`
  );
  const liquidBodyTransform = useTransform(
    () =>
      `${bodyTransform.get()} ${skinTransform.get() === "none" ? "" : skinTransform.get()}`
  );
  const capClip = useTransform(
    () =>
      `inset(0 round ${radius.get()}px ${radius.get() * separation.get()}px ${radius.get() * separation.get()}px ${radius.get()}px)`
  );
  const bodyClip = useTransform(
    () =>
      `inset(0 round ${radius.get() * separation.get()}px ${radius.get()}px ${radius.get()}px ${radius.get() * separation.get()}px)`
  );
  useLayoutEffect(() => {
    const entering = object && !previousObject.current;
    previousObject.current = object;
    if (!object) {
      if (!hasReturn && buttonRef.current === document.activeElement) {
        bodyRef.current?.focus({ preventScroll: true });
      }
      setCapMounted(hasReturn);
      previousBodyX.current = null;
      bodyOffset.set(0);
      separation.set(1);
      return;
    }
    if (entering) {
      separation.set(instant ? 1 : 0);
    }
    if (hasReturn) {
      if (!capMounted && !entering) {
        previousBodyX.current =
          bodyRef.current?.getBoundingClientRect().x ?? null;
      }
      setCapMounted(true);
    } else if (buttonRef.current === document.activeElement) {
      bodyRef.current?.focus({ preventScroll: true });
    }
    // Retarget the actual seam, including a reversal before the cap has settled.
    const controller = animate(separation, hasReturn ? 1 : 0, {
      duration: instant ? 0 : 0.2,
      ease: [0.77, 0, 0.175, 1],
      onComplete: () => {
        if (!hasReturn) {
          previousBodyX.current =
            bodyRef.current?.getBoundingClientRect().x ?? null;
          setCapMounted(false);
        }
      },
    });
    return () => controller.stop();
  }, [object, hasReturn, capMounted, instant, separation, bodyRef, bodyOffset]);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const previous = previousBodyX.current;
    previousBodyX.current = null;
    if (!body) {
      return;
    }
    // Rebase only a retained identity when the cap's layout slot changes.
    // Generic layout projection also rebases a fresh route from unrelated tabs.
    if (previous !== null) {
      bodyOffset.set(
        bodyOffset.get() + previous - body.getBoundingClientRect().x
      );
    } else if (bodyOffset.get() === 0) {
      return;
    }
    const controller = animate(bodyOffset, 0, {
      duration: instant ? 0 : 0.2,
      ease: [0.77, 0, 0.175, 1],
    });
    return () => controller.stop();
  }, [capMounted, instant, bodyRef, bodyOffset]);
  useLayoutEffect(() => {
    const cap = capRef.current;
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const measure = () => {
      const next = {
        cap: cap?.offsetWidth ?? 0,
        body: body.offsetWidth,
        height: body.offsetHeight,
      };
      if (cap) {
        radius.set(Math.min(cap.offsetWidth, cap.offsetHeight) / 2);
      }
      setGeometry((previous) =>
        previous.cap === next.cap &&
        previous.body === next.body &&
        previous.height === next.height
          ? previous
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (cap) {
      observer.observe(cap);
    }
    observer.observe(body);
    return () => observer.disconnect();
  }, [capMounted, radius, bodyRef]);
  return (
    <div
      {...stylex.props(
        styles.contextObjectGroup,
        (instant || !object) && styles.contextObjectInstant
      )}
    >
      {object && !instant && capMounted && geometry.body > 0 && (
        <Liquid
          {...stylex.props(styles.contextLiquid)}
          style={{ position: "absolute" }}
          aria-hidden="true"
          inert
          fill="var(--surface)"
          blur={2}
          contrast={18}
          filterPadding={8}
        >
          <Liquid.Item observe radius={999}>
            <motion.div
              {...stylex.props(styles.contextLiquidPiece)}
              style={{
                width: geometry.cap,
                height: geometry.height,
                transform: capTransform,
              }}
            />
          </Liquid.Item>
          <Liquid.Item observe radius={999}>
            <motion.div
              {...stylex.props(styles.contextLiquidPiece)}
              style={{
                left: geometry.cap + 8,
                width: geometry.body,
                height: geometry.height,
                transform: liquidBodyTransform,
                transformOrigin: "0 0",
              }}
            />
          </Liquid.Item>
        </Liquid>
      )}
      {capMounted && (
        <motion.div
          ref={capRef}
          inert={!returning}
          aria-hidden={!returning || undefined}
          {...stylex.props(styles.contextReturnSurface)}
          style={{ transform: capTransform }}
        >
          <MotionSurface
            aria-hidden="true"
            data-context-surface="return"
            xstyle={styles.contextSurfaceSkin}
            style={{ clipPath: capClip }}
          />
          <ConsoleIconButton
            ref={buttonRef}
            label={returning?.label ?? "Return"}
            variant="ghost"
            xstyle={styles.contextReturnFocus}
            onClick={() => returning?.onInvoke()}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </ConsoleIconButton>
        </motion.div>
      )}
      <div {...stylex.props(styles.contextObjectFrame)}>
        <MotionSurface
          ref={bodyRef}
          tabIndex={-1}
          variant="transparent"
          xstyle={[
            styles.contextBody,
            styles.contextObject,
            !object && styles.contextViews,
            !context && styles.contextFallback,
          ]}
          style={{ transform: bodyTransform }}
        >
          <MotionSurface
            ref={skinRef}
            aria-hidden="true"
            data-context-body-surface="true"
            data-context-surface={object ? "object" : "tabs"}
            xstyle={[
              styles.contextSurfaceSkin,
              styles.contextMorphSkin,
              !object && styles.contextViewsSkin,
            ]}
            style={{
              clipPath: object && capMounted ? bodyClip : "inset(0 round 24px)",
              transform: skinTransform,
            }}
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
        </MotionSurface>
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
