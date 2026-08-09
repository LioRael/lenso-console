import {
  ConsoleHostError,
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

  return {
    identity: { moduleId, moduleReleaseDigest, uiArtifactDigest },
    managedServiceContext,
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
    async query<Result>(_operation: {
      readonly name: string;
    }): Promise<Result> {
      throw new ConsoleHostError(
        "incompatible",
        `Generic Console query operations are not part of the framework contract: ${_operation.name}`
      );
    },
    async command<_Input, Result>(
      descriptor: { readonly name: string },
      _options?: { idempotencyKey?: string }
    ): Promise<Result> {
      throw new ConsoleHostError(
        "incompatible",
        `Generic Console command operations are not part of the framework contract: ${descriptor.name}`
      );
    },
    navigate,
  };
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
