import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { isApiMode } from "../../lib/http-client";
import {
  executePluginMutation,
  readPluginConfigurationHistory,
  readPluginConfigurationProposal,
  readPluginConfigurationRollbackProposal,
  readPluginInventory,
  readPluginManagement,
  type PluginMutation,
} from "./plugin-control-client";
import {
  decodePluginConfigurationProposal,
  decodePluginConfigurationRollbackProposal,
} from "./plugin-control-contract";
import type { PluginOperation } from "./plugin-operation";
import {
  demoPluginInventory,
  demoPluginConfigurationHistory,
  demoPluginManagement,
  mergePluginInventory,
  pluginAuthoringIsReady,
  pluginManagementNeedsRefresh,
  pluginWorkbenchItems,
  type PluginInventory,
  type PluginManagement,
  type PluginWorkbenchItem,
} from "./plugin-workbench-model";

export const pluginWorkbenchQueryKey = ["agent", "plugin-workbench"] as const;
const pluginInventoryQueryKey = [
  ...pluginWorkbenchQueryKey,
  "inventory",
] as const;
const pluginManagementQueryKey = [
  ...pluginWorkbenchQueryKey,
  "management",
] as const;

export type PluginWorkbenchData = {
  inventory: PluginInventory;
  items: readonly PluginWorkbenchItem[];
  management: PluginManagement;
};

export function usePluginWorkbench() {
  const queryClient = useQueryClient();
  const inventory = useQuery({
    queryFn: async ({ signal }) => {
      if (!isApiMode()) {
        return demoPluginInventory;
      }
      const previous = queryClient.getQueryData<PluginInventory>(
        pluginInventoryQueryKey
      );
      return mergePluginInventory(
        previous,
        await readPluginInventory(previous?.cursor, signal)
      );
    },
    queryKey: pluginInventoryQueryKey,
    refetchInterval: (query) =>
      isApiMode() ? (query.state.status === "error" ? 5000 : 2000) : false,
  });
  const management = useQuery({
    queryFn: ({ signal }) =>
      isApiMode()
        ? readPluginManagement(signal)
        : Promise.resolve(demoPluginManagement),
    queryKey: pluginManagementQueryKey,
    refetchInterval: (query) => {
      const desiredRevision = inventory.data?.desiredRevision;
      const managementRevision = query.state.data?.revision;
      return isApiMode() &&
        desiredRevision !== undefined &&
        managementRevision !== undefined &&
        pluginManagementNeedsRefresh(managementRevision, desiredRevision)
        ? 750
        : false;
    },
  });
  useEffect(() => {
    const desiredRevision = inventory.data?.desiredRevision;
    const managementRevision = management.data?.revision;
    if (
      !isApiMode() ||
      desiredRevision === undefined ||
      managementRevision === undefined
    ) {
      return;
    }
    if (pluginManagementNeedsRefresh(managementRevision, desiredRevision)) {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: pluginManagementQueryKey,
      });
    }
  }, [inventory.data?.desiredRevision, management.data?.revision, queryClient]);
  const data =
    inventory.data && management.data
      ? workbenchData(inventory.data, management.data)
      : undefined;
  const error = inventory.error ?? management.error;
  const authoringEnabled = Boolean(
    data &&
    pluginAuthoringIsReady(
      data.management.revision,
      data.inventory.desiredRevision,
      Boolean(error)
    )
  );
  return {
    authoringEnabled,
    data,
    error,
    isDegraded: Boolean(data && (!authoringEnabled || error)),
    isError: !data && (inventory.isError || management.isError),
    isPending: !data && (inventory.isPending || management.isPending),
    refetch: () => Promise.all([inventory.refetch(), management.refetch()]),
  };
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
          candidateRevision: "demo-root-next",
          configurationAuthority: demoPluginManagement.configurationAuthority,
          diagnostics: [],
          instanceKey,
          pluginId: packageId,
          proposalDigest: "demo-proposal",
          schema: "lenso.plugin-configuration-proposal.v1",
          status: "ready",
        });
      }
      return readPluginConfigurationProposal({
        expectedRevision,
        instanceKey,
        packageId,
        toml,
      });
    },
  });
}

export function usePluginConfigurationHistory({
  enabled,
  instanceKey,
  packageId,
  revision,
}: {
  enabled: boolean;
  instanceKey: string;
  packageId: string;
  revision: string;
}) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) =>
      isApiMode()
        ? readPluginConfigurationHistory(packageId, instanceKey, signal)
        : Promise.resolve(demoPluginConfigurationHistory),
    queryKey: [
      ...pluginWorkbenchQueryKey,
      "configuration-history",
      packageId,
      instanceKey,
      revision,
    ],
  });
}

export function usePluginConfigurationRollbackProposal() {
  return useMutation({
    mutationFn: async ({
      expectedRevision,
      instanceKey,
      packageId,
      publicationProposalDigest,
    }: {
      expectedRevision: string;
      instanceKey: string;
      packageId: string;
      publicationProposalDigest: string;
    }) => {
      if (isApiMode()) {
        return readPluginConfigurationRollbackProposal({
          expectedRevision,
          instanceKey,
          packageId,
          publicationProposalDigest,
        });
      }
      const publication = demoPluginConfigurationHistory.publications.find(
        (candidate) => candidate.proposalDigest === publicationProposalDigest
      );
      if (!publication) {
        throw new TypeError("Plugin configuration publication was not found");
      }
      return decodePluginConfigurationRollbackProposal({
        configurationToml: publication.configurationToml,
        proposal: {
          application: "app_generation",
          baseRevision: expectedRevision,
          candidateRevision: publication.revision,
          configurationAuthority:
            demoPluginConfigurationHistory.configurationAuthority,
          diagnostics: [],
          instanceKey,
          pluginId: packageId,
          proposalDigest: "demo-rollback-proposal",
          schema: "lenso.plugin-configuration-proposal.v1",
          status: "ready",
        },
        rollbackOfProposalDigest: publicationProposalDigest,
        schema: "lenso.agent.plugin-configuration-rollback-proposal.v1",
      });
    },
  });
}

export function usePluginMutation() {
  const queryClient = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const [operation, setOperation] = useState<PluginOperation | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort(
        new DOMException("Plugin operation view closed", "AbortError")
      );
    },
    []
  );
  const request = useMutation({
    mutationFn: async (mutation: PluginMutation) => {
      if (!isApiMode()) {
        return undefined;
      }
      controller.current?.abort(
        new DOMException("A newer Plugin operation started", "AbortError")
      );
      const activeController = new AbortController();
      controller.current = activeController;
      setOperation(null);
      try {
        return await executePluginMutation({
          mutation,
          onProgress: setOperation,
          signal: activeController.signal,
        });
      } finally {
        if (controller.current === activeController) {
          controller.current = null;
        }
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: pluginWorkbenchQueryKey,
      });
    },
  });
  const reset = useCallback(() => {
    if (request.isPending) {
      return;
    }
    setOperation(null);
    request.reset();
  }, [request]);
  return { ...request, operation, reset };
}

function workbenchData(
  inventory: PluginInventory,
  management: PluginManagement
): PluginWorkbenchData {
  return {
    inventory,
    items: pluginWorkbenchItems(inventory, management),
    management,
  };
}

export type { PluginMutation } from "./plugin-control-client";
