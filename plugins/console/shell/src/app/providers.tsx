import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { AgentIdentityProvider } from "../features/agent/agent-identity-context";
import { AgentQuickPanelProvider } from "../features/agent/agent-quick-panel-context";
import { AppManagementProvider } from "../features/apps/app-management-context";
import { PluginAgentWorkbenchProvider } from "../features/plugins/plugin-agent-workbench-context";
import { queryClient } from "../lib/query-client";

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentIdentityProvider>
        <AppManagementProvider>
          <PluginAgentWorkbenchProvider>
            <AgentQuickPanelProvider>{children}</AgentQuickPanelProvider>
          </PluginAgentWorkbenchProvider>
        </AppManagementProvider>
      </AgentIdentityProvider>
    </QueryClientProvider>
  );
}
