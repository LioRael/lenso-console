import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../../lib/http-client";
import {
  decodePluginInventory,
  decodePluginManagement,
  demoPluginInventory,
  demoPluginManagement,
  pluginWorkbenchItems,
} from "./plugin-workbench-model";

export const pluginWorkbenchQueryKey = ["agent", "plugin-workbench"] as const;

export type PluginMutation =
  | { bundlePath: string; type: "install" }
  | { instanceKey: string; packageId: string; toml: string; type: "configure" }
  | { enabled: boolean; instanceKey: string; packageId: string; type: "select" }
  | { instanceKey: string; packageId: string; type: "reset" }
  | { packageId: string; type: "remove" };

export function usePluginWorkbench() {
  return useQuery({
    queryFn: async () => {
      if (!isApiMode()) {
        return {
          inventory: demoPluginInventory,
          items: pluginWorkbenchItems(
            demoPluginInventory,
            demoPluginManagement
          ),
          management: demoPluginManagement,
        };
      }
      const [inventoryValue, managementValue] = await Promise.all([
        httpClient.get("api/console/v1/agent/plugins").json<unknown>(),
        httpClient.get("api/console/v1/agent/control/plugins").json<unknown>(),
      ]);
      const inventory = decodePluginInventory(inventoryValue);
      const management = decodePluginManagement(managementValue);
      return {
        inventory,
        items: pluginWorkbenchItems(inventory, management),
        management,
      };
    },
    queryKey: pluginWorkbenchQueryKey,
  });
}

export function usePluginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mutation: PluginMutation) => {
      if (!isApiMode()) {
        return;
      }
      if (mutation.type === "install") {
        await httpClient.post("api/console/v1/agent/control/plugins/install", {
          json: { bundlePath: mutation.bundlePath },
        });
        return;
      }
      const packageId = encodeURIComponent(mutation.packageId);
      if (mutation.type === "remove") {
        await httpClient.delete(
          `api/console/v1/agent/control/plugins/${packageId}`
        );
        return;
      }
      const instanceKey = encodeURIComponent(mutation.instanceKey);
      const instancePath = `api/console/v1/agent/control/plugins/${packageId}/${instanceKey}`;
      if (mutation.type === "configure") {
        await httpClient.put(`${instancePath}/configuration`, {
          json: { toml: mutation.toml },
        });
        return;
      }
      if (mutation.type === "select") {
        await httpClient.put(`${instancePath}/enabled`, {
          json: { enabled: mutation.enabled },
        });
        return;
      }
      await httpClient.delete(instancePath);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: pluginWorkbenchQueryKey,
      });
    },
  });
}
