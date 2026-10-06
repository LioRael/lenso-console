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
