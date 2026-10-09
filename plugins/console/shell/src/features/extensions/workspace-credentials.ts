import { createConsoleWorkspaceCredentials } from "@lenso/console-sdk/credentials";

import { sessionFetch } from "../../lib/session-fetch";
import type { PageMount } from "./page-contribution-catalog";

export function createWorkspaceCredentials(
  mount: PageMount,
  signal: AbortSignal,
  expectedSubject: string
) {
  if (!mount.credentials || mount.protocol !== "lenso-console-rpc/2") {
    return undefined;
  }
  if (
    mount.transport &&
    Object.values(mount.credentials).some(
      (path) =>
        path !== undefined &&
        !path.startsWith(`${mount.transport!.apiBasePath}/`)
    )
  ) {
    throw new Error(
      "Credential routes must remain within their bound workspace source"
    );
  }
  return createConsoleWorkspaceCredentials({
    paths: mount.credentials,
    signal,
    expectedSubject,
    fetch: (url, options) => sessionFetch(url, options, mount.transport),
  });
}
