import { expect, test } from "vitest";

import {
  consoleApiPath,
  consoleAuthPath,
  parseConsoleHttpPaths,
} from "./console-http-paths";

test("fixed instance paths preserve query bytes and reject ambiguous bootstrap authority", () => {
  const user = parseConsoleHttpPaths({
    shell_base_path: "/console",
    api_base_path: "/console/api",
    auth_base_path: "/auth",
  });
  const admin = parseConsoleHttpPaths({
    shell_base_path: "/admin",
    api_base_path: "/admin/api",
    auth_base_path: "/auth/operator",
  });
  expect(consoleApiPath("/api/console/v1/session?realm=accounts", admin)).toBe(
    "/admin/api/console/v1/session?realm=accounts"
  );
  expect(consoleApiPath("/api/console/v1/session", user)).toBe(
    "/console/api/console/v1/session"
  );
  expect(consoleApiPath("/admin/api/console/v1/session", admin)).toBe(
    "/admin/api/console/v1/session"
  );
  expect(consoleApiPath("/apiary/v1", admin)).toBe("/apiary/v1");
  expect(consoleAuthPath("methods", admin)).toBe("/auth/operator/methods");
  for (const invalid of [
    null,
    [],
    { realm: "operators" },
    { shell_base_path: "/admin/" },
    { shell_base_path: "/admin/../console" },
    { api_base_path: "//other/api" },
    { api_base_path: "/auth/operator" },
    { auth_base_path: "/" },
    { shell_base_path: "/api/ui" },
  ]) {
    expect(() => parseConsoleHttpPaths(invalid)).toThrow(TypeError);
  }
});

test("workspace sources cannot select external or conflicting authority", () => {
  const source = {
    id: "operations",
    account_issuer: "relay.accounts.local",
    shell_base_path: "/admin",
    api_base_path: "/admin/api",
    auth_base_path: "/auth/operator",
    mounts: [
      {
        id: "relay.operations",
        base_path: "/operations/",
        navigation_checks: [
          {
            path: [],
            service_id: "relay-operator-actions",
            operation: "describe_permissions",
            fields: ["can_list_requests"],
          },
        ],
      },
    ],
  };
  expect(
    parseWorkspaceSourceBootstrap([source]).workspace_sources?.[0]
      ?.api_base_path
  ).toBe("/admin/api");
  for (const override of [
    { api_base_path: "https://other/admin/api" },
    { api_base_path: "/console/api/private" },
    { auth_base_path: "/admin/api/auth" },
    { shell_base_path: "/admin/api/shell" },
    { account_issuer: "<script>" },
    { mounts: [{ ...source.mounts[0], base_path: "/settings/" }] },
    { mounts: [{ ...source.mounts[0], base_path: "/operations/%2f/" }] },
    { mounts: [{ ...source.mounts[0], navigation_checks: [] }] },
  ]) {
    expect(() =>
      parseWorkspaceSourceBootstrap([{ ...source, ...override }])
    ).toThrow(TypeError);
  }
  expect(() => parseWorkspaceSourceBootstrap([source, source])).toThrow(
    TypeError
  );
});

const parseWorkspaceSourceBootstrap = (workspace_sources: unknown) =>
  parseConsoleHttpPaths({
    shell_base_path: "/console",
    api_base_path: "/console/api",
    auth_base_path: "/auth",
    workspace_sources,
  });
