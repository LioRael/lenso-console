import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ConsoleAuthentication, ConsoleMount } from "@lenso/console";
import { createConsoleRuntimeInspection } from "@lenso/console-runtime/server";
import { compiledWorkspaceSchema } from "@lenso/console-sdk/protocol";
import type { Plugin } from "@lenso/core/plugin";
import { createRuntimePlugin } from "@lenso/runtime";

import { runtimeArtifactDirectory } from "./build-runtime";
import { localScope, localTarget } from "./local-auth";

export async function createRuntimeMount(
  authentication: Plugin<ConsoleAuthentication>,
  port: number,
  apiBasePath: string
) {
  let source: string;
  try {
    source = await readFile(
      path.join(runtimeArtifactDirectory, "descriptor.json"),
      "utf-8"
    );
  } catch (error) {
    throw new Error(
      "Build the Runtime page with bun examples/ts-console/build-runtime.ts before enabling LENSO_RUNTIME_PORT.",
      { cause: error }
    );
  }
  const artifact = compiledWorkspaceSchema.parse(JSON.parse(source));
  const workspace = artifact.workspaces.find(
    (candidate) => candidate.id === "runtime"
  );
  if (!workspace?.path) {
    throw new Error("The compiled Runtime workspace is unavailable.");
  }
  const runtime = createRuntimePlugin({
    id: "local-runtime",
    connection: {
      namespace: "console",
      service: "operator",
      instance: randomUUID(),
      port,
      contract: { version: "1", methods: {} },
    },
    clients: () => undefined,
  });
  const inspection = createConsoleRuntimeInspection({
    id: "runtime",
    runtime,
    authentication,
    targetId: localTarget,
    tenantId: localScope.id,
  });
  const assets = new Map(artifact.assets.map((asset) => [asset.path, asset]));
  const assetBase = `${apiBasePath.replace(/\/$/, "")}/console/v1/pages/runtime/assets/${artifact.revision}/`;
  const mount: ConsoleMount = {
    descriptor: {
      apiMajor: 1,
      protocol: "lenso-console-rpc/2",
      id: "runtime",
      pageId: "runtime",
      implementationId: artifact.revision,
      title: workspace.title,
      targetId: localTarget,
      subject: { kind: "console" },
      owner: {
        instance: inspection.plugin.id,
        source: "application",
        trusted: true,
      },
      revision: artifact.revision,
      basePath: `/plugins/${localTarget}/${inspection.plugin.id}/${workspace.id}/`,
      module: `${assetBase}${artifact.module}`,
      styles: artifact.styles.map((style) => `${assetBase}${style}`),
      navigation: workspace.navigation,
      access: workspace.access,
      routes: workspace.routes,
      requirements: [
        {
          service_id: "runtime",
          capability_id: "console.runtime.inspect",
          descriptor_version: "1",
          operations: ["status"],
          available: true,
          required: true,
          source: "owner",
        },
      ],
    },
    services: {
      runtime: { manage: inspection.manage, operations: inspection.operations },
    },
    async asset(relativePath) {
      const asset = assets.get(relativePath);
      return asset
        ? new Response(Buffer.from(asset.content_base64, "base64"), {
            headers: {
              "content-type": asset.media_type,
              "x-content-type-options": "nosniff",
            },
          })
        : undefined;
    },
  };
  return { runtime, inspection, mount };
}
