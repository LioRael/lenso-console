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

export async function executePluginMutation({
  mutation,
  onProgress,
  pollIntervalMs,
  readOperation = readPluginOperation,
  requestMutation = submitPluginMutation,
  signal,
  timeoutMs,
}: {
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
  const receipt = await requestMutation(mutation, signal);
  const operation = await waitForPluginOperation({
    initial: receipt.operation,
    ...(onProgress === undefined ? {} : { onProgress }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    read: readOperation,
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
  signal?: AbortSignal
): Promise<PluginInventory> {
  const value = await httpClient
    .get("api/console/v1/agent/plugins", {
      ...(after ? { searchParams: { after } } : {}),
      ...(signal ? { signal } : {}),
    })
    .json<unknown>();
  return decodePluginInventory(value);
}

export async function readPluginManagement(
  signal?: AbortSignal
): Promise<PluginManagement> {
  const value = await httpClient
    .get("api/console/v1/agent/control/plugins", signal ? { signal } : {})
    .json<unknown>();
  return decodePluginManagement(value);
}

export async function readPluginConfigurationProposal(
  {
    expectedRevision,
    instanceKey,
    packageId,
    toml,
  }: {
    expectedRevision: string;
    instanceKey: string;
    packageId: string;
    toml: string;
  },
  signal?: AbortSignal
): Promise<PluginConfigurationProposal> {
  const value = await httpClient
    .post(
      `${pluginInstancePath(packageId, instanceKey)}/configuration/proposals`,
      {
        json: { expectedRevision, toml },
        ...(signal ? { signal } : {}),
      }
    )
    .json<unknown>();
  const proposal = decodePluginConfigurationProposal(value);
  if (
    proposal.baseRevision !== expectedRevision ||
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
  signal?: AbortSignal
): Promise<PluginConfigurationHistory> {
  const value = await httpClient
    .get(
      `${pluginInstancePath(packageId, instanceKey)}/configuration/publications`,
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
    instanceKey,
    packageId,
    publicationProposalDigest,
  }: {
    expectedRevision: string;
    instanceKey: string;
    packageId: string;
    publicationProposalDigest: string;
  },
  signal?: AbortSignal
): Promise<PluginConfigurationRollbackProposal> {
  const value = await httpClient
    .post(
      `${pluginInstancePath(packageId, instanceKey)}/configuration/rollback-proposals`,
      {
        json: { expectedRevision, publicationProposalDigest },
        ...(signal ? { signal } : {}),
      }
    )
    .json<unknown>();
  const rollback = decodePluginConfigurationRollbackProposal(value);
  if (
    rollback.rollbackOfProposalDigest !== publicationProposalDigest ||
    rollback.proposal.baseRevision !== expectedRevision ||
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
  signal: AbortSignal
) {
  try {
    const value = await httpClient
      .get(
        `api/console/v1/agent/control/plugin-operations/${encodeURIComponent(operationId)}`,
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
  signal: AbortSignal
) {
  if (mutation.type === "install") {
    return requestMutationReceipt(
      httpClient.post("api/console/v1/agent/control/plugins/install", {
        json: { bundlePath: mutation.bundlePath },
        signal,
      })
    );
  }
  const packageId = encodeURIComponent(mutation.packageId);
  if (mutation.type === "remove") {
    return requestMutationReceipt(
      httpClient.delete(`api/console/v1/agent/control/plugins/${packageId}`, {
        signal,
      })
    );
  }
  const instanceKey = encodeURIComponent(mutation.instanceKey);
  const instancePath = `api/console/v1/agent/control/plugins/${packageId}/${instanceKey}`;
  if (mutation.type === "configure") {
    return requestDecodedMutation(
      httpClient.put(`${instancePath}/configuration`, {
        json: {
          expectedRevision: mutation.expectedRevision,
          proposalDigest: mutation.proposalDigest,
          toml: mutation.toml,
        },
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
          return {
            desired: publication.desired,
            operation: publication.operation,
            schema: "lenso.agent.plugin-operation.v1",
          } satisfies PluginMutationReceipt;
        }
        return decodePluginMutationReceipt(responseValue);
      }
    );
  }
  if (mutation.type === "select") {
    return requestMutationReceipt(
      httpClient.put(`${instancePath}/enabled`, {
        json: { enabled: mutation.enabled },
        signal,
      })
    );
  }
  return requestMutationReceipt(httpClient.delete(instancePath, { signal }));
}

function requestMutationReceipt(request: Promise<Response>) {
  return requestDecodedMutation(request, decodePluginMutationReceipt);
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
    if (!isHTTPError(error)) {
      throw error;
    }
    httpError = error;
    try {
      value = await error.response.clone().json();
    } catch {
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
  configurationAuthority: PluginConfigurationAuthority;
  desired: PublishedDesiredPluginSelection;
  operation: PluginOperation;
  publicationSchema: "lenso.plugin-configuration-publication.v1";
  publicationStatus: "published";
  proposalDigest: string;
  revision: string;
  schema: "lenso.agent.plugin-operation.v1";
};

export function decodePluginConfigurationPublication(
  value: unknown
): PluginConfigurationPublication {
  if (
    !isRecord(value) ||
    value.schema !== "lenso.agent.plugin-operation.v1" ||
    value.publicationSchema !== "lenso.plugin-configuration-publication.v1" ||
    value.publicationStatus !== "published" ||
    typeof value.baseRevision !== "string" ||
    value.baseRevision.length === 0 ||
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
  return value as PluginConfigurationPublication;
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

function pluginInstancePath(packageId: string, instanceKey: string): string {
  return `api/console/v1/agent/control/plugins/${encodeURIComponent(
    packageId
  )}/${encodeURIComponent(instanceKey)}`;
}
