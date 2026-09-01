import { isHTTPError } from "ky";

import { httpClient } from "../../lib/http-client";
import {
  decodePluginConfigurationHistory,
  decodePluginConfigurationProposal,
  decodePluginConfigurationRollbackProposal,
  decodeDesiredPluginSelection,
  decodePluginInventory,
  decodePluginManagement,
  type PluginConfigurationAuthority,
  type PluginConfigurationHistory,
  type PluginConfigurationProposal,
  type PluginConfigurationRollbackProposal,
  type DesiredPluginSelection,
  type PluginInventory,
  type PluginManagement,
} from "./plugin-control-contract";
import {
  decodePluginMutationReceipt,
  decodePluginOperationResponse,
  PluginOperationFailedError,
  type PluginOperation,
  type PluginMutationReceipt,
  waitForPluginOperation,
} from "./plugin-operation";

export type PluginMutation =
  | { bundlePath: string; expectedStreamId: string; type: "install" }
  | {
      expectedRevision: string;
      expectedSourceDigest: string;
      expectedStreamId: string;
      instanceKey: string;
      packageId: string;
      proposalDigest: string;
      rollbackOfProposalDigest?: string;
      toml: string;
      type: "configure";
    }
  | {
      enabled: boolean;
      expectedStreamId: string;
      instanceKey: string;
      packageId: string;
      type: "select";
    }
  | {
      expectedStreamId: string;
      instanceKey: string;
      packageId: string;
      type: "reset";
    }
  | { expectedStreamId: string; packageId: string; type: "remove" };

export async function executePluginMutation({
  agentId = "console",
  mutation,
  onProgress,
  pollIntervalMs,
  readOperation,
  requestMutation,
  signal,
  timeoutMs,
}: {
  agentId?: string;
  mutation: PluginMutation;
  onProgress?: (operation: PluginOperation) => void;
  pollIntervalMs?: number;
  readOperation?: (
    operationId: string,
    signal: AbortSignal
  ) => Promise<PluginOperation>;
  requestMutation?: (
    mutation: PluginMutation,
    signal: AbortSignal
  ) => Promise<PluginMutationReceipt>;
  signal: AbortSignal;
  timeoutMs?: number;
}) {
  const receipt = requestMutation
    ? await requestMutation(mutation, signal)
    : await submitPluginMutation(mutation, signal, agentId);
  const operation = await waitForPluginOperation({
    initial: receipt.operation,
    ...(onProgress === undefined ? {} : { onProgress }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    read:
      readOperation ??
      ((operationId, operationSignal) =>
        readPluginOperation(operationId, operationSignal, agentId)),
    signal,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  if (operation.status === "rejected" || operation.status === "rolled_back") {
    throw new PluginOperationFailedError(operation);
  }
  return operation;
}

export async function readPluginInventory(
  after: string | undefined,
  signal?: AbortSignal,
  agentId = "console"
): Promise<PluginInventory> {
  const value = await httpClient
    .get(`${agentApiBase(agentId)}/plugins`, {
      ...(after ? { searchParams: { after } } : {}),
      ...(signal ? { signal } : {}),
    })
    .json<unknown>();
  return decodePluginInventory(value, after);
}

export async function readPluginManagement(
  signal?: AbortSignal,
  agentId = "console"
): Promise<PluginManagement> {
  const result = await readPluginManagementConditional(
    undefined,
    signal,
    agentId
  );
  if (!result.management) {
    throw new TypeError(
      "Agent Host returned an unchanged Plugin management response without a cached value"
    );
  }
  return result.management;
}

export type ConditionalPluginManagement = {
  etag: string | null;
  management: PluginManagement | null;
};

export async function readPluginManagementConditional(
  ifNoneMatch: string | undefined,
  signal?: AbortSignal,
  agentId = "console"
): Promise<ConditionalPluginManagement> {
  try {
    const response = await httpClient.get(
      `${agentApiBase(agentId)}/control/plugins`,
      {
        ...(ifNoneMatch ? { headers: { "If-None-Match": ifNoneMatch } } : {}),
        ...(signal ? { signal } : {}),
      }
    );
    return {
      etag: response.headers.get("etag"),
      management: decodePluginManagement(await response.json<unknown>()),
    };
  } catch (error) {
    if (isHTTPError(error) && error.response.status === 304) {
      return {
        etag: error.response.headers.get("etag") ?? ifNoneMatch ?? null,
        management: null,
      };
    }
    throw error;
  }
}

export async function readPluginConfigurationProposal(
  {
    expectedRevision,
    expectedSourceDigest,
    expectedStreamId,
    instanceKey,
    packageId,
    toml,
  }: {
    expectedRevision: string;
    expectedSourceDigest: string;
    expectedStreamId: string;
    instanceKey: string;
    packageId: string;
    toml: string;
  },
  signal?: AbortSignal,
  agentId = "console"
): Promise<PluginConfigurationProposal> {
  const value = await httpClient
    .post(
      `${pluginInstancePath(agentId, packageId, instanceKey)}/configuration/proposals`,
      {
        json: {
          expectedRevision,
          expectedSourceDigest,
          expectedStreamId,
          toml,
        },
        ...(signal ? { signal } : {}),
      }
    )
    .json<unknown>();
  const proposal = decodePluginConfigurationProposal(value);
  if (
    proposal.baseRevision !== expectedRevision ||
    proposal.baseSourceDigest !== expectedSourceDigest ||
    proposal.instanceKey !== instanceKey ||
    proposal.pluginId !== packageId
  ) {
    throw new TypeError(
      "Agent Host returned a configuration proposal for a different Plugin request"
    );
  }
  return proposal;
}

export async function readPluginConfigurationHistory(
  packageId: string,
  instanceKey: string,
  signal?: AbortSignal,
  agentId = "console"
): Promise<PluginConfigurationHistory> {
  const value = await httpClient
    .get(
      `${pluginInstancePath(agentId, packageId, instanceKey)}/configuration/publications`,
      signal ? { signal } : {}
    )
    .json<unknown>();
  const history = decodePluginConfigurationHistory(value);
  if (history.pluginId !== packageId || history.instanceKey !== instanceKey) {
    throw new TypeError(
      "Agent Host returned configuration history for a different Plugin Instance"
    );
  }
  return history;
}

export async function readPluginConfigurationRollbackProposal(
  {
    expectedRevision,
    expectedSourceDigest,
    expectedStreamId,
    instanceKey,
    packageId,
    publicationProposalDigest,
  }: {
    expectedRevision: string;
    expectedSourceDigest: string;
    expectedStreamId: string;
    instanceKey: string;
    packageId: string;
    publicationProposalDigest: string;
  },
  signal?: AbortSignal,
  agentId = "console"
): Promise<PluginConfigurationRollbackProposal> {
  const value = await httpClient
    .post(
      `${pluginInstancePath(agentId, packageId, instanceKey)}/configuration/rollback-proposals`,
      {
        json: {
          expectedRevision,
          expectedSourceDigest,
          expectedStreamId,
          publicationProposalDigest,
        },
        ...(signal ? { signal } : {}),
      }
    )
    .json<unknown>();
  const rollback = decodePluginConfigurationRollbackProposal(value);
  if (
    rollback.rollbackOfProposalDigest !== publicationProposalDigest ||
    rollback.proposal.baseRevision !== expectedRevision ||
    rollback.proposal.baseSourceDigest !== expectedSourceDigest ||
    rollback.proposal.instanceKey !== instanceKey ||
    rollback.proposal.pluginId !== packageId
  ) {
    throw new TypeError(
      "Agent Host returned a rollback proposal for a different Plugin request"
    );
  }
  return rollback;
}

export async function readPluginOperation(
  operationId: string,
  signal: AbortSignal,
  agentId = "console"
) {
  try {
    const value = await httpClient
      .get(
        `${agentApiBase(agentId)}/control/plugin-operations/${encodeURIComponent(operationId)}`,
        { signal }
      )
      .json<unknown>();
    const { operation } = decodePluginOperationResponse(value);
    if (operation.id !== operationId) {
      throw new TypeError(
        "Agent Host returned a different Plugin operation than the one requested"
      );
    }
    return operation;
  } catch (error) {
    if (isHTTPError(error) && error.response.status === 404) {
      throw new Error(
        "The Host no longer retains this Plugin operation receipt, so the Console cannot prove whether routing switched",
        { cause: error }
      );
    }
    throw error;
  }
}

export async function submitPluginMutation(
  mutation: PluginMutation,
  signal: AbortSignal,
  agentId = "console"
) {
  if (mutation.type === "install") {
    return requestMutationReceipt(
      httpClient.post(`${agentApiBase(agentId)}/control/plugins/install`, {
        json: {
          bundlePath: mutation.bundlePath,
          expectedStreamId: mutation.expectedStreamId,
        },
        retry: 0,
        signal,
      }),
      mutation.expectedStreamId
    );
  }
  const packageId = encodeURIComponent(mutation.packageId);
  if (mutation.type === "remove") {
    return requestMutationReceipt(
      httpClient.delete(
        `${agentApiBase(agentId)}/control/plugins/${packageId}`,
        {
          json: { expectedStreamId: mutation.expectedStreamId },
          retry: 0,
          signal,
        }
      ),
      mutation.expectedStreamId
    );
  }
  const instanceKey = encodeURIComponent(mutation.instanceKey);
  const instancePath = `${agentApiBase(agentId)}/control/plugins/${packageId}/${instanceKey}`;
  if (mutation.type === "configure") {
    return requestDecodedMutation(
      httpClient.put(`${instancePath}/configuration`, {
        json: {
          expectedRevision: mutation.expectedRevision,
          expectedSourceDigest: mutation.expectedSourceDigest,
          expectedStreamId: mutation.expectedStreamId,
          proposalDigest: mutation.proposalDigest,
          ...(mutation.rollbackOfProposalDigest
            ? {
                rollbackOfProposalDigest: mutation.rollbackOfProposalDigest,
              }
            : {}),
          toml: mutation.toml,
        },
        retry: 0,
        signal,
      }),
      (responseValue) => {
        if (
          isRecord(responseValue) &&
          responseValue.publicationSchema ===
            "lenso.plugin-configuration-publication.v1"
        ) {
          const publication =
            decodePluginConfigurationPublication(responseValue);
          if (
            publication.baseRevision !== mutation.expectedRevision ||
            publication.baseSourceDigest !== mutation.expectedSourceDigest ||
            publication.proposalDigest !== mutation.proposalDigest ||
            publication.streamId !== mutation.expectedStreamId
          ) {
            throw new TypeError(
              "Agent Host returned a configuration publication for a different reviewed proposal"
            );
          }
          return {
            desired: publication.desired,
            operation: publication.operation,
            schema: "lenso.agent.plugin-operation.v1",
            streamId: publication.streamId,
          } satisfies PluginMutationReceipt;
        }
        return assertMutationStream(
          decodePluginMutationReceipt(responseValue),
          mutation.expectedStreamId
        );
      }
    );
  }
  if (mutation.type === "select") {
    return requestMutationReceipt(
      httpClient.put(`${instancePath}/enabled`, {
        json: {
          enabled: mutation.enabled,
          expectedStreamId: mutation.expectedStreamId,
        },
        retry: 0,
        signal,
      }),
      mutation.expectedStreamId
    );
  }
  return requestMutationReceipt(
    httpClient.delete(instancePath, {
      json: { expectedStreamId: mutation.expectedStreamId },
      retry: 0,
      signal,
    }),
    mutation.expectedStreamId
  );
}

function requestMutationReceipt(
  request: Promise<Response>,
  expectedStreamId: string
) {
  return requestDecodedMutation(request, (value) =>
    assertMutationStream(decodePluginMutationReceipt(value), expectedStreamId)
  );
}

function assertMutationStream(
  receipt: PluginMutationReceipt,
  expectedStreamId: string
) {
  if (receipt.streamId !== expectedStreamId) {
    throw new TypeError(
      "Agent Host returned a Plugin operation from a different Host stream"
    );
  }
  return receipt;
}

async function requestDecodedMutation<T>(
  request: Promise<Response>,
  decode: (value: unknown) => T
) {
  let value: unknown;
  let httpError: Error | undefined;
  try {
    const response = await request;
    value = await response.json();
  } catch (error) {
    if (!isHTTPError(error) || error.response.status !== 409) {
      throw error;
    }
    httpError = error;
    value = error.data;
    if (value === undefined) {
      throw error;
    }
  }
  try {
    return decode(value);
  } catch (error) {
    if (httpError) {
      throwAsError(httpError);
    }
    throwAsError(error);
  }
}

function throwAsError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Plugin response handling failed", { cause: error });
}

type PublishedDesiredPluginSelection = DesiredPluginSelection & {
  configurationStatus: "applied" | "pending" | "rejected";
  desiredRevision: string;
};

type PluginConfigurationPublication = {
  baseRevision: string;
  baseSourceDigest: string;
  configurationAuthority: PluginConfigurationAuthority;
  desired: PublishedDesiredPluginSelection;
  operation: PluginOperation;
  publicationSchema: "lenso.plugin-configuration-publication.v1";
  publicationStatus: "published";
  proposalDigest: string;
  revision: string;
  schema: "lenso.agent.plugin-operation.v1";
  streamId: string;
};

export function decodePluginConfigurationPublication(
  value: unknown
): PluginConfigurationPublication {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.agent.plugin-operation.v1" ||
    value.publicationSchema !== "lenso.plugin-configuration-publication.v1" ||
    value.publicationStatus !== "published" ||
    typeof value.streamId !== "string" ||
    value.streamId.length === 0 ||
    typeof value.baseRevision !== "string" ||
    value.baseRevision.length === 0 ||
    typeof value.baseSourceDigest !== "string" ||
    value.baseSourceDigest.length === 0 ||
    !isConfigurationAuthority(value.configurationAuthority) ||
    typeof value.proposalDigest !== "string" ||
    value.proposalDigest.length === 0 ||
    typeof value.revision !== "string" ||
    value.revision.length === 0 ||
    !isRecord(value.desired) ||
    (value.desired.configurationStatus !== "applied" &&
      value.desired.configurationStatus !== "pending" &&
      value.desired.configurationStatus !== "rejected") ||
    value.desired.desiredRevision !== value.revision
  ) {
    throw new TypeError(
      "Agent Host returned an invalid configuration publication"
    );
  }
  const desired = decodeDesiredPluginSelection(value.desired);
  const { operation } = decodePluginOperationResponse({
    operation: value.operation,
    schema: "lenso.agent.plugin-operation.v1",
    streamId: value.streamId,
  });
  if (
    desired.pluginRootRevision !== value.revision ||
    operation.pluginRootRevision !== value.revision ||
    operation.desiredStateDigest !== desired.desiredStateDigest ||
    operation.planDigest !== desired.planDigest ||
    configurationStatusForOperation(operation.status) !==
      value.desired.configurationStatus
  ) {
    throw new TypeError(
      "Agent Host returned an inconsistent configuration publication"
    );
  }
  return {
    baseRevision: value.baseRevision,
    baseSourceDigest: value.baseSourceDigest,
    configurationAuthority: value.configurationAuthority,
    desired: {
      ...desired,
      configurationStatus: value.desired.configurationStatus,
      desiredRevision: value.desired.desiredRevision,
    },
    operation,
    publicationSchema: "lenso.plugin-configuration-publication.v1",
    publicationStatus: "published",
    proposalDigest: value.proposalDigest,
    revision: value.revision,
    schema: "lenso.agent.plugin-operation.v1",
    streamId: value.streamId,
  };
}

function configurationStatusForOperation(
  status: PluginOperation["status"]
): PublishedDesiredPluginSelection["configurationStatus"] {
  if (status === "switched") {
    return "applied";
  }
  if (status === "rejected" || status === "rolled_back") {
    return "rejected";
  }
  return "pending";
}

function isConfigurationAuthority(
  value: unknown
): value is PluginConfigurationAuthority {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.publicationHistory === "boolean" &&
    typeof value.reference === "string" &&
    value.reference.length > 0 &&
    typeof value.rollbackProposals === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function pluginInstancePath(
  agentId: string,
  packageId: string,
  instanceKey: string
): string {
  return `${agentApiBase(agentId)}/control/plugins/${encodeURIComponent(
    packageId
  )}/${encodeURIComponent(instanceKey)}`;
}

function agentApiBase(agentId: string) {
  return agentId === "console"
    ? "api/console/v1/agent"
    : `api/console/v1/agents/${encodeURIComponent(agentId)}`;
}
