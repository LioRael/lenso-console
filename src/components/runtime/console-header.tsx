import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  LogOut,
  Menu,
  PanelsTopLeft,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import type { useAgentIdentity } from "../../features/agent/agent-identity-context";
import { AgentQuickPanel } from "../../features/agent/agent-quick-panel";
import type { PageMount } from "../../features/extensions/page-contribution-catalog";
import { ConsoleSearch, type ConsoleSearchItem } from "./console-search";
import { shellStyles } from "./console-shell.stylex";

type Agent = ReturnType<typeof useAgentIdentity>["agents"][number];
type WorkspaceState = {
  currentArea: "agent" | "settings" | "system" | "workspace" | "management";
  currentWorkspace: PageMount | undefined;
  currentWorkspaceLocation: { segments: readonly string[] } | undefined;
  visibleWorkspaces: readonly PageMount[];
};

export function ConsoleHeader({
  activeAgent,
  agents,
  mobileNavRef,
  mobileNavigationOpen,
  onSelectAgent,
  onToggleMobileNavigation,
  onOpenWorkspace,
  onSignOut,
  showAdmin,
  showManagement,
  workspaceState,
}: {
  activeAgent: Agent;
  agents: readonly Agent[];
  mobileNavRef: RefObject<HTMLButtonElement | null>;
  mobileNavigationOpen: boolean;
  onSelectAgent: (id: string) => void;
  onToggleMobileNavigation: () => void;
  onOpenWorkspace: (workspace: PageMount, segments: readonly string[]) => void;
  onSignOut: (() => Promise<void>) | undefined;
  showAdmin: boolean;
  showManagement: boolean;
  workspaceState: WorkspaceState;
}) {
  const t = useConsoleTranslation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    currentArea,
    currentWorkspace,
    currentWorkspaceLocation,
    visibleWorkspaces,
  } = workspaceState;
  const workspaceLabel =
    currentArea === "workspace"
      ? (currentWorkspace?.title ?? t("Workspace"))
      : currentArea === "agent"
        ? activeAgent.label
        : t(
            currentArea === "management"
              ? "Management"
              : currentArea === "settings"
                ? "Settings"
                : "System"
          );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);
  const choose = (action: () => void) => {
    setMenuOpen(false);
    action();
  };
  const selectAgentDestination = (agentId: string) => {
    if (currentArea !== "agent" || activeAgent.id !== agentId) {
      onSelectAgent(agentId);
    }
  };
  const searchItems: ConsoleSearchItem[] = [
    ...agents.map((agent) => ({
      id: `agent:${agent.id}`,
      group: t("Agent"),
      label: agent.label,
      onSelect: () => selectAgentDestination(agent.id),
    })),
    ...(showAdmin
      ? [
          {
            id: "system",
            group: t("System"),
            label: t("Plugins"),
            onSelect: () => navigate({ to: "/plugins" }),
          },
          {
            id: "settings",
            group: t("Settings"),
            label: t("Settings"),
            onSelect: () => navigate({ to: "/settings" }),
          },
        ]
      : []),
    ...(showManagement
      ? [
          {
            id: "management",
            group: t("Management"),
            label: t("Available operations"),
            onSelect: () => navigate({ to: "/management" }),
          },
        ]
      : []),
    ...visibleWorkspaces.flatMap((workspace) =>
      (workspace.navigation.items.length
        ? workspace.navigation.items
        : [{ label: workspace.navigation.label, path: [] }]
      ).map((item) => ({
        id: `workspace:${workspace.subject.kind === "app" ? workspace.subject.appId : "console"}:${workspace.id}:${item.path.join("/")}`,
        group: workspace.navigation.label,
        label: item.label,
        onSelect: () => onOpenWorkspace(workspace, item.path),
      }))
    ),
  ];
  return (
    <header inert={mobileNavigationOpen} {...stylex.props(shellStyles.header)}>
      <button
        ref={mobileNavRef}
        aria-controls="console-sidebar"
        aria-expanded={mobileNavigationOpen}
        aria-label={t(
          mobileNavigationOpen
            ? "Close workspace navigation"
            : "Open workspace navigation"
        )}
        {...stylex.props(shellStyles.mobileNavTrigger)}
        onClick={onToggleMobileNavigation}
        type="button"
      >
        <Menu aria-hidden="true" size={16} />
      </button>
      <div ref={menuRef} {...stylex.props(shellStyles.workspaceAnchor)}>
        <button
          aria-controls="console-workspace-menu"
          aria-expanded={menuOpen}
          aria-label={`${t("Workspace")}: ${workspaceLabel}`}
          {...stylex.props(shellStyles.workspaceTrigger)}
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span aria-hidden="true" {...stylex.props(shellStyles.mark)}>
            ✳
          </span>
          <span {...stylex.props(shellStyles.workspaceName)}>
            {workspaceLabel}
          </span>
          <ChevronDown aria-hidden="true" size={13} />
        </button>
        {menuOpen && (
          <nav
            id="console-workspace-menu"
            aria-label={t("Workspaces")}
            {...stylex.props(shellStyles.workspaceMenu)}
          >
            <span {...stylex.props(shellStyles.menuCaption)}>
              {t("Workspaces")}
            </span>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                aria-current={
                  currentArea === "agent" && activeAgent.id === agent.id
                    ? "page"
                    : undefined
                }
                {...stylex.props(shellStyles.workspaceOption)}
                onClick={() => choose(() => selectAgentDestination(agent.id))}
              >
                {agent.label}
                {currentArea === "agent" && activeAgent.id === agent.id && (
                  <Check aria-hidden="true" size={14} />
                )}
              </button>
            ))}
            {showAdmin && (
              <button
                type="button"
                aria-current={currentArea === "system" ? "page" : undefined}
                {...stylex.props(shellStyles.workspaceOption)}
                onClick={() => choose(() => navigate({ to: "/plugins" }))}
              >
                {t("System")}
                {currentArea === "system" && (
                  <Check aria-hidden="true" size={14} />
                )}
              </button>
            )}
            {showManagement && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void navigate({ to: "/management" });
                }}
                {...stylex.props(shellStyles.workspaceOption)}
              >
                {t("Management")}
              </button>
            )}
            {visibleWorkspaces.map((workspace) => (
              <button
                key={`${workspace.subject.kind === "app" ? workspace.subject.appId : "console"}:${workspace.id}`}
                type="button"
                aria-current={
                  currentWorkspace === workspace ? "page" : undefined
                }
                {...stylex.props(shellStyles.workspaceOption)}
                onClick={() =>
                  choose(() => {
                    if (currentWorkspace !== workspace) {
                      onOpenWorkspace(workspace, []);
                    }
                  })
                }
              >
                <PanelsTopLeft aria-hidden="true" size={16} />
                {workspace.navigation.label}
                {currentWorkspace === workspace && (
                  <Check aria-hidden="true" size={14} />
                )}
              </button>
            ))}
            {showAdmin && (
              <button
                type="button"
                aria-current={currentArea === "settings" ? "page" : undefined}
                {...stylex.props(shellStyles.workspaceOption)}
                onClick={() => choose(() => navigate({ to: "/settings" }))}
              >
                <Settings aria-hidden="true" size={16} />
                {t("Settings")}
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                {...stylex.props(shellStyles.workspaceOption)}
                onClick={() =>
                  choose(() => {
                    void onSignOut();
                  })
                }
              >
                <LogOut aria-hidden="true" size={16} />
                {t("Sign out")}
              </button>
            )}
          </nav>
        )}
      </div>
      {showAdmin && agents.length > 0 && (
        <div {...stylex.props(shellStyles.assistant)}>
          <AgentQuickPanel
            onOpenFullPage={(agentId, sessionId) =>
              navigate({
                params: { agentId, chatId: sessionId ?? "new-task" },
                to: "/agent/$agentId/$chatId",
              })
            }
          />
        </div>
      )}
      <span aria-hidden="true" {...stylex.props(shellStyles.divider)} />
      <nav
        aria-label={`${workspaceLabel} ${t("navigation")}`}
        {...stylex.props(shellStyles.tabs)}
      >
        {currentArea === "workspace" ? (
          currentWorkspace?.navigation.items.map((item) => (
            <button
              key={item.path.join("/") || "home"}
              type="button"
              aria-current={
                currentWorkspaceLocation?.segments.length ===
                  item.path.length &&
                item.path.every(
                  (segment, i) =>
                    currentWorkspaceLocation.segments[i] === segment
                )
                  ? "page"
                  : undefined
              }
              {...stylex.props(shellStyles.tab)}
              onClick={() => onOpenWorkspace(currentWorkspace, item.path)}
            >
              {item.label}
            </button>
          ))
        ) : (
          <span
            aria-current="page"
            {...stylex.props(shellStyles.tab, shellStyles.currentTab)}
          >
            {currentArea === "agent"
              ? t("Chat")
              : currentArea === "system"
                ? t("Plugins")
                : t("Settings")}
          </span>
        )}
      </nav>
      <ConsoleSearch items={searchItems} />
    </header>
  );
}
