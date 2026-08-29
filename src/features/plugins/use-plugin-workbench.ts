import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../../lib/http-client";
import {
  decodePluginConfigurationProposal,
  decodePluginConfigurationPublication,
  decodePluginInventory,
  decodePluginManagement,
  demoPluginInventory,
  demoPluginManagement,
  pluginWorkbenchItems,
} from "./plugin-workbench-model";

export const pluginWorkbenchQueryKey = ["agent", "plugin-workbench"] as const;

export type PluginMutation =
  | { bundlePath: string; type: "install" }
  | {
      expectedRevision: string;
      instanceKey: string;
      packageId: string;
      proposalDigest: string;
      toml: string;
      type: "configure";
    }
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
    refetchInterval: (query) =>
      query.state.data?.inventory.configurationStatus === "pending"
        ? 750
        : false,
  });
}

export function usePluginConfigurationProposal() {
  return useMutation({
    mutationFn: async ({
      expectedRevision,
      instanceKey,
      packageId,
      toml,
    }: {
      expectedRevision: string;
      instanceKey: string;
      packageId: string;
      toml: string;
    }) => {
      if (!isApiMode()) {
        return decodePluginConfigurationProposal({
          application: "app_generation",
          baseRevision: expectedRevision,
          candidateRevision:
            "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          diagnostics: [],
          instanceKey,
          pluginId: packageId,
          proposalDigest:
            "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          schema: "lenso.plugin-configuration-proposal.v1",
          status: "ready",
        });
      }
      const path = pluginInstancePath(packageId, instanceKey);
      const value = await httpClient
        .post(`${path}/configuration/proposals`, {
          json: { expectedRevision, toml },
        })
        .json<unknown>();
      return decodePluginConfigurationProposal(value);
    },
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
        const value = await httpClient
          .put(`${instancePath}/configuration`, {
            json: {
              expectedRevision: mutation.expectedRevision,
              proposalDigest: mutation.proposalDigest,
              toml: mutation.toml,
            },
          })
          .json<unknown>();
        return decodePluginConfigurationPublication(value);
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

function pluginInstancePath(packageId: string, instanceKey: string): string {
  return `api/console/v1/agent/control/plugins/${encodeURIComponent(
    packageId
  )}/${encodeURIComponent(instanceKey)}`;
}
