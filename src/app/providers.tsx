import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { AgentIdentityProvider } from "../features/agent/agent-identity-context";
import { AgentQuickPanelProvider } from "../features/agent/agent-quick-panel-context";
import { queryClient } from "../lib/query-client";
import { ConsoleAppearanceProvider } from "./console-appearance";

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentIdentityProvider>
        <AgentQuickPanelProvider>
          <ConsoleAppearanceProvider>{children}</ConsoleAppearanceProvider>
        </AgentQuickPanelProvider>
      </AgentIdentityProvider>
    </QueryClientProvider>
  );
}
