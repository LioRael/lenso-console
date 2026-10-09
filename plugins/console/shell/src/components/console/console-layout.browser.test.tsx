import { StrictMode, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import "@lenso/tokens/styles.css";
import "../../styles.css";
import { ConsoleLayout } from "./console-layout";
import {
  createConsolePageContext,
  type ConsolePageContextHandle,
} from "./console-page-context";

type PageState = { count: number };
const { Provider, useConsolePageContext } =
  createConsolePageContext<PageState>();
const handles = new Map<string, ConsolePageContextHandle<PageState>>();
const layoutSnapshots = new Map<string, number>();
let mountWrites = 0;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let restoreDocument: (() => void) | undefined;

afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  restoreDocument?.();
  handles.clear();
  layoutSnapshots.clear();
  mountWrites = 0;
});

function ContextObserver({ scopeKey }: { scopeKey: string }) {
  const handle = useConsolePageContext();
  useLayoutEffect(() => {
    layoutSnapshots.set(scopeKey, handle.getContext().count);
    if (handle.context.count === 0) {
      handle.setContext((previous) => {
        mountWrites += 1;
        return previous;
      });
    }
  }, [handle, scopeKey]);
  return null;
}

function ContextButton({ scopeKey }: { scopeKey: string }) {
  const handle = useConsolePageContext();
  useLayoutEffect(() => {
    handles.set(scopeKey, handle);
  }, [handle, scopeKey]);
  return (
    <button
      onClick={() =>
        handle.setContext((previous) => ({ count: previous.count + 1 }))
      }
    >
      Foreground count: {handle.context.count}
    </button>
  );
}

function ContextOutput() {
  const { context } = useConsolePageContext();
  return (
    <output
      aria-label="Page count"
      style={{ position: "fixed", bottom: 20, left: 20 }}
    >
      {context.count}
    </output>
  );
}

function ForegroundControls({ scopeKey }: { scopeKey: string }) {
  return (
    <>
      <ContextObserver scopeKey={scopeKey} />
      <ConsoleLayout.Corner area="topRight">
        <ContextButton scopeKey={scopeKey} />
      </ConsoleLayout.Corner>
      <ConsoleLayout.Foreground>
        <ContextOutput />
      </ConsoleLayout.Foreground>
    </>
  );
}

function Fixture({
  innerScroll,
  reducedTransparency,
  scopeKey,
}: {
  innerScroll: boolean;
  reducedTransparency: boolean;
  scopeKey: string;
}) {
  const [value, setValue] = useState<PageState>({ count: 0 });
  const [contentClicks, setContentClicks] = useState(0);
  return (
    <ConsoleLayout topEdge={{ reducedTransparency }}>
      <Provider scopeKey={scopeKey} value={value} onChange={setValue}>
        <ForegroundControls scopeKey={scopeKey} />
      </Provider>
      <main
        aria-label="Page content"
        style={{
          height: innerScroll ? 480 : undefined,
          overflowY: innerScroll ? "auto" : undefined,
        }}
      >
        <div style={{ minHeight: 1600, paddingTop: 220 }}>
          <button
            style={{ display: "block", marginInline: "auto" }}
            onClick={() => setContentClicks((count) => count + 1)}
          >
            Content clicks: {contentClicks}
          </button>
          <section
            aria-label="Lower nested scroller"
            style={{ height: 100, overflowY: "auto", marginTop: 240 }}
          >
            <div style={{ height: 600 }}>Lower content</div>
          </section>
        </div>
      </main>
    </ConsoleLayout>
  );
}

function expectPointerTarget(element: Element) {
  const { x, y, width, height } = element.getBoundingClientRect();
  const target = document.elementFromPoint(x + width / 2, y + height / 2);
  expect(target === element || element.contains(target)).toBe(true);
}

test("keeps the shared edge fixed and click-through while foreground context changes activation", async () => {
  await page.viewport(1280, 800);
  const originalBodyStyle = document.body.style.cssText;
  const originalTheme = document.documentElement.dataset.theme;
  const originalScroll = { x: window.scrollX, y: window.scrollY };
  restoreDocument = () => {
    document.body.style.cssText = originalBodyStyle;
    if (originalTheme === undefined) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = originalTheme;
    }
    window.scrollTo(originalScroll.x, originalScroll.y);
  };
  document.body.style.margin = "0";
  document.documentElement.dataset.theme = "light";
  window.scrollTo(0, 0);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const render = (
    innerScroll = false,
    scopeKey = "first",
    reducedTransparency = false
  ) =>
    flushSync(() =>
      root!.render(
        <StrictMode>
          <Fixture
            innerScroll={innerScroll}
            reducedTransparency={reducedTransparency}
            scopeKey={scopeKey}
          />
        </StrictMode>
      )
    );
  render();
  expect(layoutSnapshots.get("first")).toBe(0);
  expect(mountWrites).toBeGreaterThan(0);

  const edge = container.querySelector<HTMLElement>(".console-top-edge")!;
  const strong = edge.querySelector<HTMLElement>(".console-top-edge-strong")!;
  const soft = edge.querySelector<HTMLElement>(".console-top-edge-soft")!;
  await vi.waitFor(() =>
    expect(edge.getBoundingClientRect().height).toBeGreaterThan(0)
  );
  const initialEdge = edge.getBoundingClientRect();
  expect(initialEdge.top).toBe(0);
  expect(initialEdge.width).toBe(window.innerWidth);
  expect(initialEdge.height).toBeGreaterThan(0);
  expect(edge.getAttribute("aria-hidden")).toBe("true");
  expect(getComputedStyle(edge).pointerEvents).toBe("none");
  expect(getComputedStyle(strong).display).not.toBe("none");
  expect(getComputedStyle(soft).display).not.toBe("none");
  const strongBlur = getComputedStyle(strong).backdropFilter;
  const softBlur = getComputedStyle(soft).backdropFilter;
  expect(Number(strongBlur.match(/blur\(([\d.]+)px\)/)?.[1])).toBeGreaterThan(
    Number(softBlur.match(/blur\(([\d.]+)px\)/)?.[1])
  );
  expect(getComputedStyle(strong).maskImage).not.toBe("none");
  expect(getComputedStyle(soft).maskImage).not.toBe(
    getComputedStyle(strong).maskImage
  );

  window.scrollTo(0, 200);
  await vi.waitFor(() => expect(window.scrollY).toBe(200));
  expect(edge.getBoundingClientRect().top).toBe(initialEdge.top);
  expect(edge.getBoundingClientRect().height).toBe(initialEdge.height);
  const content = page.getByRole("button", { name: "Content clicks: 0" });
  expect(content.element().getBoundingClientRect().top).toBeLessThan(
    initialEdge.height
  );
  expectPointerTarget(content.element());
  await content.click();
  await expect
    .element(page.getByRole("button", { name: "Content clicks: 1" }))
    .toBeVisible();

  const first = handles.get("first")!;
  const foreground = page.getByRole("button", { name: "Foreground count: 0" });
  expectPointerTarget(foreground.element());
  await foreground.click();
  await expect
    .element(page.getByLabelText("Page count"))
    .toHaveTextContent("1");
  expect(first.getContext()).toEqual({ count: 1 });
  expect(layoutSnapshots.get("first")).toBe(1);
  const keyboardControl = page.getByRole("button", {
    name: "Foreground count: 1",
  });
  keyboardControl.element().focus();
  await expect.element(keyboardControl).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByLabelText("Page count"))
    .toHaveTextContent("2");

  window.scrollTo(0, 0);
  render(true, "successor");
  const successor = handles.get("successor")!;
  const staleUpdate = vi.fn(() => ({ count: 999 }));
  flushSync(() => first.setContext(staleUpdate));
  expect(staleUpdate).not.toHaveBeenCalled();
  expect(() => first.getContext()).toThrow(/scope is closed/);
  expect(successor.getContext()).toEqual({ count: 2 });
  expect(layoutSnapshots.get("successor")).toBe(2);
  await page.getByRole("button", { name: "Foreground count: 2" }).click();
  await expect
    .element(page.getByLabelText("Page count"))
    .toHaveTextContent("3");
  expect(successor.getContext()).toEqual({ count: 3 });

  const main = page.getByRole("main", { name: "Page content" }).element();
  main.scrollTop = 200;
  await vi.waitFor(() => expect(main.scrollTop).toBe(200));
  expect(window.scrollY).toBe(0);
  expect(edge.getBoundingClientRect().top).toBe(initialEdge.top);
  const innerContent = page.getByRole("button", { name: "Content clicks: 1" });
  expect(innerContent.element().getBoundingClientRect().top).toBeLessThan(
    initialEdge.height
  );
  expectPointerTarget(innerContent.element());
  await innerContent.click();
  await expect
    .element(page.getByRole("button", { name: "Content clicks: 2" }))
    .toBeVisible();
  const lower = page
    .getByRole("region", { name: "Lower nested scroller" })
    .element();
  expect(lower.getBoundingClientRect().top).toBeGreaterThan(initialEdge.height);
  lower.scrollTop = 150;
  await vi.waitFor(() => expect(lower.scrollTop).toBe(150));
  expect(main.scrollTop).toBe(200);
  expect(container.querySelectorAll(".console-top-edge")).toHaveLength(1);
  expect(edge.getBoundingClientRect().top).toBe(initialEdge.top);

  const lightTint = getComputedStyle(edge, "::after").backgroundImage;
  document.documentElement.dataset.theme = "dark";
  await vi.waitFor(() =>
    expect(getComputedStyle(edge, "::after").backgroundImage).not.toBe(
      lightTint
    )
  );
  render(true, "successor", true);
  expect(getComputedStyle(strong).display).toBe("none");
  expect(getComputedStyle(soft).display).toBe("none");
  expect(getComputedStyle(edge, "::after").backgroundImage).toContain(
    "gradient"
  );
  expect(Number(getComputedStyle(edge, "::after").opacity)).toBeGreaterThan(0);
  expectPointerTarget(
    page.getByRole("button", { name: "Foreground count: 3" }).element()
  );
  await page.getByRole("button", { name: "Foreground count: 3" }).click();
  await expect
    .element(page.getByLabelText("Page count"))
    .toHaveTextContent("4");
  flushSync(() => root!.unmount());
  root = undefined;
  successor.setContext(staleUpdate);
  expect(staleUpdate).not.toHaveBeenCalled();
  expect(() => successor.getContext()).toThrow(/scope is closed/);
});
