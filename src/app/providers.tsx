import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { AgentTargetProvider } from "../features/agent/agent-target-context";
import { queryClient } from "../lib/query-client";
import { ConsoleAppearanceProvider } from "./console-appearance";

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentTargetProvider>
        <ConsoleAppearanceProvider>{children}</ConsoleAppearanceProvider>
      </AgentTargetProvider>
    </QueryClientProvider>
  );
}
