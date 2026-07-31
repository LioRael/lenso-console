import { installConsoleBridgeHost } from "@lenso/console-bridge";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { httpClient } from "../lib/http-client";
import { useConsoleComposition } from "./console-composition";

export function ModuleUiPage() {
  const { entryName, moduleId } = useParams({ strict: false });
  const composition = useConsoleComposition();
  const frame = useRef<HTMLIFrameElement>(null);
  const binding = useMemo(() => {
    const module = composition.data?.modules.find(
      (candidate) => candidate.moduleId === moduleId
    );
    const entry = module?.uiEntries?.find(
      (candidate) => candidate.name === entryName
    );
    return module && entry ? { entry, module } : undefined;
  }, [composition.data, entryName, moduleId]);

  const source = useMemo(() => {
    if (!binding?.module.uiArtifactBaseUrl) {
      return undefined;
    }
    const url = new URL(
      binding.entry.path,
      ensureTrailingSlash(binding.module.uiArtifactBaseUrl)
    );
    if (
      url.origin === window.location.origin &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      return undefined;
    }
    return url.toString();
  }, [binding]);

  useEffect(() => {
    if (
      !frame.current ||
      !binding?.module.moduleReleaseDigest ||
      !binding.module.uiArtifactDigest
    ) {
      return;
    }
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    return installConsoleBridgeHost({
      frame: frame.current,
      grant: {
        expiresAt,
        grantedPermissions: binding.module.grantedPermissions ?? [],
        moduleId: binding.module.moduleId,
        moduleReleaseDigest: binding.module.moduleReleaseDigest,
        uiArtifactDigest: binding.module.uiArtifactDigest,
      },
      invoke: async (permission, payload) =>
        httpClient
          .post(
            `modules/${encodeURIComponent(binding.module.moduleId)}/http/console-bridge/${encodeURIComponent(permission)}`,
            {
              json: {
                moduleReleaseDigest: binding.module.moduleReleaseDigest,
                payload,
                permission,
                uiArtifactDigest: binding.module.uiArtifactDigest,
              },
            }
          )
          .json<unknown>(),
    });
  }, [binding]);

  if (!binding || !source) {
    return <p>Console UI artifact is unavailable or not safely isolated.</p>;
  }

  return (
    <iframe
      className="h-[calc(100vh-8rem)] w-full rounded-xl border border-border bg-background"
      ref={frame}
      sandbox="allow-scripts"
      src={source}
      title={binding.entry.label}
    />
  );
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
