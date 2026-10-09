import { Tooltip } from "@lenso/ui/tooltip";
import { Check, Copy, Folder, Rows3 } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import "@lenso/tokens/styles.css";
import "../../styles.css";
import { ConsoleAppearanceProvider } from "../../app/console-appearance";
import { ConsoleDock, type Position } from "./console-dock";

const items = [
  {
    id: "collection",
    label: "集合",
    icon: <Folder size={16} aria-hidden="true" />,
  },
  {
    id: "entries",
    label: "条目",
    icon: <Rows3 size={16} aria-hidden="true" />,
  },
];

function DockFixture() {
  const [activeId, setActiveId] = useState("collection");
  const [selected, setSelected] = useState<boolean[]>([false, false]);
  const [instant, setInstant] = useState(false);
  const [compact, setCompact] = useState(false);
  const [visible, setVisible] = useState(true);
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState<Position>("bottom");
  const [invoked, setInvoked] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const selectionFocus = useRef<HTMLInputElement | null>(null);
  const count = selected.filter(Boolean).length;

  return (
    <div
      onPointerDownCapture={() => setInstant(false)}
      onKeyDownCapture={() => setInstant(true)}
    >
      {items.map((item) => (
        <button key={item.id} onClick={() => setActiveId(item.id)}>
          切换到{item.label}
        </button>
      ))}
      {selected.map((checked, index) => (
        <label key={index}>
          <input
            type="checkbox"
            checked={checked}
            onFocus={(event) => {
              selectionFocus.current = event.currentTarget;
            }}
            onChange={(event) => {
              const next = [...selected];
              next[index] = event.target.checked;
              setSelected(next);
            }}
          />
          选择条目{index + 1}
        </label>
      ))}
      <button onClick={() => setCompact(!compact)}>切换紧凑导航</button>
      <button onClick={() => setVisible(!visible)}>切换可见性</button>
      <button onClick={() => setRunning(!running)}>切换执行状态</button>
      <select
        aria-label="导航位置"
        value={position}
        onChange={(event) => setPosition(event.target.value as Position)}
      >
        {(["bottom", "top", "left", "right"] as const).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <output aria-label="执行结果">{invoked}</output>
      <ConsoleDock
        visible={visible}
        position={position}
        compact={compact}
        activeId={activeId}
        items={items}
        running={running}
        instant={instant}
        dockRef={dockRef}
        onNavigate={setActiveId}
        onExpand={() => setCompact(false)}
        onFocusDock={() => {}}
        selection={
          count
            ? {
                count,
                scopeLabel: "所选条目",
                running,
                actions: [
                  {
                    id: "copy",
                    label: "复制",
                    tooltip: "复制所选条目",
                    icon: <Copy size={16} aria-hidden="true" />,
                    onInvoke: () => setInvoked("复制"),
                  },
                  {
                    id: "check",
                    label: "检查",
                    icon: <Check size={16} aria-hidden="true" />,
                    onInvoke: () => setInvoked("检查"),
                  },
                  {
                    id: "open",
                    label: "打开",
                    icon: <Folder size={16} aria-hidden="true" />,
                    onInvoke: () => setInvoked("打开"),
                  },
                ],
                onExit: () => {
                  setSelected([false, false]);
                  selectionFocus.current?.focus();
                },
              }
            : null
        }
      />
    </div>
  );
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  localStorage.removeItem("lenso-console:theme-preference");
});

function assertNoInnerScroll(control: Element) {
  const dock = control.closest<HTMLElement>("[data-dashboard-dock]");
  expect(dock).not.toBeNull();
  let element: Element | null = control;
  while (element) {
    expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
    expect(["auto", "scroll"]).not.toContain(
      getComputedStyle(element).overflowX
    );
    if (element === dock) {
      break;
    }
    element = element.parentElement;
  }
}

test("keeps the narrow pill circular, non-scrolling, and safe while swapping action scopes", async () => {
  await page.viewport(320, 800);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root!.render(
      <ConsoleAppearanceProvider>
        <Tooltip.Provider delay={150}>
          <DockFixture />
        </Tooltip.Provider>
      </ConsoleAppearanceProvider>
    )
  );

  const navigation = page.getByRole("navigation", { name: "常用模块" });
  await expect.element(navigation).toBeVisible();
  assertNoInnerScroll(navigation.element());
  await navigation.getByRole("button", { name: "条目", exact: true }).click();

  const firstRecord = page.getByRole("checkbox").nth(0);
  await firstRecord.click();
  const toolbar = () =>
    container!.querySelector<HTMLElement>('[role="toolbar"]');
  await vi.waitFor(() => expect(toolbar()).not.toBeNull());
  expect(toolbar()!.closest("[inert]")).not.toBeNull();
  const secondRecord = page.getByRole("checkbox").nth(1);
  secondRecord.element().focus();
  await userEvent.keyboard(" ");
  await expect.element(secondRecord).toBeChecked();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(toolbar()!.closest("[inert]")).toBeNull();
  expect(getComputedStyle(toolbar()!.parentElement!).opacity).toBe("1");
  await vi.waitFor(() => expect(toolbar()!.closest("[inert]")).toBeNull());
  assertNoInnerScroll(toolbar()!);
  await expect
    .element(page.getByRole("toolbar", { name: "所选条目选择操作" }))
    .toBeVisible();
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect
    .element(page.getByRole("status", { name: "执行结果" }))
    .toHaveTextContent("复制");

  const samples: { width: number; height: number }[] = [];
  let sampling = true;
  const sample = () => {
    if (!container?.isConnected) {
      return;
    }
    for (const cap of container!.querySelectorAll("[data-dock-cap]")) {
      const { width, height } = cap.getBoundingClientRect();
      samples.push({ width, height });
    }
    if (sampling) {
      requestAnimationFrame(sample);
    }
  };
  requestAnimationFrame(sample);
  await page.getByRole("button", { name: "退出选择" }).click();
  await expect.element(navigation).toBeVisible();
  await vi.waitFor(() =>
    expect(navigation.element().closest("[inert]")).toBeNull()
  );
  sampling = false;
  expect(samples.length).toBeGreaterThan(2);
  for (const { width, height } of samples) {
    expect(Math.abs(width - height)).toBeLessThan(0.75);
  }
  assertNoInnerScroll(navigation.element());
  await expect.element(secondRecord).toHaveFocus();

  await firstRecord.click();
  await firstRecord.click();
  await vi.waitFor(() =>
    expect(navigation.element().closest("[inert]")).toBeNull()
  );
  assertNoInnerScroll(navigation.element());
});
