import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { PromptComposer } from "../../components/lenso/recipes/prompt-composer";
import { AgentComposerInput } from "./agent-composer-input";
import type { AgentContextReference } from "./agent-runtime";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
});
test("rich draft retains Markdown, selects a Skill and handles keyboard commands", async () => {
  const sent = vi.fn();
  const action = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState("**Important**");
    const [refs, setRefs] = useState<AgentContextReference[]>([]);
    return (
      <ThemeScope>
        <PromptComposer.Root
          value={draft}
          onValueChange={setDraft}
          onSubmit={(event) => {
            event.preventDefault();
            sent(draft, refs);
          }}
        >
          <AgentComposerInput
            draft={draft}
            onChange={setDraft}
            references={refs}
            onReferencesChange={setRefs}
            placeholder="Write…"
            actions={[
              {
                id: "status",
                label: "Status",
                description: "Inspect context",
                run: action,
              },
            ]}
            contextCatalog={{
              prompts: [
                {
                  source: "skills",
                  name: "review",
                  description: "Review changes",
                  argumentsSchemaJson: "{}",
                },
              ],
              resources: [],
            }}
          />
        </PromptComposer.Root>
      </ThemeScope>
    );
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root?.render(<Harness />));
  await expect
    .element(page.getByText("Important", { exact: true }))
    .toBeVisible();
  expect(container.querySelector("strong")?.textContent).toBe("Important");
  const input = page.getByRole("textbox", {
    name: "Send a message to Lenso Agent",
  });
  await input.fill("/rev");
  await expect
    .element(page.getByRole("option", { name: "review Review changes" }))
    .toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByRole("button", { name: "Remove review" }))
    .toBeVisible();
  expect(sent).not.toHaveBeenCalled();
  await input.fill("Please review");
  await userEvent.keyboard("{Enter}");
  expect(sent).toHaveBeenCalledWith("Please review", [
    { kind: "prompt", source: "skills", name: "review" },
  ]);
  await input.fill("/sta");
  await userEvent.keyboard("{Enter}");
  expect(action).toHaveBeenCalledOnce();
  await input.fill("@");
  await expect
    .element(page.getByRole("option", { name: /Files and images/ }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(page.getByRole("listbox", { name: "Add context" }))
    .not.toBeInTheDocument();
  await input.fill("/table");
  await userEvent.keyboard("{Enter}");
  expect(container.querySelector("table")).not.toBeNull();
  const sendsBeforeEditing = sent.mock.calls.length;
  await userEvent.keyboard("Cell{Enter}");
  expect(sent).toHaveBeenCalledTimes(sendsBeforeEditing);
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  expect(sent).toHaveBeenCalledTimes(sendsBeforeEditing + 1);
  expect(sent.mock.lastCall?.[0]).toContain("| Cell");
});
