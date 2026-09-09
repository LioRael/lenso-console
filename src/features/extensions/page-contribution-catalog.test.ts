import { describe, expect, it } from "vitest";

import { parsePageCatalog } from "./page-contribution-catalog";

describe("parsePageCatalog", () => {
  it("accepts an admitted Console mount", () => {
    expect(
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [
          {
            apiMajor: 1,
            id: "observe",
            module: "/api/console/v1/pages/observe/assets/page.mjs",
            navigation: {
              items: [{ label: "Home", path: [] }],
              label: "Observe",
            },
            styles: ["/api/console/v1/pages/observe/assets/page.css"],
            subject: "console",
            title: "Observe",
          },
        ],
      })
    ).toHaveLength(1);
  });

  it("rejects duplicate mounts and arbitrary module origins", () => {
    const mount = {
      apiMajor: 1,
      id: "observe",
      module: "https://example.com/page.mjs",
      navigation: { items: [], label: "Observe" },
      styles: [],
      subject: "console",
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
            ...mount,
            module: "/api/console/v1/pages/observe/assets/page.mjs",
          },
          {
            ...mount,
            module: "/api/console/v1/pages/observe/assets/page.mjs",
          },
        ],
      })
    ).toThrow("malformed");
  });

  it("rejects assets owned by another mount or containing traversal", () => {
    const mount = {
      apiMajor: 1,
      id: "observe",
      module: "/api/console/v1/pages/users/assets/page.mjs",
      navigation: { items: [], label: "Observe" },
      styles: [],
      subject: "console",
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
            ...mount,
            module: "/api/console/v1/pages/observe/assets/nested/../page.mjs",
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
            apiMajor: 1,
            id: "observe",
            module: "/api/console/v1/pages/observe/assets/page.mjs",
            navigation: {
              items: [{ label: "Escape", path: [".."] }],
              label: "Observe",
            },
            styles: [],
            subject: "console",
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
            apiMajor: 1,
            id: "observe",
            module: "/api/console/v1/pages/observe/assets/page.mjs",
            navigation: {
              items: [
                { label: "Home", path: [] },
                { label: "Also home", path: [] },
              ],
              label: "Observe",
            },
            styles: [],
            subject: "console",
            title: "Observe",
          },
        ],
      })
    ).toThrow("malformed");
  });
});
