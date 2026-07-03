import { useNavigate } from "@tanstack/react-router";
import {
  Command as CommandGlyph,
  Copy,
  CornerDownLeft,
  GitBranch,
  Menu,
  Moon,
  RotateCcw,
  Search,
  Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useConsoleNavigation } from "../../app/console-module-metadata";
import type { ConsoleNavigationItem } from "../../app/console-modules";
import { SYSTEM_WORKSPACE } from "../../app/console-workspace-navigation";
import { runtimeStories } from "../../data/mock-runtime";
import { queryDataWithMockFallback } from "../../hooks/runtime-query-data";
import { currentBrowserUrl } from "../../hooks/use-browser-url-state";
import { useRuntimeStories } from "../../hooks/use-runtime-queries";
import { isApiMode } from "../../lib/http-client";
import { Dialog } from "../ui/dialog";
import {
  buildStoryCommandItems,
  type CommandItem,
} from "./command-palette-model";
import { useRuntimeConsole } from "./runtime-console-context";

type CommandPaletteProps = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

type CommandNavigationItem = ConsoleNavigationItem & {
  keywords?: string;
};

type CommandEntry = {
  command: CommandItem;
  index: number;
};

const systemCommandNavigationItems = [
  {
    keywords: "runtime health",
    label: "Overview",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/overview",
  },
  {
    keywords: "runtime operations",
    label: "Operations",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations",
  },
  {
    keywords: "failure inbox",
    label: "Dead Letters",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations/dead-letters",
  },
  {
    keywords: "runtime function runs module queue",
    label: "Functions",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations/functions",
  },
  {
    keywords: "proxy module remote operations",
    label: "Remote Calls",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations/remote-calls",
  },
  {
    keywords: "module action operations",
    label: "Admin Actions",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations/admin-actions",
  },
  {
    keywords: "queue pressure",
    label: "Queues",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/operations/queues",
  },
  {
    keywords: "module registry packages installs",
    label: "Modules",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/modules",
  },
  {
    keywords: "schema admin business data",
    label: "Data",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/data",
  },
  {
    keywords: "settings configuration",
    label: "Configuration",
    moduleId: "host",
    navigation: {
      workspace: SYSTEM_WORKSPACE,
    },
    path: "/config",
  },
] satisfies CommandNavigationItem[];

export function CommandPalette({ theme, onToggleTheme }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { closeCommandPalette, commandOpen, focusGlobalSearch, openStory } =
    useRuntimeConsole();
  const consoleNavigation = useConsoleNavigation();
  const storiesQuery = useRuntimeStories();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo<CommandItem[]>(() => {
    const stories = queryDataWithMockFallback({
      apiMode: isApiMode(),
      data: storiesQuery.data,
      fallback: runtimeStories,
      isError: storiesQuery.isError,
    });
    const storyItems = buildStoryCommandItems({
      onOpenStory: openStory,
      stories,
    });
    const commandNavigationItems: CommandNavigationItem[] = [
      ...systemCommandNavigationItems,
      ...consoleNavigation,
    ];
    const consoleItems: CommandItem[] = commandNavigationItems.map((item) => {
      const workspaceLabel = item.navigation?.workspace.label ?? "System";
      const keywords = item.keywords ? ` ${item.keywords}` : "";

      return {
        action: () => void navigate({ to: item.path }),
        id: `console:${item.moduleId}:${item.path}`,
        searchText:
          `go to ${item.label} ${workspaceLabel} ${item.moduleId} ${item.path}${keywords}`.toLowerCase(),
        subtitle: `${workspaceLabel} / ${item.moduleId}`,
        title: `Go to ${item.label}`,
      };
    });
    const items: CommandItem[] = [
      ...consoleItems,
      {
        action: onToggleTheme,
        id: "theme-toggle",
        searchText: "switch theme light dark mode console",
        subtitle:
          theme === "dark"
            ? "Use light console theme"
            : "Use dark console theme",
        title:
          theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
      },
      {
        action: () => {
          focusGlobalSearch();
        },
        id: "search",
        searchText: "search in stories correlation story execution",
        subtitle: "Correlation search now lives in Stories",
        title: "Search in Stories",
      },
      {
        action: copyCurrentLink,
        id: "copy-current-link",
        searchText: "copy current link url permalink deep link",
        subtitle: "Copy the current console URL",
        title: "Copy Current Link",
      },
      ...storyItems,
    ];

    return items;
  }, [
    focusGlobalSearch,
    consoleNavigation,
    navigate,
    onToggleTheme,
    openStory,
    storiesQuery.data,
    storiesQuery.isError,
    theme,
  ]);

  const visible = commands.filter((command) =>
    command.searchText.includes(query.trim().toLowerCase())
  );
  const visibleEntries = useMemo<CommandEntry[]>(
    () => visible.map((command, index) => ({ command, index })),
    [visible]
  );
  const groupedCommands = useMemo(
    () => [
      {
        items: visibleEntries.slice(0, 5),
        label: "Suggestions",
      },
      {
        items: visibleEntries.slice(5),
        label: "Commands",
      },
    ],
    [visibleEntries]
  );

  useEffect(() => {
    if (commandOpen) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [commandOpen]);

  const runCommand = (command: CommandItem | undefined) => {
    if (!command) {
      return;
    }
    command.action();
    closeCommandPalette();
  };

  return (
    <Dialog
      onOpenChange={(open) => !open && closeCommandPalette()}
      open={commandOpen}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="z-[60] bg-(--bg-scrim)" />
        <Dialog.Popup
          aria-label="Command palette"
          className="z-[70] top-[12vh] flex h-[min(560px,calc(100vh-72px))] w-[min(760px,calc(100vw-40px))] flex-col overflow-hidden rounded-[var(--radius-overlay)] border border-(--line) bg-(--bg-overlay) p-0 shadow-(--elevation-overlay) max-sm:top-3 max-sm:h-[min(520px,calc(100vh-24px))] max-sm:w-[calc(100vw-20px)]"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeCommandPalette();
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (visible.length > 0) {
                setActiveIndex((index) =>
                  Math.min(index + 1, visible.length - 1)
                );
              }
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (visible.length > 0) {
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
            }
            if (event.key === "Enter") {
              runCommand(visible[activeIndex]);
            }
          }}
        >
          <div className="flex h-12 items-center gap-2 border-b border-(--line) bg-(--bg-panel-header) px-3 text-(--fg-secondary)">
            <CommandMark />
            <input
              aria-label="Command search"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-none text-(--fg-primary) outline-hidden placeholder:text-(--fg-quaternary)"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
                listRef.current?.scrollTo({ top: 0 });
              }}
              placeholder="Search commands, stories, modules..."
              ref={inputRef}
              value={query}
            />
            <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-(--fg-tertiary) max-sm:hidden">
              <span>Command</span>
              <Keycap>
                <CornerDownLeft size={13} strokeWidth={2.2} />
              </Keycap>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2" ref={listRef}>
            {visible.length === 0 ? (
              <div className="grid h-full place-items-center text-sm font-medium text-(--fg-tertiary)">
                No commands found
              </div>
            ) : (
              groupedCommands.map((group) =>
                group.items.length > 0 ? (
                  <section className="mt-2 first:mt-0" key={group.label}>
                    <h2 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-(--fg-tertiary)">
                      {group.label}
                    </h2>
                    <div className="grid gap-px">
                      {group.items.map(({ command, index }) => (
                        <button
                          className={`grid h-10 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-control)] border px-2 text-left transition-colors max-sm:grid-cols-[28px_minmax(0,1fr)] ${
                            index === activeIndex
                              ? "border-(--accent) bg-(--accent-muted)"
                              : "border-transparent hover:bg-(--bg-row-hover)"
                          }`}
                          key={command.id}
                          onClick={() => runCommand(command)}
                          type="button"
                        >
                          <CommandIcon id={command.id} />
                          <span className="flex min-w-0 items-baseline gap-3 max-sm:block">
                            <strong className="truncate text-xs font-semibold leading-none text-(--fg-primary) max-sm:block">
                              {command.title}
                            </strong>
                            <small className="truncate text-xs font-medium leading-none text-(--fg-tertiary) max-sm:mt-1 max-sm:block">
                              {command.subtitle}
                            </small>
                          </span>
                          <span className="text-[11px] font-medium text-(--fg-tertiary) max-sm:hidden">
                            {commandKind(command.id)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null
              )
            )}
          </div>
          <div className="flex h-10 items-center justify-between gap-3 border-t border-(--line) bg-(--bg-panel-header) px-3">
            <button
              aria-label="Command options"
              className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) text-(--fg-tertiary) transition-colors hover:bg-(--bg-control-hover) hover:text-(--fg-primary)"
              type="button"
            >
              <Menu size={14} strokeWidth={1.8} />
            </button>
            <div className="flex items-center gap-2 text-[11px] font-medium text-(--fg-tertiary)">
              <span className="text-(--fg-secondary)">Open Command</span>
              <Keycap>
                <CornerDownLeft size={13} strokeWidth={2.2} />
              </Keycap>
              <span>Actions</span>
              <span className="flex items-center gap-1.5">
                <Keycap>⌘</Keycap>
                <Keycap>K</Keycap>
              </span>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog>
  );
}

function copyCurrentLink() {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(currentBrowserUrl(), window.location.origin).toString();
  void window.navigator.clipboard?.writeText(url);
}

function CommandIcon({ id }: { id: string }) {
  const icon = iconForCommand(id);

  return (
    <span className="grid size-7 place-items-center rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) text-(--fg-secondary)">
      {icon}
    </span>
  );
}

function iconForCommand(id: string) {
  if (id === "theme-toggle") {
    return <ThemeCommandIcon />;
  }
  if (id === "search") {
    return <Search size={18} />;
  }
  if (id.includes("retry")) {
    return <RotateCcw size={18} />;
  }
  if (id.includes("copy")) {
    return <Copy size={18} />;
  }
  return <GitBranch size={18} />;
}

function ThemeCommandIcon() {
  return (
    <span className="grid size-4.5 place-items-center">
      <Sun className="hidden [[data-theme=dark]_&]:block" size={18} />
      <Moon className="block [[data-theme=dark]_&]:hidden" size={18} />
    </span>
  );
}

function commandKind(id: string) {
  if (id.startsWith("console:")) {
    return "Application";
  }
  if (id.startsWith("story:")) {
    return "Story";
  }
  return "Command";
}

function CommandMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) text-(--fg-tertiary)">
      <CommandGlyph size={15} strokeWidth={1.9} />
    </span>
  );
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="grid min-h-5 min-w-5 place-items-center rounded-[4px] border border-(--line) bg-(--bg-control) px-1 font-sans text-[11px] font-semibold leading-none text-(--fg-tertiary)">
      {children}
    </kbd>
  );
}
