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
  // Losing the declaration erases mode admission and scope identity; accepting
  // an undeclared method would allow subscribe to dispatch outside the mount.
  it("preserves only unique streaming declarations that are admitted operations", () => {
    const requirement = {
      available: true,
      capability_id: "notes@1",
      descriptor_version: "1",
      operations: ["read", "ticks"],
      streaming_operations: ["ticks"],
      required: true,
      service_id: "notes",
      source: "owner",
    };
    const mount = {
      ...ownership,
      apiMajor: 1,
      protocol: "lenso-console-rpc/2",
      id: "observe",
      module: `${observeAssets}/page.mjs`,
      styles: [],
      navigation: { items: [], label: "Observe" },
      subject: { kind: "console" },
      title: "Observe",
      requirements: [requirement],
    };
    const catalog = { schema: "console.page-catalog/1", mounts: [mount] };
    expect(parsePageCatalog(catalog)[0]!.requirements).toEqual([requirement]);
    for (const streaming_operations of [
      ["ticks", "ticks"],
      ["write"],
      [1],
      "ticks",
      null,
    ]) {
      expect(() =>
        parsePageCatalog({
          ...catalog,
          mounts: [
            {
              ...mount,
              requirements: [{ ...requirement, streaming_operations }],
            },
          ],
        })
      ).toThrow("malformed");
    }
  });

  // An unavailable backend capability can legitimately have no authorized
  // operations; rejecting it discards unrelated active mounts in the catalog.
  it("accepts empty operations only for unavailable requirements in mixed catalogs", () => {
    const activeRequirement = {
      available: true,
      capability_id: "notes@1",
      descriptor_version: "1",
      operations: ["read"],
      required: true,
      service_id: "notes",
      source: "owner",
    };
    const inactiveRequirement = {
      ...activeRequirement,
      available: false,
      operations: [],
    };
    const mount = {
      ...ownership,
      apiMajor: 1,
      id: "observe",
      module: `${observeAssets}/page.mjs`,
      styles: [],
      navigation: { items: [], label: "Observe" },
      subject: { kind: "console" },
      title: "Observe",
    };
    const inactiveMount = {
      ...mount,
      id: "inactive",
      module: `/api/console/v1/pages/inactive/assets/${digest}/page.mjs`,
      requirements: [inactiveRequirement],
    };
    const activeMount = { ...mount, requirements: [activeRequirement] };
    const catalog = {
      schema: "console.page-catalog/1",
      mounts: [inactiveMount, activeMount],
    };

    expect(parsePageCatalog(catalog).map(({ id }) => id)).toEqual([
      "inactive",
      "observe",
    ]);
    expect(() =>
      parsePageCatalog({
        ...catalog,
        mounts: [
          {
            ...inactiveMount,
            requirements: [{ ...inactiveRequirement, available: true }],
          },
          activeMount,
        ],
      })
    ).toThrow("malformed");
  });

  it.each(["/ops/api", "/operations/api", "/api/external"])(
    "preserves deployed assets and target identity under the admitted %s prefix",
    (api_base_path) => {
      const assets = `${api_base_path}/console/v1/pages/observe/assets/${digest}`;
      const mount = {
        ...ownership,
        apiMajor: 1,
        protocol: "lenso-console-rpc/2",
        id: "observe",
        targetId: "ops-one",
        implementationId: digest,
        module: `${assets}/page.mjs`,
        styles: [`${assets}/page.css`],
        navigation: { items: [], label: "Observe" },
        subject: { kind: "console" },
        title: "Observe",
      };
      const catalog = { schema: "console.page-catalog/1", mounts: [mount] };
      expect(parsePageCatalog(catalog, { api_base_path })).toEqual([mount]);
      expect(() => parsePageCatalog(catalog)).toThrow("malformed");
      for (const module of [
        `${observeAssets}/page.mjs`,
        `${api_base_path}-other/console/v1/pages/observe/assets/${digest}/page.mjs`,
        `${api_base_path}/console/v1/pages/other/assets/${digest}/page.mjs`,
        `${assets}/../page.mjs`,
        `${assets}/%2e%2e/page.mjs`,
        `${assets}/nested%2fpage.mjs`,
        `${assets}/nested\\page.mjs`,
        `${assets}//page.mjs`,
        `${assets}/page.mjs?asset=other`,
        `${assets}/page.mjs#other`,
        `https://console.test${assets}/page.mjs`,
        `//console.test${assets}/page.mjs`,
      ]) {
        expect(() =>
          parsePageCatalog(
            { ...catalog, mounts: [{ ...mount, module }] },
            { api_base_path }
          )
        ).toThrow("malformed");
      }
      for (const styles of [
        [`${observeAssets}/page.css`],
        [`${api_base_path}/console/v1/pages/other/assets/${digest}/page.css`],
        [
          `${api_base_path}/console/v1/pages/observe/assets/${"b".repeat(64)}/page.css`,
        ],
      ]) {
        expect(() =>
          parsePageCatalog(
            { ...catalog, mounts: [{ ...mount, styles }] },
            { api_base_path }
          )
        ).toThrow("malformed");
      }
      for (const targetId of ["../ops", "Ops", "", null, "a".repeat(65)]) {
        expect(() =>
          parsePageCatalog(
            { ...catalog, mounts: [{ ...mount, targetId }] },
            { api_base_path }
          )
        ).toThrow("malformed");
      }
    }
  );

  it.each([undefined, "workspace-http/1"])(
    "resolves only canonical legacy %s assets against the trusted deployment",
    (protocol) => {
      const mount = {
        ...ownership,
        apiMajor: 1,
        ...(protocol ? { protocol } : {}),
        id: "observe",
        implementationId: digest,
        module: `${observeAssets}/page.mjs`,
        styles: [`${observeAssets}/page.css`],
        navigation: { items: [], label: "Observe" },
        subject: { kind: "console" },
        title: "Observe",
      };
      for (const api_base_path of ["/ops/api", "/admin/api"]) {
        const catalog = { schema: "console.page-catalog/1", mounts: [mount] };
        expect(parsePageCatalog(catalog, { api_base_path })).toEqual([
          {
            ...mount,
            module: `${api_base_path}/console/v1/pages/observe/assets/${digest}/page.mjs`,
            styles: [
              `${api_base_path}/console/v1/pages/observe/assets/${digest}/page.css`,
            ],
          },
        ]);
        for (const invalid of [
          { ...mount, module: `${observeAssets}/../page.mjs` },
          { ...mount, module: `/unadmitted${mount.module}` },
          { ...mount, styles: [`/unadmitted${mount.styles[0]}`] },
          { ...mount, protocol: "lenso-console-rpc/2" },
        ]) {
          expect(() =>
            parsePageCatalog(
              { ...catalog, mounts: [invalid] },
              { api_base_path }
            )
          ).toThrow("malformed");
        }
      }
    }
  );

  it("keeps one implementation identity across two distinct instance mounts", () => {
    const mounts = ["alpha", "beta"].map((id) => ({
      ...ownership,
      apiMajor: 1,
      protocol: "lenso-console-rpc/2",
      id,
      pageId: "observe",
      implementationId: digest,
      owner: { ...ownership.owner, instance: `observe/${id}` },
      module: `/api/console/v1/pages/${id}/assets/${digest}/page.mjs`,
      navigation: { items: [], label: id },
      styles: [],
      subject: { kind: "console" },
      title: id,
      credentials: {
        issuePath: "/credentials/issue",
        rotatePath: "/credentials/rotate",
      },
    }));
    expect(
      parsePageCatalog({ schema: "console.page-catalog/1", mounts })
    ).toMatchObject(mounts);
    expect(() =>
      parsePageCatalog({
        schema: "console.page-catalog/1",
        mounts: [{ ...mounts[0], implementationId: "b".repeat(64) }],
      })
    ).toThrow("malformed");
  });
  it.each([
    ["application", true],
    ["resolved-plan", true],
    ["development-filesystem", false],
  ] as const)(
    "accepts an admitted Console mount from %s with trust %s",
    (source, trusted) => {
      expect(
        parsePageCatalog({
          schema: "console.page-catalog/1",
          mounts: [
            {
              ...ownership,
              owner: { ...ownership.owner, source, trusted },
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
      expect(() =>
        parsePageCatalog({
          schema: "console.page-catalog/1",
          mounts: [
            {
              ...ownership,
              owner: { ...ownership.owner, source, trusted: !trusted },
              apiMajor: 1,
              id: "observe",
              module: `${observeAssets}/page.mjs`,
              navigation: { items: [], label: "Observe" },
              styles: [],
              subject: { kind: "console" },
              title: "Observe",
            },
          ],
        })
      ).toThrow("malformed");
    }
  );

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
