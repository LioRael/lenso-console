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
  const [listScrolled, setListScrolled] = useState(false);

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
      setListScrolled(false);
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
        <Dialog.Backdrop className="z-60 bg-transparent" />
        <Dialog.Popup
          aria-label="Command palette"
          className="z-70 top-[10vh] flex h-[min(480px,calc(100vh-56px))] w-[min(720px,calc(100vw-40px))] flex-col overflow-hidden rounded-[26px] border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--elevated)_96%,transparent)] p-0 shadow-[0_20px_54px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.42)_inset] backdrop-blur-2xl max-sm:top-3 max-sm:h-[min(500px,calc(100vh-24px))] max-sm:w-[calc(100vw-20px)] max-sm:rounded-[24px]"
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
          <div className="absolute inset-x-0 top-0 z-10 isolate flex min-h-16 items-center gap-3 px-5 pt-1 text-(--secondary) max-sm:min-h-18 max-sm:gap-3 max-sm:px-4">
            {listScrolled ? (
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--elevated)_30%,transparent)_0%,color-mix(in_srgb,var(--elevated)_10%,transparent)_44%,transparent_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,black_0%,black_56%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_56%,transparent_100%)]"
              />
            ) : null}
            <CommandMark />
            <input
              aria-label="Command search"
              className="min-w-0 flex-1 bg-transparent text-[22px] font-medium leading-none text-(--foreground) outline-hidden placeholder:text-(--muted-deep) max-sm:text-xl"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
                setListScrolled(false);
                listRef.current?.scrollTo({ top: 0 });
              }}
              placeholder="Search for apps and commands..."
              ref={inputRef}
              value={query}
            />
            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-(--muted-deep) max-sm:hidden">
              <span>Quick AI</span>
              <Keycap>
                <CornerDownLeft size={16} strokeWidth={2.4} />
              </Keycap>
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto px-2.5 pt-16 pb-2.5 max-sm:px-2 max-sm:pt-18"
            onScroll={(event) => {
              const scrolled = event.currentTarget.scrollTop > 2;
              setListScrolled((current) =>
                current === scrolled ? current : scrolled
              );
            }}
            ref={listRef}
          >
            {visible.length === 0 ? (
              <div className="grid h-full place-items-center text-[18px] font-medium text-(--muted)">
                No commands found
              </div>
            ) : (
              groupedCommands.map((group) =>
                group.items.length > 0 ? (
                  <section className="mt-3 first:mt-1" key={group.label}>
                    <h2 className="mb-1.5 px-4 text-[13px] font-semibold text-(--muted) max-sm:text-xs">
                      {group.label}
                    </h2>
                    <div className="space-y-1">
                      {group.items.map(({ command, index }) => (
                        <button
                          className={`grid h-12 w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-transparent px-4 text-left text-(--foreground) transition-colors max-sm:h-13 max-sm:grid-cols-[38px_minmax(0,1fr)] max-sm:gap-3 max-sm:px-3 ${
                            index === activeIndex
                              ? "bg-[color-mix(in_srgb,var(--muted)_18%,transparent)] shadow-[0_1px_0_rgba(255,255,255,0.34)_inset]"
                              : "hover:bg-[color-mix(in_srgb,var(--muted)_9%,transparent)]"
                          }`}
                          key={command.id}
                          onClick={() => runCommand(command)}
                          type="button"
                        >
                          <CommandIcon id={command.id} />
                          <span className="flex min-w-0 items-baseline gap-4 max-sm:block">
                            <strong className="truncate text-[15px] font-semibold leading-none tracking-normal text-(--foreground) max-sm:block max-sm:text-sm">
                              {command.title}
                            </strong>
                            <small className="truncate text-[15px] font-medium leading-none text-(--muted) max-sm:mt-1 max-sm:block max-sm:text-xs">
                              {command.subtitle}
                            </small>
                          </span>
                          <span className="text-[15px] font-semibold text-(--muted) max-sm:hidden">
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
          <BottomProgressiveCommandBlur />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 px-3 pb-3 max-sm:px-3">
            <button
              aria-label="Command options"
              className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--border)_78%,transparent)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] text-(--muted) shadow-[0_10px_28px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.58)_inset] backdrop-blur-xl transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)]"
              type="button"
            >
              <Menu size={20} strokeWidth={1.8} />
            </button>
            <div className="pointer-events-auto flex min-h-10 items-center gap-3 rounded-full border border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] px-4 text-[13px] font-semibold text-(--muted) shadow-[0_12px_36px_rgba(0,0,0,0.13),0_1px_0_rgba(255,255,255,0.62)_inset] backdrop-blur-xl">
              <span className="text-(--foreground)">Open Command</span>
              <Keycap>
                <CornerDownLeft size={16} strokeWidth={2.4} />
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
    <span className="grid size-9 place-items-center rounded-[10px] border border-[color-mix(in_srgb,var(--border)_62%,transparent)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] text-(--secondary) shadow-[0_1px_0_rgba(255,255,255,0.52)_inset,0_8px_18px_rgba(0,0,0,0.08)]">
      {icon}
    </span>
  );
}

function BottomProgressiveCommandBlur() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-16 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--elevated)_30%,transparent)_0%,color-mix(in_srgb,var(--elevated)_10%,transparent)_44%,transparent_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_top,black_0%,black_44%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,black_0%,black_44%,transparent_100%)]"
    />
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
    <span className="grid size-9 shrink-0 place-items-center text-(--muted-deep) max-sm:size-8">
      <CommandGlyph size={28} strokeWidth={1.8} />
    </span>
  );
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="grid min-h-7 min-w-7 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--border)_78%,transparent)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-1.5 font-sans text-xs font-semibold leading-none text-(--muted) shadow-[0_1px_0_rgba(255,255,255,0.58)_inset]">
      {children}
    </kbd>
  );
}
