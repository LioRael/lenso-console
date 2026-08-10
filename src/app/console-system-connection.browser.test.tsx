import {
  configureConsoleHostApi,
  ConsoleLocaleProvider,
  type ConsoleHostApi,
  type ConsoleSystemConnection,
} from "@lenso/console-ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";

import { SystemRegistryConsolePage } from "../../packages/system-registry-console/src/page";
import { mockSystemConnection } from "../data/mock-system-connection";

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    root.unmount();
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
        systemRegistry: {
          selectService: () => undefined,
          useConnection: () =>
            connectionQueryResult(connection) as ReturnType<
              ConsoleHostApi["systemRegistry"]["useConnection"]
            >,
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

function connectionQueryResult(connection: ConsoleSystemConnection) {
  return {
    data: connection,
    error: new Error("unused test query error"),
    isError: false,
    isLoading: false,
    isPending: false,
  };
}
