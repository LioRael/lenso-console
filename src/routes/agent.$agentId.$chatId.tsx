import { createFileRoute } from "@tanstack/react-router";

import { AgentPage } from "../features/agent/agent-page";

export const Route = createFileRoute("/agent/$agentId/$chatId")({
  component: AgentConversationRoute,
});

function AgentConversationRoute() {
  const { agentId, chatId } = Route.useParams();
  return <AgentPage agentId={agentId} conversationId={chatId} />;
}
