import type { PageMount } from "./page-contribution-catalog";

const implementations = new Map<string, Promise<unknown>>();

/** Cache executable code only. Factories, providers and services belong to a mount. */
export function loadPageImplementation(mount: PageMount): Promise<unknown> {
  const [, assetPath] = mount.module.split("/assets/");
  const key =
    mount.implementationId && assetPath
      ? `${mount.implementationId}:${assetPath}`
      : mount.module;
  const cached = implementations.get(key);
  if (cached) {
    return cached;
  }
  const entry: { pending?: Promise<unknown> } = {};
  const pending: Promise<unknown> = (async () => {
    try {
      // eslint-disable-next-line no-inline-comments -- Vite requires this import annotation.
      return await import(/* @vite-ignore */ mount.module);
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
