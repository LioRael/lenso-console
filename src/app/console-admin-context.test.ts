import { describe, expect, test } from "vitest";

import { consoleAdminActorLabel } from "./console-admin-context";

describe("console admin context", () => {
  test("formats admin actor labels", () => {
    expect(
      consoleAdminActorLabel({
        kind: "service",
        service_id: "admin",
      })
    ).toBe("service:admin");
    expect(
      consoleAdminActorLabel({
        kind: "user",
        user_id: "usr_admin",
      })
    ).toBe("user:usr_admin");
    expect(consoleAdminActorLabel({ kind: "system" })).toBe("system");
  });
});
