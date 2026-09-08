import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { AgentProfileEditor } from "./agent-profile-editor";
import type { EditableProfile } from "./agent-profile-model";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  client?.clear();
  vi.unstubAllGlobals();
});
test("Profile editor preserves hidden choices and saves without activation", async () => {
  const template: EditableProfile = {
    name: "default",
    revision: "r0",
    readOnly: true,
    document: {
      agent: "lenso.agent.loop/agent",
      description: "Default",
      instructions: "",
      model: null,
      include_enabled: true,
      instances: [],
      excluded_instances: [],
      allowed_tools: null,
      future_option: "preserve",
    },
  };
  const profiles = [template];
  const saves: EditableProfile["document"][] = [];
  const applies: unknown[] = [];
  let activeProfile = "default";
  let activeRevision = "r0";
  let failSave = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("tool-policy")) {
        return Response.json({
          schema: "lenso.agent.tool-policy.v1",
          revision: 1,
          allowed: ["read"],
          available: ["read", "edit"].map((name) => ({
            name,
            description: name,
          })),
        });
      }
      if (String(input).endsWith("control/profile")) {
        const body = JSON.parse(String(init?.body));
        applies.push(body);
        activeProfile = body.profile;
        activeRevision = body.expectedRevision;
        return Response.json({ profile: activeProfile });
      }
      if (init?.method === "POST") {
        if (failSave) {
          return Response.json(
            { detail: "Revision conflict" },
            { status: 409 }
          );
        }
        const body = JSON.parse(String(init.body));
        saves.push(body.document);
        const saved = {
          name: body.name,
          document: body.document,
          revision: "r1",
          readOnly: false,
        };
        profiles.push(saved);
        return Response.json(saved);
      }
      return Response.json({ profiles, activeProfile, activeRevision });
    })
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const queryClient = client;
  flushSync(() =>
    root?.render(
      <QueryClientProvider client={queryClient}>
        <ThemeScope>
          <AgentProfileEditor
            agent={{
              id: "app",
              label: "Lenso Agent",
              role: "app",
              capabilities: ["lenso.agent.plugin-configuration@1"],
            }}
            items={[]}
            initialProfile={template}
            existingNames={["default"]}
          />
        </ThemeScope>
      </QueryClientProvider>
    )
  );
  await expect
    .element(page.getByRole("button", { name: "Duplicate Profile" }))
    .toBeEnabled();
  await expect
    .element(page.getByRole("textbox", { name: "Profile instructions" }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Duplicate Profile" }).click();
  await page
    .getByRole("textbox", { name: "Profile instructions" })
    .fill("Review carefully.");
  await page
    .getByRole("searchbox", { name: "Search Profile capabilities" })
    .fill("edit");
  await page
    .getByRole("button", { name: "Enable matching", exact: true })
    .first()
    .click();
  await page.getByRole("combobox", { name: "Capability category" }).click();
  await page
    .getByRole("option", { name: "Skills & context · 0", exact: true })
    .click();
  await expect
    .element(page.getByText("No matching capabilities", { exact: true }))
    .toBeVisible();
  await page.getByRole("combobox", { name: "Capability category" }).click();
  await page.getByRole("option", { name: "Tools · 2", exact: true }).click();
  expect(saves).toHaveLength(0);
  expect(applies).toHaveLength(0);
  await expect
    .element(page.getByRole("switch", { name: "Profile tool edit" }))
    .toBeDisabled();
  await page.getByRole("combobox", { name: "Approval mode" }).click();
  await page
    .getByRole("option", {
      name: "Help me approve · AI reviews actions; asks you when uncertain",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]?.allowed_tools).toEqual(["read"]);
  expect(saves[0]?.future_option).toBe("preserve");
  expect(saves[0]?.approval_mode).toBe("assisted");
  expect(applies).toHaveLength(0);
  await expect
    .element(page.getByRole("button", { name: "Apply Profile" }))
    .not.toBeInTheDocument();
  await page
    .getByRole("textbox", { name: "Profile instructions" })
    .fill("Keep this draft after a conflict.");
  failSave = true;
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Revision conflict");
  await expect
    .element(page.getByRole("textbox", { name: "Profile instructions" }))
    .toHaveValue("Keep this draft after a conflict.");
});
