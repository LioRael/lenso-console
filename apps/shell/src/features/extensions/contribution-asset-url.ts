// A document may have successfully imported an empty response before the server
// recovered. Retry needs one fresh ESM identity, not another same-URL import.
let recoveryIdentity: string | undefined;
const recoveredAssets = new Set<string>();

export function contributionAssetUrl(href: string, recover: boolean): string {
  if (
    !(recover || recoveredAssets.has(href)) ||
    !href.startsWith("/api/console/v1/pages/")
  ) {
    return href;
  }
  recoveryIdentity ??= crypto.randomUUID();
  const url = new URL(href, window.location.origin);
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
