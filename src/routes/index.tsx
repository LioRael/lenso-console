import { createFileRoute } from "@tanstack/react-router";

import { AgentPage } from "../features/agent/agent-page";

export const Route = createFileRoute("/")({
  component: AgentPage,
});
