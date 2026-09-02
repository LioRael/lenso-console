import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type PluginDraftReview = {
  baseRevision: string;
  baseSourceDigest: string;
  configurationToml: string;
  proposalDigest: string;
};

export type PluginWorkbenchRequest = {
  agentId: string;
  draftReview?: PluginDraftReview;
  id: number;
  instanceKey: string;
  packageId: string;
};

type PluginAgentWorkbenchState = {
  request: PluginWorkbenchRequest | null;
  requestWorkbench: (request: Omit<PluginWorkbenchRequest, "id">) => void;
};

const PluginAgentWorkbenchContext = createContext<
  PluginAgentWorkbenchState | undefined
>(undefined);

export function PluginAgentWorkbenchProvider({ children }: PropsWithChildren) {
  const nextRequestId = useRef(0);
  const [request, setRequest] = useState<PluginWorkbenchRequest | null>(null);
  const requestWorkbench = useCallback(
    (next: Omit<PluginWorkbenchRequest, "id">) => {
      nextRequestId.current += 1;
      setRequest({ ...next, id: nextRequestId.current });
    },
    []
  );
  const value = useMemo(
    () => ({ request, requestWorkbench }),
    [request, requestWorkbench]
  );
  return (
    <PluginAgentWorkbenchContext.Provider value={value}>
      {children}
    </PluginAgentWorkbenchContext.Provider>
  );
}

export function usePluginAgentWorkbench() {
  const value = useContext(PluginAgentWorkbenchContext);
  if (!value) {
    throw new Error(
      "usePluginAgentWorkbench must be used inside PluginAgentWorkbenchProvider"
    );
  }
  return value;
}
