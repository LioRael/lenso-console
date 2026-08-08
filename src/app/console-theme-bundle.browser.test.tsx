import { CONSOLE_THEME_BUNDLE_FORMAT } from "@lenso/console-composition-api";
import { afterEach, describe, expect, test, vi } from "vitest";

import { prepareConsoleThemeBundleActivation } from "./console-theme-bundle";

const receipt = {
  artifactDigest: `sha256:${"b".repeat(64)}` as const,
  basePath: "/artifacts/theme/",
  bundleId: "acme/transactional-theme",
  entries: [
    { name: "composition", path: "index.js" },
    { name: "style", path: "theme.css" },
  ],
  format: CONSOLE_THEME_BUNDLE_FORMAT,
  manifest: {
    assets: [{ kind: "style" as const, name: "style", path: "theme.css" }],
    bundleId: "acme/transactional-theme",
    composition: { entry: "index.js" },
    consoleUi: "^1.0.0",
    defaultVariant: "dark",
    displayName: "Transactional Theme",
    format: CONSOLE_THEME_BUNDLE_FORMAT,
    tokenOverrides: {},
    variants: [{ id: "dark", label: "Dark", mode: "dark" as const }],
    version: "1.0.0",
  },
  version: "1.0.0",
} as const;

afterEach(() => {
  for (const link of document.head.querySelectorAll(
    "link[data-lenso-console-theme-style]"
  )) {
    link.remove();
  }
});

describe("Console Theme Bundle activation transaction", () => {
  test("does not expose staged styles until commit", async () => {
    const importer = vi.fn().mockResolvedValue({
      default: {
        consoleUi: "^1.0.0",
        protocol: "lenso.console-ui-composition.v1",
      },
    });
    const activationPromise = prepareConsoleThemeBundleActivation(receipt, {
      importModule: importer,
      origin: "https://console.example",
    });
    const link = document.head.querySelector<HTMLLinkElement>(
      "link[data-lenso-console-theme-style]"
    );
    expect(link?.media).toBe("not all");
    link?.dispatchEvent(new Event("load"));

    const transaction = await activationPromise;
    expect(link?.media).toBe("not all");

    transaction.commit();

    expect(link?.media).toBe("");
    expect(link?.dataset.lensoConsoleThemeStyleState).toBeUndefined();

    transaction.rollback();
    expect(link?.isConnected).toBe(false);
  });

  test("rolls back staged styles when Composition import fails", async () => {
    const activationPromise = prepareConsoleThemeBundleActivation(receipt, {
      importModule: vi.fn().mockRejectedValue(new Error("import failed")),
      origin: "https://console.example",
    });
    const link = document.head.querySelector<HTMLLinkElement>(
      "link[data-lenso-console-theme-style]"
    );
    link?.dispatchEvent(new Event("load"));

    await expect(activationPromise).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(
      document.head.querySelector("link[data-lenso-console-theme-style]")
    ).toBeNull();
  });

  test("keeps another transaction's staged style isolated", async () => {
    const importer = vi.fn().mockResolvedValue({
      default: {
        consoleUi: "^1.0.0",
        protocol: "lenso.console-ui-composition.v1",
      },
    });
    const firstPromise = prepareConsoleThemeBundleActivation(receipt, {
      importModule: importer,
      origin: "https://console.example",
    });
    const secondPromise = prepareConsoleThemeBundleActivation(receipt, {
      importModule: importer,
      origin: "https://console.example",
    });
    const links = document.head.querySelectorAll(
      "link[data-lenso-console-theme-style]"
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      link.dispatchEvent(new Event("load"));
    }

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    first.commit();
    expect(
      document.head.querySelectorAll("link[data-lenso-console-theme-style]")
    ).toHaveLength(2);

    second.rollback();
    expect(
      document.head.querySelectorAll("link[data-lenso-console-theme-style]")
    ).toHaveLength(1);
    first.rollback();
  });
});
