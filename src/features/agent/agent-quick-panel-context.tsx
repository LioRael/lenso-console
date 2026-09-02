import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { AgentId } from "./agent-runtime";

export type AgentDraftRequest = {
  agentId: AgentId;
  draft: string;
  id: number;
};

type AgentQuickPanelState = {
  draftRequest: AgentDraftRequest | null;
  requestAgentDraft: (request: Omit<AgentDraftRequest, "id">) => void;
};

const AgentQuickPanelContext = createContext<AgentQuickPanelState | undefined>(
  undefined
);

export function AgentQuickPanelProvider({ children }: PropsWithChildren) {
  const nextRequestId = useRef(0);
  const [draftRequest, setDraftRequest] = useState<AgentDraftRequest | null>(
    null
  );
  const requestAgentDraft = useCallback(
    (request: Omit<AgentDraftRequest, "id">) => {
      nextRequestId.current += 1;
      setDraftRequest({ ...request, id: nextRequestId.current });
    },
    []
  );
  const value = useMemo(
    () => ({ draftRequest, requestAgentDraft }),
    [draftRequest, requestAgentDraft]
  );
  return (
    <AgentQuickPanelContext.Provider value={value}>
      {children}
    </AgentQuickPanelContext.Provider>
  );
}

export function useAgentQuickPanel() {
  const value = useContext(AgentQuickPanelContext);
  if (!value) {
    throw new Error(
      "useAgentQuickPanel must be used inside AgentQuickPanelProvider"
    );
  }
  return value;
}
