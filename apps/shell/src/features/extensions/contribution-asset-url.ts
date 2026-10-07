import { consoleApiPath, consoleHttpPaths } from "../../lib/console-http-paths";

// A document may have successfully imported an empty response before the server
// recovered. Retry needs one fresh ESM identity, not another same-URL import.
let recoveryIdentity: string | undefined;
const recoveredAssets = new Set<string>();

export function contributionAssetUrl(href: string, recover: boolean): string {
  if (
    !(recover || recoveredAssets.has(href)) ||
    ![
      consoleHttpPaths.api_base_path,
      ...(consoleHttpPaths.workspace_sources ?? []).map(
        (source) => source.api_base_path
      ),
    ].some((base) =>
      consoleApiPath(href).startsWith(`${base}/console/v1/pages/`)
    )
  ) {
    return consoleApiPath(href);
  }
  recoveryIdentity ??= crypto.randomUUID();
  const url = new URL(consoleApiPath(href), window.location.origin);
  url.searchParams.set("__lenso_console_recovery", recoveryIdentity);
  // Reuse this identity across retries and instance factories. This leaves the
  // descriptor digest, same-origin CSP and backend authorization path intact.
  return `${url.pathname}${url.search}`;
}

/** Prefer recovered identities on remount only after the module passed validation. */
export function acceptContributionRecovery(assets: readonly string[]) {
  for (const href of assets) {
    recoveredAssets.add(href);
  }
}
