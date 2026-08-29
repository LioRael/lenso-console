import { useQuery } from "@tanstack/react-query";

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
