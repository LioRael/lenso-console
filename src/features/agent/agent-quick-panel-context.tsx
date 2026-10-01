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

export type WorkspaceAgentContext = { label: string; text: string };

type AgentQuickPanelState = {
  available: boolean;
  registerPanel: () => () => void;
  completedTurns: number;
  notifyTurnCompleted: () => void;
  pageContext: WorkspaceAgentContext | null;
  setPageContext: (context: WorkspaceAgentContext | null) => void;
  draftRequest: AgentDraftRequest | null;
  requestAgentDraft: (request: Omit<AgentDraftRequest, "id">) => void;
};

const AgentQuickPanelContext = createContext<AgentQuickPanelState | undefined>(
  undefined
);

export function AgentQuickPanelProvider({ children }: PropsWithChildren) {
  const [panelCount, setPanelCount] = useState(0);
  const registerPanel = useCallback(() => {
    setPanelCount((count) => count + 1);
    return () => setPanelCount((count) => count - 1);
  }, []);
  const nextRequestId = useRef(0);
  const [completedTurns, setCompletedTurns] = useState(0);
  const notifyTurnCompleted = useCallback(
    () => setCompletedTurns((n) => n + 1),
    []
  );
  const [pageContext, setPageContext] = useState<WorkspaceAgentContext | null>(
    null
  );
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
    () => ({
      available: panelCount > 0,
      registerPanel,
      completedTurns,
      notifyTurnCompleted,
      draftRequest,
      requestAgentDraft,
      pageContext,
      setPageContext,
    }),
    [
      draftRequest,
      requestAgentDraft,
      pageContext,
      completedTurns,
      notifyTurnCompleted,
      registerPanel,
      panelCount,
    ]
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

export function useOptionalAgentQuickPanel() {
  const context = useContext(AgentQuickPanelContext);
  return context?.available ? context : undefined;
}
