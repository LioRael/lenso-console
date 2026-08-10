import {
  CONSOLE_SURFACE_GATEWAY_PROTOCOL,
  ConsoleHostError,
  isConsoleSha256Digest,
  type ConsoleSha256Digest,
  type ConsoleClient,
  type ActionContributionResolution,
  type ActionContributionResolutionRequest,
  type ManagedServiceContext,
  type ModuleConfigReadRequest,
  type ModuleConfigReadResponse,
  type ModuleConfigWriteRequest,
  type ModuleConfigWriteResponse,
  type ModuleInventoryRequest,
  type ModuleInventorySnapshot,
  type SurfaceApiClient,
  type SurfaceOperationRequest,
  type SurfaceOperationResponse,
} from "@lenso/console-module-api";

import { httpClient } from "../lib/http-client";
import { sameManagedServiceContext } from "./managed-service-context";

type ConsoleModuleClientOptions = {
  moduleId: string;
  moduleReleaseDigest: ConsoleSha256Digest;
  uiArtifactDigest: ConsoleSha256Digest;
  managedServiceContext: ManagedServiceContext;
  capabilities: readonly string[];
  requiredCapabilities?: readonly string[] | undefined;
  navigate: (path: string, options?: { replace?: boolean }) => void;
};

export function createConsoleModuleClient({
  capabilities,
  moduleId,
  moduleReleaseDigest,
  navigate,
  requiredCapabilities = [],
  uiArtifactDigest,
  managedServiceContext,
}: ConsoleModuleClientOptions): ConsoleClient {
  const available = new Set(capabilities);
  const required = new Set(requiredCapabilities);
  const assertCapabilities = () => {
    const missing = [...required].filter(
      (capability) => !available.has(capability)
    );
    if (missing.length > 0) {
      throw new ConsoleHostError(
        "capability_denied",
        `Console Module is missing required capabilities: ${missing.join(", ")}`,
        { status: 403 }
      );
    }
  };

  const assertContext = (context: ManagedServiceContext) => {
    if (
      context.callerModuleId !== moduleId ||
      !sameManagedServiceContext(context, managedServiceContext)
    ) {
      throw new ConsoleHostError(
        "forbidden",
        "Managed Service Context does not match the selected Module and Service",
        { status: 403 }
      );
    }
  };

  const operation = async <Request, Response>(
    suffix: string,
    request: Request & { context: ManagedServiceContext }
  ): Promise<Response> => {
    assertCapabilities();
    assertContext(request.context);
    return httpClient
      .post(
        `api/console/v1/services/${encodeURIComponent(managedServiceContext.serviceId)}/system-plane/v1/modules${suffix}`,
        { json: request }
      )
      .json<Response>();
  };

  const surfaceApi: SurfaceApiClient = {
    async invoke<Input, Output>(
      request: SurfaceOperationRequest<Input>
    ): Promise<SurfaceOperationResponse<Output>> {
      assertCapabilities();
      assertContext(request.context);
      if (
        request.protocol !== CONSOLE_SURFACE_GATEWAY_PROTOCOL ||
        request.moduleId !== moduleId ||
        request.moduleReleaseDigest !== moduleReleaseDigest ||
        request.uiArtifactDigest !== uiArtifactDigest ||
        !isConsoleSha256Digest(request.contractDigest) ||
        !request.operationId.trim()
      ) {
        throw new ConsoleHostError(
          "incompatible",
          "Surface operation does not match the receipt-bound Console Module",
          { status: 409 }
        );
      }
      validateSurfaceRequestContext(request);
      const response = await httpClient
        .post(
          `api/console/v1/services/${encodeURIComponent(managedServiceContext.serviceId)}/surface-gateway`,
          { json: request }
        )
        .json<SurfaceOperationResponse<Output>>();
      if (
        response.protocol !== CONSOLE_SURFACE_GATEWAY_PROTOCOL ||
        response.moduleId !== moduleId ||
        response.contractDigest !== request.contractDigest ||
        response.operationId !== request.operationId ||
        !response.requestContext ||
        !sameSurfaceRequestContext(
          response.requestContext,
          request.requestContext
        )
      ) {
        throw new ConsoleHostError(
          "incompatible",
          "Surface Gateway returned a response for a different contract operation",
          { status: 502, retryable: true }
        );
      }
      return response;
    },
  };

  return {
    identity: { moduleId, moduleReleaseDigest, uiArtifactDigest },
    managedServiceContext,
    surfaceApi,
    capabilities: {
      has: (capability) => available.has(capability),
      list: () => capabilities,
    },
    inventory(
      request: ModuleInventoryRequest
    ): Promise<ModuleInventorySnapshot> {
      return operation<ModuleInventoryRequest, ModuleInventorySnapshot>(
        "",
        request
      );
    },
    resolveActionContributions(
      request: ActionContributionResolutionRequest
    ): Promise<ActionContributionResolution> {
      return operation<
        ActionContributionResolutionRequest,
        ActionContributionResolution
      >("/action-contributions/resolve", request);
    },
    readConfig(
      request: ModuleConfigReadRequest
    ): Promise<ModuleConfigReadResponse> {
      assertModuleConfigTarget(request.moduleId, moduleId);
      return operation<ModuleConfigReadRequest, ModuleConfigReadResponse>(
        "/config/read",
        request
      );
    },
    writeConfig(
      request: ModuleConfigWriteRequest
    ): Promise<ModuleConfigWriteResponse> {
      assertModuleConfigTarget(request.moduleId, moduleId);
      return operation<ModuleConfigWriteRequest, ModuleConfigWriteResponse>(
        "/config/write",
        request
      );
    },
    navigate,
  };
}

function sameSurfaceRequestContext(
  left: SurfaceOperationRequest<unknown>["requestContext"],
  right: SurfaceOperationRequest<unknown>["requestContext"]
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.deadlineUnixMs === right.deadlineUnixMs &&
    left.idempotencyKey === right.idempotencyKey &&
    left.story?.storyId === right.story?.storyId &&
    left.story?.segmentId === right.story?.segmentId &&
    left.story?.correlationId === right.story?.correlationId
  );
}

function validateSurfaceRequestContext<Input>(
  request: SurfaceOperationRequest<Input>
): void {
  const context = request.requestContext;
  if (!Number.isSafeInteger(context.deadlineUnixMs)) {
    throw new ConsoleHostError(
      "invalid_request",
      "Surface operation deadline must be a safe integer",
      { status: 400 }
    );
  }
  if (context.deadlineUnixMs <= Date.now()) {
    throw new ConsoleHostError(
      "aborted",
      "Surface operation deadline has expired",
      { status: 408 }
    );
  }
  if (context.tenantId !== undefined && !context.tenantId.trim()) {
    throw new ConsoleHostError(
      "invalid_request",
      "Surface operation tenant id must be non-empty",
      { status: 400 }
    );
  }
  if (context.idempotencyKey !== undefined && !context.idempotencyKey.trim()) {
    throw new ConsoleHostError(
      "invalid_request",
      "Surface operation idempotency key must be non-empty",
      { status: 400 }
    );
  }
  if (context.story && !context.story.storyId.trim()) {
    throw new ConsoleHostError(
      "invalid_request",
      "Surface operation Story context must have a story id",
      { status: 400 }
    );
  }
}

function assertModuleConfigTarget(
  moduleId: string,
  expectedModuleId: string
): void {
  if (!moduleId.trim() || moduleId !== expectedModuleId) {
    throw new ConsoleHostError(
      "invalid_request",
      "Managed Service Module configuration must target the calling Module",
      { status: 400 }
    );
  }
}
