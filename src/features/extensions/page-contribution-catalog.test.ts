import { describe, expect, it } from "vitest";

import { parsePageCatalog } from "./page-contribution-catalog";

const ownership = {
  owner: { instance: "observe.plugin", source: "resolved-plan", trusted: true },
  requirements: [],
  revision: "1.0.0",
} as const;
const digest = "a".repeat(64);
const observeAssets = `/api/console/v1/pages/observe/assets/${digest}`;

describe("parsePageCatalog", () => {
  it("accepts an admitted Console mount", () => {
    expect(
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [
          {
            ...ownership,
            apiMajor: 1,
            id: "observe",
            module: `${observeAssets}/page.mjs`,
            navigation: {
              items: [{ label: "Home", path: [] }],
              label: "Observe",
            },
            styles: [`${observeAssets}/page.css`],
            subject: { kind: "console" },
            title: "Observe",
          },
        ],
      })
    ).toHaveLength(1);
  });

  it("rejects duplicate mounts and arbitrary module origins", () => {
    const mount = {
      ...ownership,
      apiMajor: 1,
      id: "observe",
      module: "https://example.com/page.mjs",
      navigation: { items: [], label: "Observe" },
      styles: [],
      subject: { kind: "console" },
      title: "Observe",
    };
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [mount],
      })
    ).toThrow("malformed");
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [
          {
            ...ownership,
            ...mount,
            module: `${observeAssets}/page.mjs`,
          },
          {
            ...ownership,
            ...mount,
            module: `${observeAssets}/page.mjs`,
          },
        ],
      })
    ).toThrow("malformed");
  });

  it("rejects assets owned by another mount or containing traversal", () => {
    const mount = {
      ...ownership,
      apiMajor: 1,
      id: "observe",
      module: `/api/console/v1/pages/users/assets/${digest}/page.mjs`,
      navigation: { items: [], label: "Observe" },
      styles: [],
      subject: { kind: "console" },
      title: "Observe",
    };
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [mount],
      })
    ).toThrow("malformed");
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [
          {
            ...ownership,
            ...mount,
            module: `${observeAssets}/nested/../page.mjs`,
          },
        ],
      })
    ).toThrow("malformed");
  });

  it("rejects navigation paths that can escape the workspace", () => {
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [
          {
            ...ownership,
            apiMajor: 1,
            id: "observe",
            module: `${observeAssets}/page.mjs`,
            navigation: {
              items: [{ label: "Escape", path: [".."] }],
              label: "Observe",
            },
            styles: [],
            subject: { kind: "console" },
            title: "Observe",
          },
        ],
      })
    ).toThrow("malformed");
  });

  it("rejects duplicate navigation destinations", () => {
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [
          {
            ...ownership,
            apiMajor: 1,
            id: "observe",
            module: `${observeAssets}/page.mjs`,
            navigation: {
              items: [
                { label: "Home", path: [] },
                { label: "Also home", path: [] },
              ],
              label: "Observe",
            },
            styles: [],
            subject: { kind: "console" },
            title: "Observe",
          },
        ],
      })
    ).toThrow("malformed");
  });

  it("accepts an App subject and rejects contradictory subject fields", () => {
    const appMount = {
      ...ownership,
      apiMajor: 1,
      id: "observe",
      module: `${observeAssets}/page.mjs`,
      navigation: { items: [], label: "Observe" },
      styles: [],
      subject: { appId: "support", kind: "app" },
      title: "Observe",
    };
    expect(
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [appMount],
      })
    ).toMatchObject([{ subject: { appId: "support", kind: "app" } }]);
    for (const subject of [
      { kind: "app" },
      { appId: "../support", kind: "app" },
      { appId: "support", kind: "console" },
    ]) {
      expect(() =>
        parsePageCatalog({
          schema: "console.page-catalog/1",
          mounts: [{ ...appMount, subject }],
        })
      ).toThrow("malformed");
    }
  });
});
