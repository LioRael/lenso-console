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

function renderFields(schema: JsonObject, initial: string) {
  current = initial;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  function Editor() {
    const [toml, setToml] = useState(initial);
    return (
      <ThemeScope>
        <PluginConfigurationFields
          defaults={{}}
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
