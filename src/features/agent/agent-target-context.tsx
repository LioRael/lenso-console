import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  listAgentTargets,
  type AgentTarget,
  type AgentTargetId,
} from "./agent-runtime";

const storageKey = "lenso.console.agent-target";
const consoleTarget: AgentTarget = {
  id: "console",
  kind: "console",
  label: "Console Agent",
};

type AgentTargetState = {
  selectTarget: (targetId: AgentTargetId) => void;
  selectedTarget: AgentTarget;
  targets: AgentTarget[];
};

const AgentTargetContext = createContext<AgentTargetState | undefined>(
  undefined
);

export function AgentTargetProvider({ children }: PropsWithChildren) {
  const [preferredTarget, setPreferredTarget] = useState<AgentTargetId | null>(
    storedTarget
  );
  const { data } = useQuery({
    queryFn: ({ signal }) => listAgentTargets(signal),
    queryKey: ["agent-targets"],
    retry: false,
  });
  const targets = useMemo(
    () => (data?.length ? data : [consoleTarget]),
    [data]
  );
  const selectedTarget =
    targets.find((target) => target.id === preferredTarget) ??
    targets.find((target) => target.id === "connected") ??
    targets[0] ??
    consoleTarget;
  const value = useMemo<AgentTargetState>(
    () => ({
      selectTarget: (targetId) => {
        setPreferredTarget(targetId);
        window.localStorage.setItem(storageKey, targetId);
      },
      selectedTarget,
      targets,
    }),
    [selectedTarget, targets]
  );
  return (
    <AgentTargetContext.Provider value={value}>
      {children}
    </AgentTargetContext.Provider>
  );
}

export function useAgentTarget() {
  const value = useContext(AgentTargetContext);
  if (!value) {
    throw new Error("useAgentTarget must be used inside AgentTargetProvider");
  }
  return value;
}

function storedTarget(): AgentTargetId | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(storageKey);
  return value === "console" || value === "connected" ? value : null;
}
