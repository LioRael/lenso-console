import {
  configureConsoleHostApi,
  ConsoleLocaleProvider,
  type ConsoleHostApi,
  type ConsoleSystemConnection,
} from "@lenso/console-ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { SystemRegistryConsolePage } from "../../packages/system-registry-console/src/page";
import { mockSystemConnection } from "../data/mock-system-connection";

const roots: ReturnType<typeof createRoot>[] = [];

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

describe("System Connection browser projection", () => {
  test("renders connected, unavailable, incompatible, and unmanaged public states", async () => {
    for (const status of [
      "connected",
      "unavailable",
      "incompatible",
      "unmanaged",
    ] as const) {
      const connection = connectionWithStatus(status);
      configureConsoleHostApi({
        capabilities: {
          useAvailable: () => [
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ],
        },
        systemRegistry: {
          selectService: () => undefined,
          useConnection: () =>
            connectionQueryResult(connection) as ReturnType<
              ConsoleHostApi["systemRegistry"]["useConnection"]
            >,
          useMutateWorkload: () => ({
            error: new Error("unused mutation error"),
            isError: false,
            isPending: false,
            mutate: () => undefined,
          }),
          useWorkloadAccess: () =>
            connectionQueryResult([
              "console.workload.read",
              "console.workload.control",
              "console.workload.operation.read",
            ]),
          useWorkload: () => ({
            error: new Error("adapter unavailable"),
            isError: true,
            isLoading: false,
            isPending: false,
          }),
          useWorkloadOperation: () => ({
            error: new Error("unused operation query error"),
            isError: false,
            isLoading: false,
            isPending: false,
          }),
        },
      } as unknown as ConsoleHostApi);
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);

      await act(async () => {
        root.render(
          <ConsoleLocaleProvider
            value={{
              locale: "en",
              preference: "system",
              setPreference: () => undefined,
            }}
          >
            <SystemRegistryConsolePage />
          </ConsoleLocaleProvider>
        );
      });

      expect(container.textContent).toContain(
        status.charAt(0).toUpperCase() + status.slice(1)
      );
    }
  });

  test("renders workload operational state and submits a typed suspend request", async () => {
    const mutate = vi.fn();
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(mockSystemConnection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ]),
        useWorkload: (
          workload: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: workload
            ? {
                activeOperation: null,
                capabilities: ["suspend", "resume"],
                observedAtUnixMs: 1,
                observedRevision: "revision-7",
                protection: "controllable",
                protocol: "lenso.workload-control.v1",
                state: "running",
                workload,
              }
            : undefined,
          error: new Error("unused query error"),
          isError: false,
          isLoading: false,
          isPending: false,
        }),
        useWorkloadOperation: () => ({
          error: new Error("unused operation query error"),
          isError: false,
          isLoading: false,
          isPending: false,
        }),
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(container.textContent).toContain("Operational state");
    expect(container.textContent).toContain("Running");
    expect(container.textContent).toContain("support-workload-control");
    expect(container.textContent).toContain("suspend, resume");
    const suspend = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Suspend"
    );
    expect(suspend).toBeDefined();

    await act(async () => suspend?.click());

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: { kind: "suspend" },
        observedRevision: "revision-7",
        workload: {
          serviceId: "support-api",
          systemId: "support-desk",
          workloadId: "support-api",
        },
      })
    );
  });

  test("retains authoritative workload state but disables actions when its refresh fails", async () => {
    const mutate = vi.fn();
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(mockSystemConnection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ]),
        useWorkload: (
          workload: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: workload
            ? {
                activeOperation: null,
                capabilities: ["suspend", "resume"],
                observedAtUnixMs: 1,
                observedRevision: "revision-7",
                protection: "controllable",
                protocol: "lenso.workload-control.v1",
                state: "running",
                workload,
              }
            : undefined,
          error: new Error("adapter refresh unavailable"),
          isError: true,
          isLoading: false,
          isPending: false,
          refetch: vi.fn(),
        }),
        useWorkloadOperation: () => ({
          error: new Error("unused operation query error"),
          isError: false,
          isLoading: false,
          isPending: false,
        }),
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(container.textContent).toContain("Running");
    expect(container.textContent).toContain(
      "The last authoritative operational state is retained; current state refresh is unavailable. Actions are disabled."
    );
    const suspend = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Suspend"
    );
    expect(suspend?.disabled).toBe(true);
    await act(async () => suspend?.click());
    expect(mutate).not.toHaveBeenCalled();
  });

  test("fails closed and refreshes authority state when operation polling fails", async () => {
    const refetch = vi.fn(() => new Promise<never>(() => undefined));
    const operationIds: Array<string | null | undefined> = [];
    const missingOperationError = Object.assign(
      new Error("adapter operation not found"),
      { response: { status: 404 } }
    );
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(mockSystemConnection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate: () => undefined,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ]),
        useWorkload: (
          workload: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: workload
            ? {
                activeOperation: "operation-7",
                capabilities: ["suspend", "resume"],
                observedAtUnixMs: 1,
                observedRevision: "revision-7",
                protection: "controllable",
                protocol: "lenso.workload-control.v1",
                state: "transitioning",
                workload,
              }
            : undefined,
          error: new Error("unused query error"),
          isError: false,
          isLoading: false,
          isPending: false,
          refetch,
        }),
        useWorkloadOperation: (
          _reference: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkloadOperation"]
          >[0],
          operationId: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkloadOperation"]
          >[1]
        ) => {
          operationIds.push(operationId);
          return {
            error: missingOperationError,
            isError: Boolean(operationId),
            isLoading: false,
            isPending: false,
          };
        },
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(container.textContent).toContain(
      "Operation status is unknown; refreshing authority state."
    );
    expect(refetch).toHaveBeenCalledOnce();
    expect(operationIds).not.toContain(undefined);
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Suspend"
      )
    ).toBeUndefined();
  });

  test("retires an accepted handle after stable authoritative recovery", async () => {
    const service = mockSystemConnection.services.at(0);
    const workload = service?.workloads.at(0);
    if (!(service && workload)) {
      throw new Error("The recovery fixture requires one Workload.");
    }
    const connection = {
      ...mockSystemConnection,
      services: [
        {
          ...service,
          workloads: [workload],
        },
      ],
    } as ConsoleSystemConnection;
    let observation = {
      activeOperation: "operation-7" as string | null,
      capabilities: ["suspend", "resume"] as const,
      observedAtUnixMs: 1,
      observedRevision: "revision-7" as string | null,
      protection: "controllable" as const,
      protocol: "lenso.workload-control.v1" as const,
      state: "transitioning" as "failed" | "running" | "transitioning",
    };
    const refetch = vi.fn(async () => {
      observation = {
        ...observation,
        activeOperation: null,
        observedRevision: "revision-8",
        state: "running",
      };
      return connectionQueryResult({
        ...observation,
        workload: {
          serviceId: service.serviceId,
          systemId: connection.systemId,
          workloadId: workload.workloadId,
        },
      });
    });
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(connection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          data: { operationId: "operation-7", phase: "accepted" },
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate: () => undefined,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ]),
        useWorkload: (
          reference: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: reference ? { ...observation, workload: reference } : undefined,
          error: new Error("unused query error"),
          isError: false,
          isLoading: false,
          isPending: false,
          refetch,
        }),
        useWorkloadOperation: (
          _reference: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkloadOperation"]
          >[0],
          operationId: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkloadOperation"]
          >[1]
        ) => ({
          data: operationId
            ? { operationId: "operation-7", phase: "accepted" }
            : undefined,
          error: Object.assign(new Error("adapter unavailable"), {
            response: { status: 502 },
          }),
          isError: Boolean(operationId),
          isLoading: false,
          isPending: false,
        }),
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
      await Promise.resolve();
    });

    expect(refetch).toHaveBeenCalledOnce();
    const suspend = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Suspend"
    );
    expect(suspend?.disabled).toBe(false);
  });

  test("keeps controls disabled after a forbidden operation poll", async () => {
    const service = mockSystemConnection.services.at(0);
    const workload = service?.workloads.at(0);
    if (!(service && workload)) {
      throw new Error("The recovery fixture requires one Workload.");
    }
    const connection = {
      ...mockSystemConnection,
      services: [{ ...service, workloads: [workload] }],
    } as ConsoleSystemConnection;
    let observation = {
      activeOperation: "operation-7" as string | null,
      capabilities: ["suspend", "resume"] as const,
      observedAtUnixMs: 1,
      observedRevision: "revision-7" as string | null,
      protection: "controllable" as const,
      protocol: "lenso.workload-control.v1" as const,
      state: "transitioning" as "running" | "transitioning",
    };
    const refetch = vi.fn(async () => {
      observation = {
        ...observation,
        activeOperation: null,
        observedRevision: "revision-8",
        state: "running",
      };
      return connectionQueryResult({
        ...observation,
        workload: {
          serviceId: service.serviceId,
          systemId: connection.systemId,
          workloadId: workload.workloadId,
        },
      });
    });
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(connection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          data: { operationId: "operation-7", phase: "accepted" },
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate: () => undefined,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ]),
        useWorkload: (
          reference: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: reference ? { ...observation, workload: reference } : undefined,
          error: new Error("unused query error"),
          isError: false,
          isLoading: false,
          isPending: false,
          refetch,
        }),
        useWorkloadOperation: (
          _reference: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkloadOperation"]
          >[0],
          operationId: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkloadOperation"]
          >[1]
        ) => ({
          data: operationId
            ? { operationId: "operation-7", phase: "accepted" }
            : undefined,
          error: Object.assign(new Error("forbidden"), {
            response: { status: 403 },
          }),
          isError: Boolean(operationId),
          isLoading: false,
          isPending: false,
        }),
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(refetch).toHaveBeenCalledOnce();

    await act(async () => {
      await Promise.resolve();
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(container.textContent).toContain("Running");
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Suspend"
      )?.disabled
    ).toBe(true);
  });

  test("recovers an unknown observation after a terminal operation", async () => {
    const service = mockSystemConnection.services.at(0);
    const workload = service?.workloads.at(0);
    if (!(service && workload)) {
      throw new Error("The recovery fixture requires one Workload.");
    }
    const connection = {
      ...mockSystemConnection,
      services: [{ ...service, workloads: [workload] }],
    } as ConsoleSystemConnection;
    let observation = {
      activeOperation: null,
      capabilities: ["suspend", "resume"] as const,
      observedAtUnixMs: 1,
      observedRevision: null as string | null,
      protection: "controllable" as const,
      protocol: "lenso.workload-control.v1" as const,
      state: "unknown" as "running" | "unknown",
    };
    let releaseRefetch: (() => void) | undefined;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    const refetch = vi.fn(async () => {
      await refetchGate;
      observation = {
        ...observation,
        observedRevision: "revision-9",
        state: "running",
      };
      return connectionQueryResult({
        ...observation,
        workload: {
          serviceId: service.serviceId,
          systemId: connection.systemId,
          workloadId: workload.workloadId,
        },
      });
    });
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(connection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          data: { operationId: "operation-7", phase: "failed" },
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate: () => undefined,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult([
            "console.workload.read",
            "console.workload.control",
            "console.workload.operation.read",
          ]),
        useWorkload: (
          reference: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: reference ? { ...observation, workload: reference } : undefined,
          error: new Error("unused query error"),
          isError: false,
          isLoading: false,
          isPending: false,
          refetch,
        }),
        useWorkloadOperation: () => ({
          data: undefined,
          error: new Error("adapter unavailable"),
          isError: true,
          isLoading: false,
          isPending: false,
        }),
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
      await Promise.resolve();
    });

    expect(refetch).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Operation operation-7 · failed");
    expect(container.textContent).toContain(
      "The latest terminal operation record is retained; current authority refresh is unavailable."
    );

    await act(async () => {
      releaseRefetch?.();
      await refetchGate;
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(container.textContent).toContain("Running");
    expect(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Suspend"
      )?.disabled
    ).toBe(true);
  });

  test("keeps workload state visible but disables actions without control access", async () => {
    configureConsoleHostApi({
      capabilities: {
        useAvailable: () => ["console.system.read", "console.workload.read"],
      },
      systemRegistry: {
        selectService: () => undefined,
        useConnection: () =>
          connectionQueryResult(mockSystemConnection) as ReturnType<
            ConsoleHostApi["systemRegistry"]["useConnection"]
          >,
        useMutateWorkload: () => ({
          error: new Error("unused mutation error"),
          isError: false,
          isPending: false,
          mutate: () => undefined,
        }),
        useWorkloadAccess: () =>
          connectionQueryResult(["console.workload.read"]),
        useWorkload: (
          workload: Parameters<
            ConsoleHostApi["systemRegistry"]["useWorkload"]
          >[0]
        ) => ({
          data: workload
            ? {
                activeOperation: null,
                capabilities: ["suspend", "resume"],
                observedAtUnixMs: 1,
                observedRevision: "revision-7",
                protection: "controllable",
                protocol: "lenso.workload-control.v1",
                state: "running",
                workload,
              }
            : undefined,
          error: new Error("unused query error"),
          isError: false,
          isLoading: false,
          isPending: false,
          refetch: vi.fn(),
        }),
        useWorkloadOperation: () => ({
          error: new Error("unused operation query error"),
          isError: false,
          isLoading: false,
          isPending: false,
        }),
      },
    } as unknown as ConsoleHostApi);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleLocaleProvider
          value={{
            locale: "en",
            preference: "system",
            setPreference: () => undefined,
          }}
        >
          <SystemRegistryConsolePage />
        </ConsoleLocaleProvider>
      );
    });

    expect(container.textContent).toContain("Running");
    expect(container.textContent).toContain(
      "Workload control or operation-read access is not authorized"
    );
    const suspend = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Suspend"
    );
    expect(suspend?.disabled).toBe(true);
  });
});

function connectionWithStatus(
  status: ConsoleSystemConnection["status"]
): ConsoleSystemConnection {
  return {
    ...mockSystemConnection,
    reason: `${status}_reason`,
    status,
    services: mockSystemConnection.services.map((service, index) =>
      index === 0
        ? { ...service, reason: `${status}_service`, status }
        : service
    ),
  };
}

function connectionQueryResult<T>(data: T) {
  return {
    data,
    error: new Error("unused test query error"),
    isError: false,
    isLoading: false,
    isPending: false,
  };
}
