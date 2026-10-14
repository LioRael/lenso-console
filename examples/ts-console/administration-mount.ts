import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ConsoleMount } from "@lenso/console";
import { compiledWorkspaceSchema } from "@lenso/console-sdk/protocol";

import { administrationArtifactDirectory } from "./build-authorization";

const pages = {
  identity: [
    "info",
    "usersList",
    "usersRead",
    "usersDisable",
    "sessionsList",
    "sessionsRevoke",
  ],
  access: [
    "info",
    "usersList",
    "usersRead",
    "accessRead",
    "membersSet",
    "membersRevoke",
    "membersPromote",
    "rolesSave",
    "permissionsRead",
  ],
  agent: ["info", "tokensList", "tokensRevoke", "auditList"],
} as const;
const defaultScope = { targetId: "local", tenantId: "local" };

/** Three presentations of the same admitted owner; no page owns business state. */
export async function createAdministrationMounts(
  administration: ConsoleMount["services"][string] & { plugin: { id: string } },
  apiBasePath: string,
  scope = defaultScope
): Promise<ConsoleMount[]> {
  return Promise.all(
    Object.entries(pages).map(async ([id, methods]) => {
      const artifact = compiledWorkspaceSchema.parse(
        JSON.parse(
          await readFile(
            path.join(administrationArtifactDirectory(id), "descriptor.json"),
            "utf-8"
          )
        )
      );
      const workspace = artifact.workspaces.find(
        (candidate) => candidate.id === id
      );
      if (!workspace?.path) {
        throw new Error(
          `Build the ${id} administration page before starting Console.`
        );
      }
      const assets = new Map(
        artifact.assets.map((asset) => [asset.path, asset])
      );
      const assetBase = `${apiBasePath}/console/v1/pages/${id}/assets/${artifact.revision}/`;
      const operations = administration.operations.filter((operation) =>
        (methods as readonly string[]).includes(operation.method)
      );
      return {
        descriptor: {
          apiMajor: 1,
          protocol: "lenso-console-rpc/2",
          id,
          pageId: id,
          implementationId: artifact.revision,
          title: workspace.title,
          targetId: scope.targetId,
          subject: { kind: "console" },
          owner: {
            instance: administration.plugin.id,
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
              service_id: "administration",
              capability_id: `console.administration.${id}`,
              descriptor_version: "1",
              operations: operations.map((operation) => operation.method),
              available: true,
              required: true,
              source: "owner",
            },
          ],
        },
        services: {
          administration: { manage: administration.manage, operations },
        },
        ...(id === "agent"
          ? {
              credentials: {
                issuePath: `${apiBasePath}/admin/credentials/issue`,
                rotatePath: `${apiBasePath}/admin/credentials/rotate`,
                resources: {
                  issue: {
                    action: "invoke" as const,
                    ...scope,
                    pluginId: administration.plugin.id,
                    operation: "issue",
                  },
                  rotate: {
                    action: "invoke" as const,
                    ...scope,
                    pluginId: administration.plugin.id,
                    operation: "rotate",
                  },
                },
              },
            }
          : {}),
        async asset(relativePath: string) {
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
    })
  );
}
