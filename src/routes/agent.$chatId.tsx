import { createFileRoute } from "@tanstack/react-router";

import { AgentPage } from "../features/agent/agent-page";

export const Route = createFileRoute("/agent/$chatId")({
  component: AgentConversationRoute,
});

function AgentConversationRoute() {
  const { chatId } = Route.useParams();
  return <AgentPage conversationId={chatId} />;
}
