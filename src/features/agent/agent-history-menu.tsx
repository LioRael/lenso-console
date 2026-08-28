import { Menu } from "@lenso/ui/menu";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareText, Plus } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { agentConversations } from "./agent-model";

export function AgentHistoryMenu({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <Menu.Root>
      <Menu.Trigger render={children as ReactElement} />
      <Menu.Portal>
        <Menu.Positioner align="end" side="top" sideOffset={6}>
          <Menu.Popup aria-label="Agent history">
            <Menu.Item onClick={() => navigate({ to: "/" })}>
              <Menu.Leading>
                <Plus size={15} strokeWidth={1.7} />
              </Menu.Leading>
              <Menu.Label>New chat</Menu.Label>
            </Menu.Item>
            <Menu.Separator />
            {agentConversations.map((conversation) => (
              <Menu.Item
                key={conversation.id}
                onClick={() =>
                  navigate({
                    params: { chatId: conversation.id },
                    to: "/agent/$chatId",
                  })
                }
              >
                <Menu.Leading>
                  <MessageSquareText size={15} strokeWidth={1.7} />
                </Menu.Leading>
                <Menu.Label>{conversation.title}</Menu.Label>
                <Menu.Trailing>{conversation.age}</Menu.Trailing>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
