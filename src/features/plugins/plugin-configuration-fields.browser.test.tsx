import { ThemeScope } from "@lenso/ui/theme-scope";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { parse } from "smol-toml";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";

import { PluginConfigurationFields } from "./plugin-configuration-fields";
import type { JsonObject } from "./plugin-control-contract";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let current = "";

afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
});

function renderFields(
  schema: JsonObject,
  initial: string,
  defaults: JsonObject = {}
) {
  current = initial;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  function Editor() {
    const [toml, setToml] = useState(initial);
    return (
      <ThemeScope>
        <PluginConfigurationFields
          defaults={defaults}
          disabled={false}
          schema={schema}
          toml={toml}
          onChange={(next) => {
            current = next;
            setToml(next);
          }}
        />
      </ThemeScope>
    );
  }
  flushSync(() => root?.render(<Editor />));
}

test("edits prompt contribution content as multiline text without changing sibling fields", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        contributions: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "content"],
            properties: { id: { type: "string" }, content: { type: "string" } },
          },
        },
      },
    },
    '[[contributions]]\nid = "instructions"\ncontent = "first\\nsecond"'
  );
  const content = page.getByRole("textbox", { name: "Content", exact: true });
  await expect.element(content).toHaveValue("first\nsecond");
  expect(
    container?.querySelector('textarea[aria-label="Content"]')
  ).toBeTruthy();
  await content.fill("First paragraph\n\n  Keep indentation\n最后一行");
  expect(parse(current).contributions).toEqual([
    {
      id: "instructions",
      content: "First paragraph\n\n  Keep indentation\n最后一行",
    },
  ]);
  await content.fill("One line now");
  expect(
    container?.querySelector('textarea[aria-label="Content"]')
  ).toBeTruthy();
  await page.getByRole("button", { name: "Collapse Content editor" }).click();
  await expect.element(content).toHaveValue("One line now");
});

test("expands an empty string editor without changing the draft", async () => {
  renderFields(
    { type: "object", properties: { instruction: { type: "string" } } },
    ""
  );
  await page.getByRole("button", { name: "Expand Instruction editor" }).click();
  expect(current).toBe("");
  await page
    .getByRole("textbox", { name: "Instruction", exact: true })
    .fill("line one\nline two");
  expect(parse(current).instruction).toBe("line one\nline two");
});

test("multiline paste preserves selection suffix and focuses the expanded editor", () => {
  renderFields(
    {
      type: "object",
      properties: { instruction: { type: "string", maxLength: 12 } },
    },
    'instruction = "abcXYZ"'
  );
  const input = container!.querySelector<HTMLInputElement>(
    'input[aria-label="Instruction"]'
  )!;
  input.setSelectionRange(0, 3);
  const data = new DataTransfer();
  data.setData("text/plain", "one\ntwo");
  flushSync(() =>
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  expect(parse(current).instruction).toBe("one\ntwoXYZ");
  const area = container!.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Instruction"]'
  )!;
  expect(document.activeElement).toBe(area);
  expect(area.selectionStart).toBe(7);
});

test("searches schema metadata and retains nested field edits when clearing the filter", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        network: {
          title: "Networking",
          type: "object",
          properties: {
            endpoint: { type: "string", description: "Server address" },
            retries: { type: "integer" },
          },
        },
        name: { type: "string" },
        token: { type: "string", writeOnly: true, default: "secret-only" },
      },
    },
    'name = "untouched"\n[network]\nendpoint = "before"\nretries = 3'
  );
  const search = page.getByRole("searchbox", {
    name: "Search configuration fields",
  });
  await search.fill("server address");
  await expect
    .element(page.getByRole("textbox", { name: "Endpoint" }))
    .toBeVisible();
  const retries = container?.querySelector('input[type="number"]');
  expect(retries).toBeTruthy();
  expect(retries?.closest("[hidden]")).not.toBeNull();
  await page.getByRole("textbox", { name: "Endpoint" }).fill("after");
  await search.fill("secret-only");
  await expect
    .element(
      page.getByText(
        "No matching fields. Try a field name, path or description."
      )
    )
    .toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Endpoint" }))
    .toHaveValue("after");
  expect(parse(current)).toEqual({
    name: "untouched",
    network: { endpoint: "after", retries: 3 },
  });
});

test("switches root variants while preserving overrides and inherited siblings", async () => {
  renderFields(
    {
      oneOf: [
        {
          title: "Local",
          type: "object",
          required: ["kind"],
          properties: {
            kind: { const: "local" },
            directory: { type: "string" },
          },
        },
        {
          title: "Remote",
          type: "object",
          required: ["kind"],
          properties: {
            kind: { const: "remote" },
            endpoint: { type: "string" },
          },
        },
      ],
    },
    'directory = "keep"',
    { inherited: "host" }
  );
  await page.getByRole("combobox", { name: "Configuration variant" }).click();
  await page.getByRole("option", { name: "Remote", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Endpoint" })
    .fill("https://example.com");
  expect(parse(current)).toEqual({
    directory: "keep",
    kind: "remote",
    endpoint: "https://example.com",
  });
  await page.getByRole("combobox", { name: "Configuration variant" }).click();
  await page.getByRole("option", { name: "Local", exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Directory" }))
    .toHaveValue("keep");
  expect(parse(current).endpoint).toBe("https://example.com");
  expect(parse(current).kind).toBe("local");
});

test("allows explicit choice of overlapping anyOf forms without rewriting values", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        label: {
          anyOf: [
            { title: "Short", type: "string", maxLength: 10 },
            { title: "Long", type: "string", maxLength: 100 },
          ],
        },
      },
    },
    'label = "existing"'
  );
  await page.getByRole("combobox", { name: "Configuration variant" }).click();
  await page.getByRole("option", { name: "Long", exact: true }).click();
  expect(parse(current)).toEqual({ label: "existing" });
  await page.getByRole("textbox", { name: "Long" }).fill("updated");
  expect(parse(current)).toEqual({ label: "updated" });
});

test("keeps protected unions in Advanced without exposing stored values", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        credential: {
          oneOf: [
            { title: "Secret", type: "string", writeOnly: true },
            { title: "Plain", type: "string" },
          ],
        },
      },
    },
    'credential = "stored-secret"'
  );
  expect(container?.textContent).not.toContain("stored-secret");
  await expect
    .element(page.getByRole("combobox", { name: "Configuration variant" }))
    .not.toBeInTheDocument();
  expect(container?.textContent).toContain("Advanced editing");
});

test("renders referenced nullable fields and protects referenced credentials", async () => {
  renderFields(
    {
      type: "object",
      $defs: {
        name: { type: ["string", "null"], title: "Display name" },
        token: { type: "string", writeOnly: true, title: "Access token" },
      },
      properties: {
        name: { $ref: "#/$defs/name" },
        token: { $ref: "#/$defs/token" },
      },
    },
    "",
    { token: "stored-secret" }
  );
  await page.getByRole("textbox", { name: "Display name" }).fill("Agent");
  expect(parse(current)).toEqual({ name: "Agent" });
  expect(container?.textContent).not.toContain("stored-secret");
  expect(
    [...container!.querySelectorAll("input")].map((input) => input.value)
  ).not.toContain("stored-secret");
});

test("edits typed array items without trimming strings and respects collection bounds", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        labels: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: { type: "string" },
        },
      },
    },
    'labels = [" first ", "second"]'
  );
  await expect
    .element(page.getByRole("button", { name: "Add Label", exact: true }))
    .toBeDisabled();
  await page
    .getByRole("textbox", { name: "Label 1", exact: true })
    .fill(" keep spaces ");
  expect(parse(current).labels).toEqual([" keep spaces ", "second"]);
  await page.getByRole("button", { name: "Move Label 2 up" }).click();
  expect(parse(current).labels).toEqual(["second", " keep spaces "]);
  await page.getByRole("button", { name: "Remove Label 1" }).click();
  expect(parse(current).labels).toEqual([" keep spaces "]);
  await expect
    .element(page.getByRole("button", { name: "Remove Label 1" }))
    .toBeDisabled();
});

test("restores one inherited field without promoting or removing sibling values", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        options: {
          type: "object",
          properties: { first: { type: "string" }, second: { type: "string" } },
        },
      },
    },
    '[options]\nfirst = "override"',
    { options: { first: "default", second: "untouched" } }
  );
  await page
    .getByRole("textbox", { name: "Second", exact: true })
    .fill("edited");
  expect(parse(current)).toEqual({
    options: { first: "override", second: "edited" },
  });
  await page.getByRole("button", { name: "Reset First", exact: true }).click();
  expect(parse(current)).toEqual({ options: { second: "edited" } });
  await expect
    .element(page.getByRole("textbox", { name: "First", exact: true }))
    .toHaveValue("default");
  await page.getByRole("button", { name: "Reset Second", exact: true }).click();
  expect(parse(current)).toEqual({});
});

test("shows native format errors next to the field", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        code: { type: "string", pattern: "^[A-Z]+$" },
        other: { type: "string" },
      },
    },
    'code = "OK"'
  );
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("wrong");
  await page.getByRole("textbox", { name: "Other", exact: true }).click();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Use the required format.");
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("RIGHT");
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
});

test("edits dynamic keys without overwriting collisions or changing fixed fields", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        headers: {
          type: "object",
          properties: { fixed: { type: "string" } },
          additionalProperties: { type: "string" },
        },
      },
    },
    '[headers]\nfixed = "kept"\nfirst = "one"\nsecond = "two"'
  );
  await page
    .getByRole("textbox", { name: "Key first", exact: true })
    .fill("second");
  await page.getByRole("textbox", { name: "New Headers key" }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  expect(parse(current).headers).toEqual({
    fixed: "kept",
    first: "one",
    second: "two",
  });
  await page
    .getByRole("textbox", { name: "Key first", exact: true })
    .fill("renamed");
  await page.getByRole("textbox", { name: "New Headers key" }).click();
  expect(parse(current).headers).toEqual({
    fixed: "kept",
    renamed: "one",
    second: "two",
  });
  await page.getByRole("textbox", { name: "New Headers key" }).fill("third");
  await page.getByRole("button", { name: "Add entry" }).click();
  expect(parse(current).headers).toEqual({
    fixed: "kept",
    renamed: "one",
    second: "two",
    third: "",
  });
});

test("does not hydrate sensitive map or array values into inputs", async () => {
  renderFields(
    {
      type: "object",
      properties: {
        secrets: {
          type: "object",
          additionalProperties: { type: "string", writeOnly: true },
        },
        tokens: {
          type: "array",
          items: { type: "string", format: "password" },
        },
      },
    },
    '[secrets]\napi = "stored-private"\n'
  );
  const input = container?.querySelector<HTMLInputElement>(
    'input[type="password"]'
  );
  expect(input?.value).toBe("");
  expect(container?.textContent).not.toContain("stored-private");
  await page.getByRole("button", { name: "Add Token", exact: true }).click();
  expect(container?.querySelectorAll('input[type="password"]').length).toBe(2);
  expect(parse(current).secrets).toEqual({ api: "stored-private" });
});
