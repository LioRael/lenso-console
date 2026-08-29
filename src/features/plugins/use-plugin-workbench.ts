import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../../lib/http-client";
import {
  decodePluginInventory,
  demoPluginInventory,
} from "./plugin-workbench-model";

export const pluginWorkbenchQueryKey = ["agent", "plugin-inventory"] as const;

export function usePluginWorkbench() {
  return useQuery({
    queryFn: async () => {
      if (!isApiMode()) {
        return demoPluginInventory;
      }
      const value = await httpClient
        .get("api/console/v1/agent/plugins")
        .json<unknown>();
      return decodePluginInventory(value);
    },
    queryKey: pluginWorkbenchQueryKey,
  });
}

export function useSetPluginEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      enabled,
      instanceKey,
    }: {
      enabled: boolean;
      instanceKey: string;
    }) => {
      if (!isApiMode()) {
        throw new Error("Plugin changes require a running Agent Host");
      }
      const [pluginId, instance] = instanceKey.split("/");
      if (!(pluginId && instance)) {
        throw new Error("Plugin Instance identity is invalid");
      }
      await httpClient.post(
        `api/console/v1/agent/control/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(instance)}/${enabled ? "enable" : "disable"}`
      );
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const value = await httpClient
          .get("api/console/v1/agent/plugins")
          .json<unknown>();
        const inventory = decodePluginInventory(value);
        const target = inventory.plugins.find(
          (plugin) => plugin.instanceKey === instanceKey
        );
        if (target?.status === (enabled ? "active" : "disabled")) {
          return inventory;
        }
        const rejection = inventory.generationEvents.find((event) =>
          ["failed", "rejected", "rolled_back"].includes(event.status)
        );
        if (rejection) {
          throw new Error(rejection.detail);
        }
      }
      throw new Error("The Host did not finish the Plugin Ready Gate in time");
    },
    onSuccess: (inventory) => {
      queryClient.setQueryData(pluginWorkbenchQueryKey, inventory);
    },
  });
}
