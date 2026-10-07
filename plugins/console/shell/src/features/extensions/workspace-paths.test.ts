import { expect, test } from "vitest";

import type { PageMount } from "./page-contribution-catalog";
import { resolveWorkspaceLocation, workspacePagePath } from "./workspace-paths";

const mount = (
  id: string,
  basePath: string,
  routes: string[][]
): PageMount => ({
  apiMajor: 1,
  basePath,
  id,
  module: "page.mjs",
  navigation: { items: [], label: id },
  owner: { instance: `${id}/default`, source: "resolved-plan", trusted: true },
  requirements: [],
  revision: "1",
  routes,
  styles: [],
  subject: { kind: "console" },
  title: id,
});

// Existing outlet coverage uses named prefixes. A root mount must neither swallow
// another mount nor mistake an authored dotted page for a static asset.
test("resolves registered root and instance routes with segment boundaries", () => {
  const root = mount("root", "/", [
    [],
    ["administrator"],
    ["admin-tools"],
    ["release.v1"],
  ]);
  const user = mount("user", "/user-one/", [
    [],
    ["details"],
    ["items", "[id]"],
  ]);
  const mounts = [root, user];
  expect(resolveWorkspaceLocation("/administrator/", mounts)?.mount.id).toBe(
    "root"
  );
  expect(resolveWorkspaceLocation("/admin-tools/", mounts)?.mount.id).toBe(
    "root"
  );
  expect(resolveWorkspaceLocation("/release.v1/", mounts)?.mount.id).toBe(
    "root"
  );
  expect(
    resolveWorkspaceLocation("/user-one/items/item-1/", mounts)?.segments
  ).toEqual(["items", "item-1"]);
  expect(
    resolveWorkspaceLocation("/user-one/missing.js", mounts)
  ).toBeUndefined();
  expect(resolveWorkspaceLocation("/admin/", mounts)).toBeUndefined();
  expect(resolveWorkspaceLocation("/favicon.ico", mounts)).toBeUndefined();
  expect(workspacePagePath(root, ["administrator"])).toBe("/administrator/");
  expect(() => workspacePagePath(root, ["admin"])).toThrow("reserved");
  expect(() => workspacePagePath(root, ["user-one", "details"])).toThrow(
    "not registered"
  );
  expect(workspacePagePath(user, ["details"])).toBe("/user-one/details/");
  expect(() => workspacePagePath(user, ["missing"])).toThrow("not registered");
});
