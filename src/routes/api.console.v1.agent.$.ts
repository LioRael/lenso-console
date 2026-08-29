import { createFileRoute } from "@tanstack/react-router";

import { proxyAgentHarnessRequest } from "../server/agent-harness.server";

const proxy = ({ request }: { request: Request }) =>
  proxyAgentHarnessRequest(request);

export const Route = createFileRoute("/api/console/v1/agent/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
    },
  },
});
