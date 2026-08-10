import { describe, expect, test } from "vitest";

import type { ConsoleHostApi } from "../app/console-host-api";
import { executionInspectorTabs } from "../components/runtime/execution-inspector-model";
import {
  type MockConsoleFixtures,
  createMockConsoleHostApi,
  mockAvailableCapabilities,
  mockSlotContributions,
} from "./mock-console-host-api";

const delegatedUseConsole =
  notCalled as ConsoleHostApi["context"]["useConsole"];
const delegatedUseRuntimeConsole =
  notCalled as ConsoleHostApi["context"]["useRuntimeConsole"];
const delegatedWriteBrowserUrl: ConsoleHostApi["hooks"]["writeBrowserUrl"] =
  () => undefined;
const buildPath: ConsoleHostApi["routing"]["buildPath"] = (path) => path;
const findStoryByCorrelation: ConsoleHostApi["story"]["findStoryByCorrelation"] =
  () => null;

describe("mock console host api", () => {
  test("returns fixture-backed capabilities", () => {
    expect(
      mockAvailableCapabilities({ capabilities: ["auth.users.read"] })
    ).toEqual(["auth.users.read"]);
  });

  test("returns slot contributions from fixtures", () => {
    const fixtures: MockConsoleFixtures = {
      contributions: {
        "auth.users.detail.actions": [
          {
            contractId: "auth-password-business",
            contractVersion: "v1",
            input: { user_id: "usr_1" },
            key: "auth.reset_password",
            kind: "operation",
            label: "Reset password",
            operationId: "auth-password/reset-password",
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

  test("creates fixture-backed host api while preserving delegated base functions", () => {
    const configValues = [
      {
        desired_value: true,
        effective_value: true,
        key: "require_invite",
        pending_restart: false,
        source: "fixture",
        value: true,
      },
    ];
    const baseHostApi = {
      version: "2",
      capabilities: {
        useAvailable: notCalled,
      },
      config: {
        useValues: notCalled,
        useWriteValue: notCalled,
      },
      contributions: {
        useSlot: notCalled,
      },
      context: {
        useConsole: delegatedUseConsole,
        useRuntimeConsole: delegatedUseRuntimeConsole,
      },
      data: {
        retryTargetForNode: notCalled,
        runtimeStories: [],
      },
      hooks: {
        useBrowserUrlPopState: notCalled,
        useListKeyboard: notCalled,
        usePersistedLayout: notCalled,
        writeBrowserUrl: delegatedWriteBrowserUrl,
      } as ConsoleHostApi["hooks"],
      modules: {
        useMetadata: notCalled,
      },
      queries: {
        useRuntimeStories: notCalled,
        useRuntimeStoryDetail: notCalled,
      },
      routing: {
        buildPath,
      },
      story: {
        executionInspectorTabs,
        findStoryByCorrelation,
      },
      systemRegistry: {
        selectService: notCalled,
        useConnect: notCalled,
        useConnection: notCalled,
        useMutateWorkload: notCalled,
        useServices: notCalled,
        useWorkloadAccess: notCalled,
        useWorkload: notCalled,
        useWorkloadOperation: notCalled,
      },
      ui: {} as ConsoleHostApi["ui"],
    } satisfies ConsoleHostApi;

    const hostApi = createMockConsoleHostApi(baseHostApi, { configValues });

    expect("adminData" in hostApi).toBe(false);
    expect(hostApi.config.useValues().data).toEqual({
      data: configValues,
    });
    expect(hostApi.modules.useMetadata().data).toEqual({ modules: [] });
    expect(hostApi.context.useConsole).toBe(delegatedUseConsole);
    expect(hostApi.context.useRuntimeConsole).toBe(delegatedUseRuntimeConsole);
    expect(hostApi.hooks.writeBrowserUrl).toBe(delegatedWriteBrowserUrl);
  });
});

function notCalled(): never {
  throw new Error("not called");
}
