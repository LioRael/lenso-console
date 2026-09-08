import { createFileRoute } from "@tanstack/react-router";

import { AgentPage } from "../features/agent/agent-page";

export const Route = createFileRoute("/agent/$agentId/$chatId")({
  validateSearch: (
    search: Record<string, unknown>
  ): { project?: string | undefined } => {
    if (search.project === undefined) {
      return {};
    }
    if (
      typeof search.project !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(
        search.project
      )
    ) {
      throw new Error("Invalid project identity");
    }
    return { project: search.project };
  },
  component: AgentConversationRoute,
});

function AgentConversationRoute() {
  const { agentId, chatId } = Route.useParams();
  const { project } = Route.useSearch();
  if (project && agentId !== "app") {
    throw new Error("Projects belong to the local Lenso Agent");
  }
  return (
    <AgentPage
      key={`${agentId}:${project ?? "default"}`}
      agentId={agentId}
      projectId={project}
      conversationId={chatId}
    />
  );
}
