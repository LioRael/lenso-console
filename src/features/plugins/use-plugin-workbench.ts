import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { httpClient, isApiMode } from "../../lib/http-client";
import {
  decodePluginWorkbenchProjection,
  demoPluginWorkbenchProjection,
  type PluginWorkbenchProjection,
} from "./plugin-workbench-model";
import {
  observePluginWorkbench,
  type PluginWorkbenchStreamState,
} from "./plugin-workbench-stream";

export const pluginWorkbenchQueryKey = [
  "plugin-workbench",
  "projection",
] as const;

export function usePluginWorkbench() {
  const queryClient = useQueryClient();
  const canObserveStream = isApiMode() || import.meta.env.DEV;
  const [streamState, setStreamState] = useState<PluginWorkbenchStreamState>(
    canObserveStream ? "connecting" : "stopped"
  );
  const query = useQuery({
    queryFn: fetchPluginWorkbench,
    queryKey: pluginWorkbenchQueryKey,
  });
  const streamPath = canObserveStream ? query.data?.stream.path : undefined;

  useEffect(() => {
    if (!streamPath) {
      return;
    }
    const current = queryClient.getQueryData<PluginWorkbenchProjection>(
      pluginWorkbenchQueryKey
    );
    const controller = new AbortController();
    void observePluginWorkbench({
      cursor: current?.stream.cursor,
      onProjection: (projection) => {
        queryClient.setQueryData(pluginWorkbenchQueryKey, projection);
      },
      onState: setStreamState,
      path: streamPath,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [queryClient, streamPath]);

  return {
    ...query,
    mode: isApiMode() ? ("live" as const) : ("demo" as const),
    streamState,
  };
}

async function fetchPluginWorkbench(): Promise<PluginWorkbenchProjection> {
  if (!isApiMode()) {
    return demoPluginWorkbenchProjection;
  }
  const value = await httpClient
    .get("api/console/v1/plugin-workbench")
    .json<unknown>();
  return decodePluginWorkbenchProjection(value);
}
