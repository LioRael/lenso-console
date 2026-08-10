import { describe, expect, test } from "vitest";

import { resolveConsoleSlotContributions } from "./console-contributions";
import type { ConsoleModuleMetadata } from "./console-module-resolver";

const authModules: ConsoleModuleMetadata[] = [
  {
    module_name: "auth",
    status: "loaded",
    console_slots: [
      {
        accepts: ["operation"],
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
          contract_id: "auth-password-business",
          contract_version: "v1",
          kind: "operation",
          operation_id: "auth-password/reset-password",
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
  test("resolves versioned contract operations with slot context input", () => {
    expect(
      resolveConsoleSlotContributions(authModules, {
        availableCapabilities: ["auth_password.credentials.write"],
        context: { selected_user: { id: "user_123" } },
        slotId: "auth.users.detail.actions",
      })
    ).toEqual([
      {
        contractId: "auth-password-business",
        contractVersion: "v1",
        icon: "key-round",
        input: { user_id: "user_123" },
        key: "auth-password:auth.users.detail.actions:1:auth-password-business:v1:auth-password/reset-password:0",
        kind: "operation",
        label: "Reset password",
        operationId: "auth-password/reset-password",
        requiredCapabilities: ["auth_password.credentials.write"],
      },
    ]);
  });

  test("hard-rejects the retired admin action descriptor", () => {
    const legacyModules = structuredClone(
      authModules
    ) as ConsoleModuleMetadata[];
    const action = legacyModules[1]?.console_contributions?.[0]?.action;
    if (action) {
      Object.assign(action, {
        kind: "admin_action",
        module: "auth-password",
        name: "reset_password",
      });
      delete action.contract_id;
      delete action.contract_version;
      delete action.operation_id;
    }
    legacyModules[0]!.console_slots![0]!.accepts = ["admin_action"] as never;

    expect(
      resolveConsoleSlotContributions(legacyModules, {
        availableCapabilities: ["auth_password.credentials.write"],
        context: { selected_user: { id: "user_123" } },
        slotId: "auth.users.detail.actions",
      })
    ).toEqual([]);
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
