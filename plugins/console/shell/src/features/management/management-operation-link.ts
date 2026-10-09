import type { ConsoleOperationDescriptor } from "@lenso/console-sdk/protocol";

import type { PageMount } from "../extensions/page-contribution-catalog";
import { workspacePageHref } from "../extensions/workspace-paths";

export function managementOperationHref(
  pages: readonly PageMount[],
  operation: Pick<
    ConsoleOperationDescriptor,
    "targetId" | "pluginId" | "method"
  >
): string | undefined {
  const matches = pages.filter(
    (mount) =>
      (mount.targetId ??
        (mount.subject.kind === "app" ? mount.subject.appId : undefined)) ===
        operation.targetId &&
      mount.owner.instance === operation.pluginId &&
      mount.requirements.some(
        (requirement) =>
          requirement.source === "owner" &&
          requirement.available &&
          requirement.operations.includes(operation.method)
      )
  );
  return matches.length === 1 ? workspacePageHref(matches[0]!, []) : undefined;
}
