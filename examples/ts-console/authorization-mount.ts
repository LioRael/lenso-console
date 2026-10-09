import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ConsoleMount } from "@lenso/console";
import { compiledWorkspaceSchema } from "@lenso/console-sdk/protocol";

import { authorizationArtifactDirectory } from "./build-authorization";
import { localTarget } from "./local-auth";

/** This local host mounts its existing inspection Manage, not a second authorization service. */
export async function createAuthorizationMount(
  authorization: ConsoleMount["services"][string] & { plugin: { id: string } },
  apiBasePath: string
): Promise<ConsoleMount> {
  let source: string;
  try {
    source = await readFile(
      path.join(authorizationArtifactDirectory, "descriptor.json"),
      "utf-8"
    );
  } catch (error) {
    throw new Error(
      "Build the authorization page with bun examples/ts-console/build-authorization.ts before starting the local host.",
      { cause: error }
    );
  }
  const artifact = compiledWorkspaceSchema.parse(JSON.parse(source));
  const workspace = artifact.workspaces.find(
    (candidate) => candidate.id === "authorization"
  );
  if (!workspace?.path) {
    throw new Error("The compiled authorization workspace is unavailable.");
  }
  const assets = new Map(artifact.assets.map((asset) => [asset.path, asset]));
  const assetBase = `${apiBasePath.replace(/\/$/, "")}/console/v1/pages/authorization/assets/${artifact.revision}/`;
  return {
    descriptor: {
      apiMajor: 1,
      protocol: "lenso-console-rpc/2",
      id: "authorization",
      pageId: "authorization",
      implementationId: artifact.revision,
      title: workspace.title,
      targetId: localTarget,
      subject: { kind: "console" },
      owner: {
        instance: authorization.plugin.id,
        source: "application",
        trusted: true,
      },
      revision: artifact.revision,
      basePath: workspace.path,
      module: `${assetBase}${artifact.module}`,
      styles: artifact.styles.map((style) => `${assetBase}${style}`),
      navigation: workspace.navigation,
      access: workspace.access,
      routes: workspace.routes,
      requirements: [
        {
          service_id: "authorization",
          capability_id: "console.authorization.inspect",
          descriptor_version: "1",
          operations: ["inspect"],
          available: true,
          required: true,
          source: "owner",
        },
      ],
    },
    services: {
      authorization: {
        manage: authorization.manage,
        operations: authorization.operations,
      },
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
}
