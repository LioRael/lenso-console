import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { isApiMode } from "../../lib/http-client";
import {
  cleanPluginConfigurationDraft,
  editPluginConfigurationDraft,
  pluginConfigurationDraftHasExternalChange,
  PluginConfigurationDraftStore,
  reconcilePluginConfigurationDraft,
  reviewPluginConfigurationDraft,
  type PluginConfigurationDraft,
  type PluginConfigurationSource,
} from "./plugin-configuration-draft";
import {
  executePluginMutation,
  readPluginConfigurationHistory,
  readPluginConfigurationProposal,
  readPluginConfigurationRollbackProposal,
  readPluginInventory,
  readPluginManagementConditional,
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

export function pluginManagementQueryKey(streamId: string | undefined) {
  return [
    ...pluginWorkbenchQueryKey,
    "management",
    streamId ?? "awaiting-stream",
  ] as const;
}

export function pluginConfigurationHistoryQueryKey({
  instanceKey,
  packageId,
  revision,
  sourceDigest,
  streamId,
}: {
  instanceKey: string;
  packageId: string;
  revision: string;
  sourceDigest: string;
  streamId: string;
}) {
  return [
    ...pluginWorkbenchQueryKey,
    "configuration-history",
    streamId,
    packageId,
    instanceKey,
    revision,
    sourceDigest,
  ] as const;
}

export function pluginConfigurationHistoryMutationPrefix(
  mutation: PluginMutation
) {
  return mutation.type === "configure"
    ? [
        ...pluginWorkbenchQueryKey,
        "configuration-history",
        mutation.expectedStreamId,
        mutation.packageId,
        mutation.instanceKey,
      ]
    : null;
}

export function pluginHistoryRecoveryInterval(
  error: unknown,
  apiMode: boolean
) {
  return apiMode && error ? 5000 : false;
}

export function pluginHistoryQueryEnabled(
  historyAvailable: boolean,
  historyOpen: boolean,
  authoringVerified: boolean
) {
  return historyAvailable && historyOpen && authoringVerified;
}

export function pluginManagementRefreshInterval({
  apiMode,
  hasError,
  needsRevisionRefresh,
}: {
  apiMode: boolean;
  hasError: boolean;
  needsRevisionRefresh: boolean;
}) {
  if (!apiMode) {
    return false;
  }
  if (hasError) {
    return 2000;
  }
  return needsRevisionRefresh ? 750 : 15_000;
}

export type PluginWorkbenchData = {
  inventory: PluginInventory;
  items: readonly PluginWorkbenchItem[];
  management: PluginManagement;
};

export function usePluginWorkbench() {
  const queryClient = useQueryClient();
  const managementValidator = useRef<{
    etag: string;
    streamId: string;
  } | null>(null);
  const inventory = useQuery({
    queryFn: ({ signal }) => {
      if (!isApiMode()) {
        return Promise.resolve(demoPluginInventory);
      }
      const previous = queryClient.getQueryData<PluginInventory>(
        pluginInventoryQueryKey
      );
      return readNextPluginInventory(previous, signal);
    },
    queryKey: pluginInventoryQueryKey,
    refetchInterval: (query) =>
      isApiMode() ? (query.state.status === "error" ? 5000 : 2000) : false,
  });
  const inventoryStreamId = inventory.data?.streamId;
  const latestInventoryStreamId = useRef(inventoryStreamId);
  useLayoutEffect(() => {
    latestInventoryStreamId.current = inventoryStreamId;
  }, [inventoryStreamId]);
  const inventoryDesiredRevision = inventory.data?.desiredRevision;
  const managementKey = pluginManagementQueryKey(inventoryStreamId);
  const management = useQuery<PluginManagement>({
    enabled: !isApiMode() || inventory.data !== undefined,
    placeholderData: (previous) => previous,
    queryFn: async ({ signal }) => {
      if (!isApiMode()) {
        return demoPluginManagement;
      }
      const currentValidator = managementValidator.current;
      const validator =
        currentValidator && currentValidator.streamId === inventoryStreamId
          ? currentValidator.etag
          : undefined;
      const result = await readPluginManagementConditional(validator, signal);
      if (result.management) {
        if (
          result.etag &&
          inventoryStreamId &&
          latestInventoryStreamId.current === inventoryStreamId
        ) {
          managementValidator.current = {
            etag: result.etag,
            streamId: inventoryStreamId,
          };
        }
        return result.management;
      }
      const previous =
        queryClient.getQueryData<PluginManagement>(managementKey);
      if (!previous || !validator) {
        throw new TypeError(
          "Agent Host returned 304 before the Console cached Plugin management"
        );
      }
      return previous;
    },
    queryKey: managementKey,
    refetchInterval: (query) => {
      const managementRevision = query.state.data?.revision;
      return pluginManagementRefreshInterval({
        apiMode: isApiMode(),
        hasError: Boolean(query.state.error),
        needsRevisionRefresh: Boolean(
          inventoryDesiredRevision !== undefined &&
          managementRevision !== undefined &&
          pluginManagementNeedsRefresh(
            managementRevision,
            inventoryDesiredRevision
          )
        ),
      });
    },
  });
  useEffect(() => {
    const managementRevision = management.data?.revision;
    if (
      !isApiMode() ||
      inventoryDesiredRevision === undefined ||
      managementRevision === undefined
    ) {
      return;
    }
    if (
      pluginManagementNeedsRefresh(managementRevision, inventoryDesiredRevision)
    ) {
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: pluginManagementQueryKey(inventoryStreamId),
      });
    }
  }, [
    inventoryDesiredRevision,
    inventoryStreamId,
    management.data?.revision,
    queryClient,
  ]);
  const data = useMemo(
    () =>
      inventory.data && management.data
        ? workbenchData(inventory.data, management.data)
        : undefined,
    [inventory.data, management.data]
  );
  const error = inventory.error ?? management.error;
  const authoringEnabled = Boolean(
    data &&
    pluginAuthoringIsReady(
      data.management.revision,
      data.inventory.desiredRevision,
      Boolean(error) || management.isPlaceholderData
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

export async function readNextPluginInventory(
  previous: PluginInventory | undefined,
  signal: AbortSignal,
  read: (
    after: string | undefined,
    signal: AbortSignal
  ) => Promise<PluginInventory> = readPluginInventory
) {
  const next = await read(previous?.cursor, signal);
  if (previous && next.streamId !== previous.streamId) {
    return read(undefined, signal);
  }
  return mergePluginInventory(previous, next);
}

export function usePluginConfigurationProposal(streamId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({
      expectedRevision,
      expectedSourceDigest,
      instanceKey,
      packageId,
      streamId: requestStreamId,
      toml,
    }: {
      expectedRevision: string;
      expectedSourceDigest: string;
      instanceKey: string;
      packageId: string;
      streamId: string;
      toml: string;
    }) => {
      if (!isApiMode()) {
        return decodePluginConfigurationProposal({
          application: "app_generation",
          baseRevision: expectedRevision,
          baseSourceDigest: expectedSourceDigest,
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
        expectedSourceDigest,
        expectedStreamId: requestStreamId,
        instanceKey,
        packageId,
        toml,
      });
    },
    onError: async (_error, variables) => {
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: pluginManagementQueryKey(variables.streamId),
      });
    },
  });
  const current = mutation.variables?.streamId === streamId;
  return {
    ...mutation,
    data: current ? mutation.data : undefined,
    error: current ? mutation.error : null,
    isError: current && mutation.isError,
    isPending: current && mutation.isPending,
  };
}

export function usePluginConfigurationHistory({
  enabled,
  instanceKey,
  packageId,
  revision,
  sourceDigest,
  streamId,
}: {
  enabled: boolean;
  instanceKey: string;
  packageId: string;
  revision: string;
  sourceDigest: string;
  streamId: string;
}) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) =>
      isApiMode()
        ? readPluginConfigurationHistory(packageId, instanceKey, signal)
        : Promise.resolve(demoPluginConfigurationHistory),
    queryKey: pluginConfigurationHistoryQueryKey({
      instanceKey,
      packageId,
      revision,
      sourceDigest,
      streamId,
    }),
    refetchInterval: (query) =>
      pluginHistoryRecoveryInterval(query.state.error, isApiMode()),
  });
}

export function usePluginConfigurationRollbackProposal(streamId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({
      expectedRevision,
      expectedSourceDigest,
      instanceKey,
      packageId,
      publicationProposalDigest,
      streamId: requestStreamId,
    }: {
      expectedRevision: string;
      expectedSourceDigest: string;
      instanceKey: string;
      packageId: string;
      publicationProposalDigest: string;
      streamId: string;
    }) => {
      if (isApiMode()) {
        return readPluginConfigurationRollbackProposal({
          expectedRevision,
          expectedSourceDigest,
          expectedStreamId: requestStreamId,
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
          application:
            publication.revision === expectedRevision
              ? "noop"
              : "app_generation",
          baseRevision: expectedRevision,
          baseSourceDigest: expectedSourceDigest,
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
    onError: async (_error, variables) => {
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: pluginManagementQueryKey(variables.streamId),
      });
    },
  });
  const current = mutation.variables?.streamId === streamId;
  return {
    ...mutation,
    data: current ? mutation.data : undefined,
    error: current ? mutation.error : null,
    isError: current && mutation.isError,
    isPending: current && mutation.isPending,
  };
}

export type PluginConfigurationDraftController = {
  hasExternalChange: boolean;
  setValue: (value: string) => void;
  useHostValue: () => void;
  useReviewedValue: (
    value: string,
    expected: { sourceDigest: string; streamId: string }
  ) => void;
  value: string;
};

export function usePluginConfigurationDraftStore() {
  const store = useRef<PluginConfigurationDraftStore | null>(null);
  store.current ??= new PluginConfigurationDraftStore();
  return store.current;
}

export function usePluginConfigurationDraft({
  draftKey,
  source,
  store,
  streamId,
}: {
  draftKey: string;
  source: PluginConfigurationSource;
  store: PluginConfigurationDraftStore;
  streamId: string;
}): PluginConfigurationDraftController {
  const currentSource = useMemo(
    () => ({ sourceDigest: source.sourceDigest, toml: source.toml }),
    [source.sourceDigest, source.toml]
  );
  const cleanSnapshot = useMemo(
    () => cleanPluginConfigurationDraft(currentSource),
    [currentSource]
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(draftKey, listener),
    [draftKey, store]
  );
  const getSnapshot = useCallback(() => {
    const stored = store.get(draftKey);
    if (!stored) {
      return cleanSnapshot;
    }
    const reconciled = reconcilePluginConfigurationDraft(stored, currentSource);
    return reconciled.dirty ? reconciled : cleanSnapshot;
  }, [cleanSnapshot, currentSource, draftKey, store]);
  const draft = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    store.reconcile(draftKey, currentSource);
  }, [currentSource, draftKey, store]);
  const currentInput = useRef({
    draftKey,
    source: currentSource,
    streamId,
  });
  useLayoutEffect(() => {
    currentInput.current = { draftKey, source: currentSource, streamId };
  }, [currentSource, draftKey, streamId]);
  const update = useCallback(
    (
      expected: {
        draftKey: string;
        sourceDigest: string;
        streamId: string;
      },
      transform: (
        current: PluginConfigurationDraft | undefined,
        source: PluginConfigurationSource
      ) => PluginConfigurationDraft
    ) => {
      const live = currentInput.current;
      if (
        live.draftKey !== expected.draftKey ||
        live.streamId !== expected.streamId ||
        live.source.sourceDigest !== expected.sourceDigest
      ) {
        return;
      }
      const liveSource = live.source;
      store.set(expected.draftKey, liveSource, (current) =>
        transform(current, liveSource)
      );
    },
    [store]
  );
  const expected = {
    draftKey,
    sourceDigest: currentSource.sourceDigest,
    streamId,
  };
  return {
    hasExternalChange: pluginConfigurationDraftHasExternalChange(
      draft,
      currentSource
    ),
    setValue(value) {
      update(expected, (current, liveSource) =>
        editPluginConfigurationDraft(current, liveSource, value)
      );
    },
    useHostValue() {
      update(expected, (_current, liveSource) =>
        cleanPluginConfigurationDraft(liveSource)
      );
    },
    useReviewedValue(value, reviewed) {
      if (
        reviewed.streamId !== streamId ||
        reviewed.sourceDigest !== currentSource.sourceDigest
      ) {
        return;
      }
      update(expected, (_current, liveSource) =>
        reviewPluginConfigurationDraft(liveSource, value)
      );
    },
    value: draft.value,
  };
}

export function usePluginMutation(streamId: string | undefined) {
  const queryClient = useQueryClient();
  const stream = useRef(streamId);
  useLayoutEffect(() => {
    stream.current = streamId;
  }, [streamId]);
  const activeRequest = useRef<{
    controller: AbortController;
    streamId: string;
    token: symbol;
  } | null>(null);
  const reservedRequest = useRef<ReservedPluginMutation | null>(null);
  const [operation, setOperation] = useState<PluginOperation | null>(null);
  const [requestStreamId, setRequestStreamId] = useState<string | null>(null);
  const [preflightError, setPreflightError] = useState<Error | null>(null);
  const request = useMutation({
    mutationFn: async (mutation: PluginMutation) => {
      const reserved = reservedRequest.current;
      if (!reserved || reserved.mutation !== mutation) {
        throw new DOMException(
          "Plugin operation belongs to a stale Host view",
          "AbortError"
        );
      }
      const startedStreamId = reserved.streamId;
      const { token } = reserved;
      if (
        mutation.expectedStreamId !== startedStreamId ||
        stream.current !== startedStreamId
      ) {
        throw new DOMException(
          "Plugin operation belongs to a previous Host stream",
          "AbortError"
        );
      }
      if (!isApiMode()) {
        return undefined;
      }
      const activeController = new AbortController();
      activeRequest.current = {
        controller: activeController,
        streamId: startedStreamId,
        token,
      };
      try {
        const result = await executePluginMutation({
          mutation,
          onProgress: (progress) => {
            if (progress.streamId !== startedStreamId) {
              throw new TypeError(
                "Agent Host returned a Plugin operation from a different Host stream"
              );
            }
            if (
              activeRequest.current?.token === token &&
              stream.current === startedStreamId
            ) {
              setOperation(progress);
            }
          },
          signal: activeController.signal,
        });
        if (stream.current !== startedStreamId) {
          throw new DOMException(
            "Plugin operation belongs to a previous Host stream",
            "AbortError"
          );
        }
        return result;
      } finally {
        if (activeRequest.current?.token === token) {
          activeRequest.current = null;
        }
      }
    },
    onSettled: async (_data, _error, mutation) => {
      if (reservedRequest.current?.mutation === mutation) {
        reservedRequest.current = null;
      }
      const historyPrefix = pluginConfigurationHistoryMutationPrefix(mutation);
      if (historyPrefix) {
        void queryClient.invalidateQueries({ queryKey: historyPrefix });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          exact: true,
          queryKey: pluginInventoryQueryKey,
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: pluginManagementQueryKey(mutation.expectedStreamId),
        }),
      ]);
    },
  });
  const requestPending = request.isPending;
  const reserve = useCallback(
    (mutation: PluginMutation) => {
      const result = reservePluginMutation(
        reservedRequest.current,
        mutation,
        stream.current,
        requestPending &&
          pluginMutationBelongsToStream(requestStreamId, stream.current)
      );
      if (result.error) {
        return result.error;
      }
      const active = activeRequest.current;
      if (active && active.streamId !== result.reservation.streamId) {
        active.controller.abort(
          new DOMException("Agent Host stream changed", "AbortError")
        );
        activeRequest.current = null;
      }
      reservedRequest.current = result.reservation;
      setOperation(null);
      setPreflightError(null);
      setRequestStreamId(result.reservation.streamId);
      return null;
    },
    [requestPending, requestStreamId]
  );
  const requestMutate = request.mutate;
  const mutate = useCallback<typeof requestMutate>(
    (mutation, options) => {
      const error = reserve(mutation);
      if (error) {
        if (!(error instanceof PluginMutationInProgressError)) {
          setPreflightError(error);
        }
        return;
      }
      requestMutate(mutation, options);
    },
    [requestMutate, reserve]
  );
  const requestMutateAsync = request.mutateAsync;
  const mutateAsync = useCallback<typeof requestMutateAsync>(
    (mutation, options) => {
      const error = reserve(mutation);
      if (error) {
        if (!(error instanceof PluginMutationInProgressError)) {
          setPreflightError(error);
        }
        return Promise.reject(error);
      }
      return requestMutateAsync(mutation, options);
    },
    [requestMutateAsync, reserve]
  );
  const resetRequest = request.reset;
  useEffect(() => {
    const { current } = activeRequest;
    if (current && current.streamId !== streamId) {
      current.controller.abort(
        new DOMException("Agent Host stream changed", "AbortError")
      );
      activeRequest.current = null;
    }
    if (reservedRequest.current?.streamId !== streamId) {
      reservedRequest.current = null;
    }
  }, [streamId]);
  useEffect(
    () => () => {
      activeRequest.current?.controller.abort(
        new DOMException("Plugin operation view closed", "AbortError")
      );
    },
    []
  );
  const reset = useCallback(() => {
    if (
      (requestPending &&
        pluginMutationBelongsToStream(requestStreamId, streamId)) ||
      reservedRequest.current?.streamId === streamId
    ) {
      return;
    }
    setOperation(null);
    setPreflightError(null);
    setRequestStreamId(null);
    resetRequest();
  }, [requestPending, requestStreamId, resetRequest, streamId]);
  const isCurrentStream = pluginMutationBelongsToStream(
    requestStreamId,
    streamId
  );
  return {
    ...request,
    error: isCurrentStream ? (preflightError ?? request.error) : null,
    isError: isCurrentStream && Boolean(preflightError ?? request.error),
    isPending:
      isCurrentStream &&
      pluginMutationIsPending(
        request.isPending,
        reservedRequest.current?.streamId ?? null,
        streamId
      ),
    mutate,
    mutateAsync,
    operation: isCurrentStream ? operation : null,
    reset,
    variables: isCurrentStream
      ? (request.variables ?? reservedRequest.current?.mutation)
      : undefined,
  };
}

export type ReservedPluginMutation = {
  mutation: PluginMutation;
  streamId: string;
  token: symbol;
};

export class PluginMutationInProgressError extends Error {
  override name = "PluginMutationInProgressError";
}

export function reservePluginMutation(
  current: ReservedPluginMutation | null,
  mutation: PluginMutation,
  currentStreamId: string | undefined,
  requestPending = false
):
  | { error: Error; reservation: null }
  | { error: null; reservation: ReservedPluginMutation } {
  if (!currentStreamId) {
    return {
      error: new TypeError(
        "The Console cannot start a Plugin change before the Host stream is known"
      ),
      reservation: null,
    };
  }
  if (mutation.expectedStreamId !== currentStreamId) {
    return {
      error: new DOMException(
        "Plugin change belongs to a previous Host stream",
        "AbortError"
      ),
      reservation: null,
    };
  }
  if (current || requestPending) {
    return {
      error: new PluginMutationInProgressError(
        "A Plugin change is already in progress"
      ),
      reservation: null,
    };
  }
  return {
    error: null,
    reservation: {
      mutation,
      streamId: currentStreamId,
      token: Symbol("Plugin operation"),
    },
  };
}

export function pluginMutationIsPending(
  requestPending: boolean,
  reservationStreamId: string | null,
  currentStreamId: string | undefined
) {
  return (
    requestPending ||
    (reservationStreamId !== null && reservationStreamId === currentStreamId)
  );
}

export function pluginMutationBelongsToStream(
  requestStreamId: string | null,
  currentStreamId: string | undefined
) {
  return requestStreamId !== null && requestStreamId === currentStreamId;
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
