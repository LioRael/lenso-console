import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";

import { refreshConsoleSystemAuthority } from "./console-system-connection-api";
import { consoleSystemRegistryQueryKey } from "./console-system-registry-api";

describe("Console System Connection authority cache", () => {
  test("invalidates registry, access, observation, and operation state after a rebind", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await refreshConsoleSystemAuthority(queryClient);

    expect(invalidateQueries.mock.calls.map(([filters]) => filters)).toEqual([
      { queryKey: consoleSystemRegistryQueryKey },
      { queryKey: ["console-system", "workload-access"] },
      { queryKey: ["console-system", "workload-control"] },
      { queryKey: ["console-system", "workload-operation"] },
    ]);
  });
});
