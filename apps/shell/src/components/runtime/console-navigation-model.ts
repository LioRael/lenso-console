import type { LinkProps, useNavigate } from "@tanstack/react-router";

import type { useAgentIdentity } from "../../features/agent/agent-identity-context";
import type { PageMount } from "../../features/extensions/page-contribution-catalog";
import type { ConsoleSearchItem } from "./console-search";

export type ConsoleDestination = ConsoleSearchItem & {
  selected?: boolean;
  route?: LinkProps;
};

type Agent = ReturnType<typeof useAgentIdentity>["agents"][number];

export function consoleNavigationModel({
  area,
  workspace,
  segments,
  workspaces,
  agent,
  agents,
  sessionId,
  administrator,
  assistantEnabled,
  managementEnabled,
  navigate,
  beforeNavigate,
  translate: t,
}: {
  area: "agent" | "settings" | "system" | "workspace" | "management";
  workspace: PageMount | undefined;
  segments: readonly string[];
  workspaces: readonly PageMount[];
  agent: Agent;
  agents: readonly Agent[];
  sessionId: string | undefined;
  administrator: boolean;
  assistantEnabled: boolean;
  managementEnabled: boolean;
  navigate: ReturnType<typeof useNavigate>;
  beforeNavigate: () => void;
  translate: (message: string) => string;
}) {
  const title =
    area === "workspace"
      ? (workspace?.title ?? t("Workspace"))
      : area === "agent"
        ? agent.label
        : t(
            area === "management"
              ? "Management"
              : area === "settings"
                ? "Settings"
                : "System"
          );
  const destination = (
    id: string,
    group: string,
    label: string,
    selected: boolean,
    route: LinkProps
  ): ConsoleDestination => ({
    id,
    group,
    label,
    selected,
    route,
    onSelect: () => {
      beforeNavigate();
      if (
        !selected ||
        !(id.startsWith("agent:") || id.startsWith("workspace:"))
      ) {
        void navigate(route);
      }
    },
  });
  const destinations = [
    ...(assistantEnabled
      ? agents.map((candidate) =>
          destination(
            `agent:${candidate.id}`,
            t("Agent"),
            candidate.label,
            area === "agent" && agent.id === candidate.id,
            {
              to: "/agent/$agentId/$chatId",
              params: {
                agentId: candidate.id,
                chatId:
                  area === "agent" && agent.id === candidate.id
                    ? (sessionId ?? "new-task")
                    : "new-task",
              },
              search: area === "agent" && agent.id === candidate.id ? true : {},
            }
          )
        )
      : []),
    ...(administrator
      ? [
          destination("system", t("System"), t("Plugins"), area === "system", {
            to: "/plugins",
          }),
          destination(
            "settings",
            t("Settings"),
            t("Settings"),
            area === "settings",
            { to: "/settings" }
          ),
        ]
      : []),
    ...(assistantEnabled && !administrator
      ? [
          destination(
            "settings",
            t("Settings"),
            t("Assistant"),
            area === "settings",
            { to: "/settings/ai" }
          ),
        ]
      : []),
    ...(managementEnabled
      ? [
          destination(
            "management",
            t("Management"),
            t("Available operations"),
            area === "management",
            { to: "/management" }
          ),
        ]
      : []),
    ...workspaces.map((mount) =>
      destination(
        `workspace:${mount.subject.kind === "app" ? mount.subject.appId : "console"}:${mount.id}:`,
        t("Workspace"),
        mount.navigation.label,
        workspace === mount,
        {
          ...workspaceRoute(mount, workspace === mount ? segments : []),
          search: workspace === mount ? true : {},
        }
      )
    ),
  ];
  const searchItems: ConsoleSearchItem[] = [
    ...destinations.filter((item) => !item.id.startsWith("workspace:")),
    ...workspaces.flatMap((mount) =>
      (mount.navigation.items.length
        ? mount.navigation.items
        : [{ label: mount.navigation.label, path: [] }]
      ).map((item) => ({
        id: `page:${mount.subject.kind === "app" ? mount.subject.appId : "console"}:${mount.id}:${item.path.join("/")}`,
        group: mount.navigation.label,
        label: item.label,
        onSelect: () => {
          beforeNavigate();
          void navigate(workspaceRoute(mount, item.path));
        },
      }))
    ),
  ];
  return { title, destinations, searchItems };
}

export function workspaceRoute(
  workspace: PageMount,
  segments: readonly string[]
) {
  const _splat = segments.join("/");
  return workspace.subject.kind === "console"
    ? {
        to: "/workspaces/$workspaceId/$" as const,
        params: { _splat, workspaceId: workspace.id },
      }
    : {
        to: "/apps/$appId/pages/$workspaceId/$" as const,
        params: {
          _splat,
          appId: workspace.subject.appId,
          workspaceId: workspace.id,
        },
      };
}
