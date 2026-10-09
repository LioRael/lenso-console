import { canonicalWorkspacePath } from "@lenso/console-sdk/paths";
import type { Operation } from "@lenso/engine/operations";
import type { Manage } from "@lenso/manage";

import assets from "../.generated/management-assets.json";
import type { ConsoleMount, ConsolePageDescriptor } from "./types";

export type ConsoleManagementPage =
  | "audit"
  | "api-keys"
  | "authorization"
  | "tasks"
  | "scheduler";

/** Select an owner-built page and existing Manage declarations; no service or resources are installed. */
export function createConsoleManagementMount(options: {
  readonly id: string;
  readonly page: ConsoleManagementPage;
  readonly title: string;
  readonly subject: ConsolePageDescriptor["subject"];
  readonly manage: Manage;
  readonly operations?: readonly Operation[];
  readonly basePath?: string;
  readonly access?: "member" | "administrator";
  readonly apiBasePath?: string;
  readonly credentials?: ConsoleMount["credentials"];
}): ConsoleMount {
  const page = assets[options.page];
  const operations = options.operations ?? options.manage.operations;
  const subjectPrefix =
    options.subject.kind === "app" ? `/apps/${options.subject.appId}` : "";
  const requestedPath = options.basePath ?? `${subjectPrefix}/${options.id}/`;
  if (subjectPrefix && !requestedPath.startsWith(`${subjectPrefix}/`)) {
    throw new Error("Application pages must remain within their subject route");
  }
  const basePath =
    subjectPrefix +
    canonicalWorkspacePath(
      requestedPath.slice(subjectPrefix.length),
      options.access === "administrator"
    );
  const prefix = `${options.apiBasePath ?? "/api"}/console/v1/pages/${options.id}/assets/${page.revision}/`;
  return {
    descriptor: {
      apiMajor: 1,
      protocol: "lenso-console-rpc/2",
      id: options.id,
      title: options.title,
      subject: options.subject,
      owner: {
        instance: options.manage.plugin.id,
        source: "application",
        trusted: true,
      },
      revision: page.revision,
      implementationId: page.revision,
      basePath,
      ...(options.access ? { access: options.access } : {}),
      module: prefix + page.module,
      styles: page.styles.map((style) => prefix + style),
      navigation: {
        label: options.title,
        items: [{ label: options.title, path: [] }],
      },
      routes: [[]],
      index: [],
      requirements: [
        {
          service_id: options.page,
          capability_id: options.page,
          descriptor_version: "1",
          operations: operations.map((operation) => operation.method),
          available: true,
          required: true,
          source: "owner",
        },
      ],
    },
    services: { [options.page]: { manage: options.manage, operations } },
    ...(options.credentials ? { credentials: options.credentials } : {}),
    async asset(relativePath) {
      const asset = page.assets.find(
        (candidate) => candidate.path === relativePath
      );
      if (!asset) {
        return undefined;
      }
      const bytes = Uint8Array.from(atob(asset.content_base64), (character) =>
        character.codePointAt(0)!
      );
      return new Response(bytes, {
        headers: { "content-type": asset.media_type },
      });
    },
  };
}
