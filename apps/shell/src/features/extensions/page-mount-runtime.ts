import { consoleApiPath } from "../../lib/console-http-paths";
import { contributionAssetUrl } from "./contribution-asset-url";
import type { PageMount } from "./page-contribution-catalog";

const implementations = new Map<string, Promise<unknown>>();

function implementationKey(mount: PageMount) {
  const [, assetPath] = mount.module.split("/assets/");
  return mount.implementationId && assetPath
    ? `${mount.implementationId}:${assetPath}`
    : mount.module;
}

/** Promote validated recovery code for other instance factories of this implementation. */
export function acceptPageImplementationRecovery(mount: PageMount) {
  const key = implementationKey(mount);
  const recovered = implementations.get(`${key}:recovery`);
  if (recovered) {
    implementations.set(key, recovered);
  }
}

/** Cache executable code only. Factories, providers and services belong to a mount. */
export function loadPageImplementation(
  mount: PageMount,
  recover = false
): Promise<unknown> {
  const baseKey = implementationKey(mount);
  const moduleUrl = contributionAssetUrl(mount.module, recover);
  const key =
    moduleUrl === consoleApiPath(mount.module)
      ? baseKey
      : `${baseKey}:recovery`;
  const cached = implementations.get(key);
  if (cached) {
    return cached;
  }
  const entry: { pending?: Promise<unknown> } = {};
  const pending: Promise<unknown> = (async () => {
    try {
      // eslint-disable-next-line no-inline-comments -- Vite requires this import annotation.
      return await import(/* @vite-ignore */ moduleUrl);
    } catch (error) {
      if (implementations.get(key) === entry.pending) {
        implementations.delete(key);
      }
      throw error;
    }
  })();
  entry.pending = pending;
  implementations.set(key, pending);
  if (implementations.size > 64) {
    const first = implementations.keys().next().value;
    if (first) {
      implementations.delete(first);
    }
  }
  return pending;
}

export function pageMountScopeKey(
  mount: PageMount,
  expectedSubject?: string
): string {
  return JSON.stringify([
    mount.id,
    mount.owner.instance,
    mount.subject,
    mount.revision,
    mount.implementationId ?? mount.module,
    mount.requirements,
    expectedSubject,
  ]);
}
