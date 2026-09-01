import { Button } from "@lenso/ui/button";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { Terminal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { PromptComposer } from "../../components/lenso/recipes/prompt-composer";
import {
  ComposerSlashMenu,
  RunConfigurationMenu,
  TurnSelect,
} from "./agent-composer-controls";
import { agentPageStyles as styles } from "./agent-page.stylex";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  flushSync(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

describe("Agent composer controls", () => {
  test("uses shared pill geometry for composer triggers", async () => {
    await renderControls(
      <>
        <Button
          aria-label="Permissions"
          size="compact"
          variant="ghost"
          xstyle={styles.composerControl}
        >
          Permissions
        </Button>
        <TurnSelect
          aria-label="Agent mode"
          disabled={false}
          icon={<span aria-hidden="true">A</span>}
          onValueChange={() => undefined}
          options={[
            { label: "Normal", value: "" },
            { label: "Plan", value: "plan" },
          ]}
          value=""
        />
      </>
    );

    const baseline = requiredButton("Permissions");
    const select = requiredButton("Agent mode");
    const baselineStyle = getComputedStyle(baseline);
    const selectStyle = getComputedStyle(select);
    const selectValue = [...select.querySelectorAll("span")].find(
      (node) => node.textContent === "Normal"
    );
    if (!selectValue) {
      throw new Error("Select value was not rendered");
    }
    const selectValueStyle = getComputedStyle(selectValue);

    expect(selectStyle.height).toBe(baselineStyle.height);
    expect(selectStyle.borderRadius).toBe(baselineStyle.borderRadius);
    expect(selectStyle.borderRadius).toBe("999px");
    expect(selectStyle.paddingInline).toBe(baselineStyle.paddingInline);
    expect(selectStyle.paddingInline).toBe("6px");
    expect(selectStyle.height).toBe("24px");
    expect(selectStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(selectStyle.fontSize).toBe(baselineStyle.fontSize);
    expect(selectValueStyle.fontSize).toBe(baselineStyle.fontSize);
    expect(selectValueStyle.fontWeight).toBe(baselineStyle.fontWeight);
  });

  test("opens slash commands above the composer without clipping", async () => {
    await renderControls(<SlashMenuHarness />);
    const input = page.getByRole("textbox", { name: "Composer" });
    await userEvent.fill(input, "/");

    const form = document.querySelector<HTMLElement>(
      '[data-slot="prompt-composer"]'
    );
    const menu = document.querySelector<HTMLElement>(
      '[aria-label="Slash command suggestions"]'
    );
    const surface = form?.parentElement;
    if (!(form && menu && surface)) {
      throw new Error("Slash menu was not rendered inside the composer");
    }
    const formRect = form.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    expect(getComputedStyle(surface).overflow).toBe("visible");
    expect(Math.round(menuRect.left)).toBe(Math.round(formRect.left));
    expect(Math.round(menuRect.right)).toBe(Math.round(formRect.right));
    expect(Math.round(menuRect.width)).toBe(Math.round(formRect.width));
    expect(menuRect.bottom).toBeLessThanOrEqual(formRect.top - 7);
    expect(
      requiredButton("/sessions list: List sessions").getBoundingClientRect()
        .height
    ).toBe(32);
    await expect
      .element(
        page.getByRole("button", {
          name: "/sessions list: List sessions",
        })
      )
      .toHaveAttribute("aria-current", "true");

    await userEvent.click(
      page.getByRole("button", { name: "/sessions list: List sessions" })
    );
    await expect.element(input).toHaveValue("/sessions list ");
  });

  test("fits short Select menus and scrolls long ones", async () => {
    await renderControls(
      <TurnSelect
        aria-label="Reasoning effort"
        disabled={false}
        icon={<span aria-hidden="true">R</span>}
        onValueChange={() => undefined}
        options={Array.from({ length: 20 }, (_, index) => ({
          label: `Level ${index + 1}`,
          value: String(index + 1),
        }))}
        value="1"
      />
    );

    await userEvent.click(
      page.elementLocator(requiredButton("Reasoning effort"))
    );
    const longPopup = requiredSelectPopup();
    expect(longPopup.clientHeight).toBeLessThanOrEqual(288);
    expect(longPopup.scrollHeight).toBeGreaterThan(longPopup.clientHeight);
    expect(getComputedStyle(longPopup).overflowY).toBe("auto");

    await userEvent.keyboard("{Escape}");
    flushSync(() => root?.unmount());
    root = undefined;
    await renderControls(
      <TurnSelect
        aria-label="Service tier"
        disabled={false}
        icon={<span aria-hidden="true">S</span>}
        onValueChange={() => undefined}
        options={[
          { label: "Standard", value: "" },
          { label: "Fast", value: "fast" },
        ]}
        value=""
      />
    );

    await userEvent.click(page.elementLocator(requiredButton("Service tier")));
    const shortPopup = requiredSelectPopup();
    expect(
      shortPopup.scrollHeight - shortPopup.clientHeight
    ).toBeLessThanOrEqual(1);
    expect(shortPopup.clientHeight).toBeLessThan(168);
  });

  test("groups searchable model, reasoning, and speed controls", async () => {
    const onModelChange = vi.fn();
    const onReasoningEffortChange = vi.fn();
    const onServiceTierChange = vi.fn();
    await renderControls(
      <RunConfigurationMenu
        disabled={false}
        modelOptions={[
          { label: "GPT 5.6 Sol", value: "gpt-5.6-sol" },
          { label: "GPT 5.6 Terra", value: "gpt-5.6-terra" },
          { label: "GPT 5.6 Luna", value: "gpt-5.6-luna" },
          ...Array.from({ length: 17 }, (_, index) => ({
            label: `Test Model ${index + 1}`,
            value: `test-model-${index + 1}`,
          })),
        ]}
        modelValue="gpt-5.6-sol"
        onModelChange={onModelChange}
        onReasoningEffortChange={onReasoningEffortChange}
        onServiceTierChange={onServiceTierChange}
        reasoningEffortOptions={[
          { label: "Default", value: "" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" },
        ]}
        reasoningEffortValue="medium"
        serviceTierOptions={[
          { label: "Standard", value: "" },
          { label: "Fast", value: "fast" },
        ]}
        serviceTierValue=""
      />
    );

    await userEvent.click(
      page.getByRole("button", { name: "Run configuration" })
    );
    await expect
      .element(page.getByRole("menuitem", { name: /Model/ }))
      .toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: /Reasoning/ }))
      .toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: /Speed/ }))
      .toBeVisible();
    const configurationPopup = document.querySelector<HTMLElement>(
      '[data-slot="menu-popup"][aria-label="Run configuration"]'
    );
    if (!configurationPopup) {
      throw new Error("Run configuration popup was not rendered");
    }
    const popupStyle = getComputedStyle(configurationPopup);
    expect(popupStyle.paddingLeft).toBe("0px");
    expect(popupStyle.paddingRight).toBe("0px");
    expect(popupStyle.paddingTop).toBe("2px");
    expect(popupStyle.paddingBottom).toBe("2px");
    expect(
      document
        .querySelector<HTMLElement>('[data-slot="menu-submenu-trigger"]')
        ?.getBoundingClientRect().height
    ).toBe(28);

    await userEvent.hover(page.getByRole("menuitem", { name: /Model/ }));
    await expect
      .element(page.getByRole("combobox", { name: "Search models" }))
      .toBeVisible();
    const modelOptions = document.querySelector<HTMLElement>(
      '[data-slot="model-menu-options"]'
    );
    if (!modelOptions) {
      throw new Error("Model options were not rendered");
    }
    expect(modelOptions.scrollHeight).toBeGreaterThan(
      modelOptions.clientHeight
    );
    expect(getComputedStyle(modelOptions).overflowY).toBe("auto");
    const search = page.getByRole("combobox", { name: "Search models" });
    await expect.element(search).toHaveFocus();
    await userEvent.fill(search, "luna");

    await expect.element(page.getByText("GPT 5.6 Luna")).toBeVisible();
    expect(
      document
        .querySelector<HTMLElement>('[data-slot="menu-item"]')
        ?.getBoundingClientRect().height
    ).toBe(28);
    expect(document.body.textContent).not.toContain("GPT 5.6 Terra");
    await userEvent.click(page.getByRole("menuitem", { name: "GPT 5.6 Luna" }));
    expect(onModelChange).toHaveBeenCalledWith("gpt-5.6-luna");
  });
});

function SlashMenuHarness() {
  const [value, setValue] = useState("");
  const suggestions = value.startsWith("/")
    ? [
        {
          description: "List sessions",
          icon: Terminal,
          insertText: "/sessions list ",
          label: "/sessions list",
        },
      ]
    : [];
  return (
    <div style={{ marginTop: 300, width: 480 }}>
      <PromptComposer.Root
        onSubmit={(event) => event.preventDefault()}
        onValueChange={setValue}
        surfaceXstyle={styles.composerSurface}
        value={value}
        xstyle={styles.composer}
      >
        <PromptComposer.Input aria-label="Composer" rows={2} />
        <ComposerSlashMenu
          activeIndex={0}
          menuId="slash-menu-test"
          onActiveIndexChange={() => undefined}
          onSelect={(item) => setValue(item.insertText)}
          suggestions={suggestions}
        />
        <PromptComposer.Toolbar xstyle={styles.composerFooter} />
      </PromptComposer.Root>
    </div>
  );
}

async function renderControls(children: ReactNode) {
  if (!container) {
    throw new Error("Browser test container is missing");
  }
  root = createRoot(container);
  flushSync(() => {
    root?.render(<ThemeScope>{children}</ThemeScope>);
  });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function requiredButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
  if (!button) {
    throw new Error(`${label} trigger was not rendered`);
  }
  return button;
}

function requiredSelectPopup() {
  const popup = document.querySelector<HTMLElement>(
    '[data-slot="select-popup"]'
  );
  if (!popup) {
    throw new Error("Select popup was not rendered");
  }
  return popup;
}
