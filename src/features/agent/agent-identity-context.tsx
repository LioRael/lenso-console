import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
  listAgents,
  type AgentId,
  type AgentIdentity,
} from "./agent-runtime";

const storageKey = "lenso.console.agent-id";
const legacyStorageKey = "lenso.console.agent-target";
const consoleAgent: AgentIdentity = {
  capabilities: [AGENT_PLUGIN_CONFIGURATION_CAPABILITY],
  id: "console",
  label: "Console Agent",
  role: "console",
};

type AgentIdentityState = {
  agents: AgentIdentity[];
  selectAgent: (agentId: AgentId) => void;
  selectedAgent: AgentIdentity;
};

const AgentIdentityContext = createContext<AgentIdentityState | undefined>(
  undefined
);

export function AgentIdentityProvider({ children }: PropsWithChildren) {
  const [preferredAgentId, setPreferredAgentId] = useState<AgentId | null>(
    storedAgentId
  );
  const { data } = useQuery({
    queryFn: ({ signal }) => listAgents(signal),
    queryKey: ["agent-catalog"],
    retry: false,
  });
  const agents = useMemo(() => (data?.length ? data : [consoleAgent]), [data]);
  const selectedAgent =
    agents.find((agent) => agent.id === preferredAgentId) ??
    agents.find((agent) => agent.role === "app") ??
    agents.find((agent) => agent.role === "console") ??
    agents[0] ??
    consoleAgent;
  const selectAgent = useCallback((agentId: AgentId) => {
    setPreferredAgentId(agentId);
    window.localStorage.setItem(storageKey, agentId);
    window.localStorage.removeItem(legacyStorageKey);
  }, []);
  const value = useMemo<AgentIdentityState>(
    () => ({ agents, selectAgent, selectedAgent }),
    [agents, selectAgent, selectedAgent]
  );
  return (
    <AgentIdentityContext.Provider value={value}>
      {children}
    </AgentIdentityContext.Provider>
  );
}

export function useAgentIdentity() {
  const value = useContext(AgentIdentityContext);
  if (!value) {
    throw new Error(
      "useAgentIdentity must be used inside AgentIdentityProvider"
    );
  }
  return value;
}

function storedAgentId(): AgentId | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(storageKey);
  if (stored && validAgentId(stored)) {
    return stored;
  }
  const legacy = window.localStorage.getItem(legacyStorageKey);
  if (legacy === "connected") {
    return "app";
  }
  return legacy === "console" ? legacy : null;
}

function validAgentId(value: string) {
  return /^[a-z][a-z0-9._-]{0,63}$/u.test(value);
}
