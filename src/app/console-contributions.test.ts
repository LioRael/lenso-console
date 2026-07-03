import { describe, expect, test } from "vitest";

import { resolveConsoleSlotContributions } from "./console-contributions";
import type { ConsoleModuleMetadata } from "./console-module-resolver";

const authModules: ConsoleModuleMetadata[] = [
  {
    module_name: "auth",
    status: "loaded",
    console_slots: [
      {
        accepts: ["admin_action"],
        context: [
          {
            fields: [
              {
                field_type: "string",
                name: "id",
                required: true,
              },
            ],
            name: "selected_user",
          },
        ],
        id: "auth.users.detail.actions",
        label: "User detail actions",
        version: 1,
      },
    ],
  },
  {
    module_name: "auth-password",
    status: "loaded",
    console_contributions: [
      {
        action: {
          input_bindings: [
            {
              input: "user_id",
              value: {
                kind: "slot_context",
                path: "selected_user.id",
              },
            },
          ],
          kind: "admin_action",
          module: "auth-password",
          name: "reset_password",
        },
        icon: "key-round",
        label: "Reset password",
        required_capabilities: ["auth_password.credentials.write"],
        target: "auth.users.detail.actions",
        target_version: 1,
      },
    ],
  },
];

describe("console slot contributions", () => {
  test("resolves versioned admin actions with slot context input", () => {
    expect(
      resolveConsoleSlotContributions(authModules, {
        availableCapabilities: ["auth_password.credentials.write"],
        context: { selected_user: { id: "user_123" } },
        slotId: "auth.users.detail.actions",
      })
    ).toEqual([
      {
        actionName: "reset_password",
        icon: "key-round",
        input: { user_id: "user_123" },
        key: "auth-password:auth.users.detail.actions:1:auth-password:reset_password:0",
        kind: "admin_action",
        label: "Reset password",
        moduleName: "auth-password",
        requiredCapabilities: ["auth_password.credentials.write"],
      },
    ]);
  });

  test("requires declared slot version, capability, and context path", () => {
    expect(
      resolveConsoleSlotContributions(authModules, {
        availableCapabilities: ["auth_password.credentials.write"],
        context: { selected_user: { id: "user_123" } },
        slotId: "auth.users.detail.footer",
      })
    ).toEqual([]);
    expect(
      resolveConsoleSlotContributions(authModules, {
        availableCapabilities: [],
        context: { selected_user: { id: "user_123" } },
        slotId: "auth.users.detail.actions",
      })
    ).toEqual([]);
    expect(
      resolveConsoleSlotContributions(authModules, {
        availableCapabilities: ["auth_password.credentials.write"],
        context: { selected_user: {} },
        slotId: "auth.users.detail.actions",
      })
    ).toEqual([]);
  });
});
