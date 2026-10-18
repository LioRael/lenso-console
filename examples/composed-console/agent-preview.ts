import { createAgentConsoleClient } from "@lenso/agent-console/client";
import type { AgentConsoleServices } from "@lenso/agent-console/react";

/** This example never discovers credentials or contacts a real model provider. */
export function previewAgentServices(
  replay: boolean,
  configure: () => void
): AgentConsoleServices {
  return {
    ...(replay
      ? {
          client: createAgentConsoleClient({
            basePath: "/agent-replay",
            profile: "protocol-replay",
            fetch: (input, init) => fetch(input, init),
          }),
          connection: {
            state: "ready",
            provider: "Protocol replay",
            account: "Synthetic fixture",
            model: "No model invoked",
            scope: "Isolated preview",
          },
          notice:
            "Synthetic protocol replay — no model provider or business tool is contacted.",
        }
      : { connection: { state: "disconnected" } }),
    configure: { label: "Agent connections", open: configure },
  };
}
