import { describe, expect, test } from "vitest";

import {
  type MockConsoleFixtures,
  mockAdminRecords,
  mockAvailableCapabilities,
  mockSlotContributions,
} from "./mock-console-host-api";

describe("mock console host api", () => {
  test("returns empty admin records when no fixture exists", () => {
    expect(
      mockAdminRecords(
        {},
        {
          entityName: "users",
          moduleName: "auth",
        }
      )
    ).toEqual({
      data: [],
      page: {
        limit: 50,
        next_cursor: null,
      },
    });
  });

  test("returns fixture-backed admin records", () => {
    const fixtures = {
      adminData: {
        auth: {
          users: [{ id: "usr_1", status: "active" }],
        },
      },
      capabilities: ["auth.users.read"],
    };

    expect(
      mockAdminRecords(fixtures, {
        entityName: "users",
        moduleName: "auth",
      }).data
    ).toEqual([{ id: "usr_1", status: "active" }]);
    expect(mockAvailableCapabilities(fixtures)).toEqual(["auth.users.read"]);
  });

  test("returns slot contributions from fixtures", () => {
    const fixtures: MockConsoleFixtures = {
      contributions: {
        "auth.users.detail.actions": [
          {
            actionName: "reset_password",
            input: { user_id: "usr_1" },
            key: "auth.reset_password",
            kind: "admin_action",
            label: "Reset password",
            moduleName: "auth-password",
            requiredCapabilities: ["auth.users.write"],
          },
        ],
      },
    };

    expect(
      mockSlotContributions(fixtures, "auth.users.detail.actions", {
        selected_user: { id: "usr_1" },
      })
    ).toHaveLength(1);
  });
});
