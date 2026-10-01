import { useNavigate } from "@tanstack/react-router";

import { useAgentIdentity } from "../../../src/features/agent/agent-identity-context";
import { AgentQuickPanel } from "../../../src/features/agent/agent-quick-panel";

const AssistantSurface = ({ suspended }: { suspended: boolean }) => {
  const navigate = useNavigate();
  const { agents } = useAgentIdentity();
  if (agents.length === 0) {
    return null;
  }
  return (
    <AgentQuickPanel
      suspended={suspended}
      onOpenFullPage={(agentId, sessionId, projectId) => {
        void navigate({
          params: { agentId, chatId: sessionId ?? "new-task" },
          search: { project: projectId },
          to: "/agent/$agentId/$chatId",
        });
      }}
    />
  );
};

export const createWorkspace = () => ({ Page: AssistantSurface });
