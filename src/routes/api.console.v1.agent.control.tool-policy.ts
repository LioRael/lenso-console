import { createFileRoute } from "@tanstack/react-router";

import { proxyAgentControlRequest } from "../server/agent-control.server";

export const Route = createFileRoute(
  "/api/console/v1/agent/control/tool-policy"
)({
  server: {
    handlers: {
      GET: ({ request }) => proxyAgentControlRequest(request),
      PUT: ({ request }) => proxyAgentControlRequest(request),
    },
  },
});
