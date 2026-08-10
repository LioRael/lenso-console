import * as stylex from "@stylexjs/stylex";
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
import { useConsole } from "./console-context";

const localStyles = stylex.create({
  utilityZ60: {
    zIndex: "60",
  },
  utilityBgBgScrim: {
    backgroundColor: "var(--bg-scrim)",
  },
  utilityZ70: {
    zIndex: "70",
  },
  utilityTop12vh: {
    top: "12vh",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityHMin560pxCalc100vh72px: {
    height: "min(560px, calc(100vh - 72px))",
  },
  utilityWMin760pxCalc100vw40px: {
    width: "min(760px, calc(100vw - 40px))",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityRoundedVarRadiusOverlay: {
    borderRadius: "var(--radius-overlay)",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgOverlay: {
    backgroundColor: "var(--bg-overlay)",
  },
  utilityP0: {
    padding: "calc(0.25rem * 0)",
  },
  utilityShadowElevationOverlay: {
    boxShadow: "var(--elevation-overlay)",
  },
  utilityMaxSmTop3: {
    "@media (max-width: 639px)": {
      top: "calc(0.25rem * 3)",
    },
  },
  utilityMaxSmHMin520pxCalc100vh24px: {
    "@media (max-width: 639px)": {
      height: "min(520px, calc(100vh - 24px))",
    },
  },
  utilityMaxSmWCalc100vw20px: {
    "@media (max-width: 639px)": {
      width: "calc(100vw - 20px)",
    },
  },
  utilityH12: {
    height: "calc(0.25rem * 12)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBgBgPanelHeader: {
    backgroundColor: "var(--bg-panel-header)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityBgTransparent: {
    backgroundColor: "transparent",
  },
  utilityTextSm: {
    fontSize: "var(--text-sm, 0.875rem)",
    lineHeight: "var(--text-sm--line-height, 1.25rem)",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityLeadingNone: {
    lineHeight: "1",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityOutlineHidden: {
    outlineStyle: "none",
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  utilityPlaceholderTextFgQuaternary: {
    "::placeholder": {
      color: "var(--fg-quaternary)",
    },
  },
  utilityFocusVisibleOutline2: {
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "2px",
    },
  },
  utilityFocusVisibleOutlineFocusRing: {
    ":focus-visible": {
      outlineColor: "var(--focus-ring)",
    },
  },
  utilityFocusVisibleOutlineOffset1: {
    ":focus-visible": {
      outlineOffset: "1px",
    },
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityMaxSmHidden: {
    "@media (max-width: 639px)": {
      display: "none",
    },
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityP2: {
    padding: "calc(0.25rem * 2)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityFirstMt0: {
    ":first-child": {
      marginTop: "calc(0.25rem * 0)",
    },
  },
  utilityPx2: {
    paddingInline: "calc(0.25rem * 2)",
  },
  utilityPy1: {
    paddingBlock: "calc(0.25rem * 1)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTracking004em: {
    letterSpacing: "0.04em",
  },
  utilityGapPx: {
    gap: "1px",
  },
  utilityItemsBaseline: {
    alignItems: "baseline",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityMaxSmBlock: {
    "@media (max-width: 639px)": {
      display: "block",
    },
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityMaxSmMt1: {
    "@media (max-width: 639px)": {
      marginTop: "calc(0.25rem * 1)",
    },
  },
  utilityH10: {
    height: "calc(0.25rem * 10)",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilitySize7: {
    width: "calc(0.25rem * 7)",
    height: "calc(0.25rem * 7)",
  },
  utilityRoundedVarRadiusControl: {
    borderRadius: "var(--radius-control)",
  },
  utilityBgBgControl: {
    backgroundColor: "var(--bg-control)",
  },
  utilityTransitionColors: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityHoverBgBgControlHover: {
    ":hover": {
      backgroundColor: "var(--bg-control-hover)",
    },
  },
  utilityHoverTextFgPrimary: {
    ":hover": {
      color: "var(--fg-primary)",
    },
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilitySize45: {
    width: "calc(0.25rem * 4.5)",
    height: "calc(0.25rem * 4.5)",
  },
  utilityMinH5: {
    minHeight: "calc(0.25rem * 5)",
  },
  utilityMinW5: {
    minWidth: "calc(0.25rem * 5)",
  },
  utilityRounded4px: {
    borderRadius: "4px",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
});

const styles = stylex.create({
  commandItem: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: "var(--radius-control)",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: 8,
    gridTemplateColumns: {
      default: "28px minmax(0,1fr) auto",
      "@media (max-width: 639px)": "28px minmax(0,1fr)",
    },
    height: 40,
    paddingInline: 8,
    textAlign: "left",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
    width: "100%",
    ":hover": { backgroundColor: "var(--bg-row-hover)" },
  },
  commandItemActive: {
    backgroundColor: "var(--accent-muted)",
    borderColor: "var(--accent)",
  },
});

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
    useConsole();
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
        <Dialog.Backdrop
          {...stylex.props([
            localStyles.utilityZ60,
            localStyles.utilityBgBgScrim,
          ])}
        />
        <Dialog.Popup
          aria-label="Command palette"
          {...stylex.props([
            localStyles.utilityZ70,
            localStyles.utilityTop12vh,
            localStyles.utilityFlex,
            localStyles.utilityHMin560pxCalc100vh72px,
            localStyles.utilityWMin760pxCalc100vw40px,
            localStyles.utilityFlexCol,
            localStyles.utilityOverflowHidden,
            localStyles.utilityRoundedVarRadiusOverlay,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgOverlay,
            localStyles.utilityP0,
            localStyles.utilityShadowElevationOverlay,
            localStyles.utilityMaxSmTop3,
            localStyles.utilityMaxSmHMin520pxCalc100vh24px,
            localStyles.utilityMaxSmWCalc100vw20px,
          ])}
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
          <div
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityH12,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap2,
              localStyles.utilityBorderB,
              localStyles.utilityBorderLine,
              localStyles.utilityBgBgPanelHeader,
              localStyles.utilityPx3,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            <CommandMark />
            <input
              aria-label="Command search"
              {...stylex.props([
                localStyles.utilityMinW0,
                localStyles.utilityFlex1,
                localStyles.utilityBgTransparent,
                localStyles.utilityTextSm,
                localStyles.utilityFontMedium,
                localStyles.utilityLeadingNone,
                localStyles.utilityTextFgPrimary,
                localStyles.utilityOutlineHidden,
                localStyles.utilityPlaceholderTextFgQuaternary,
                localStyles.utilityFocusVisibleOutline2,
                localStyles.utilityFocusVisibleOutlineFocusRing,
                localStyles.utilityFocusVisibleOutlineOffset1,
              ])}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
                listRef.current?.scrollTo({ top: 0 });
              }}
              placeholder="Search commands, stories, modules..."
              ref={inputRef}
              value={query}
            />
            <div
              {...stylex.props([
                localStyles.utilityFlex,
                localStyles.utilityShrink0,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap2,
                localStyles.utilityText11px,
                localStyles.utilityFontMedium,
                localStyles.utilityTextFgTertiary,
                localStyles.utilityMaxSmHidden,
              ])}
            >
              <span>Command</span>
              <Keycap>
                <CornerDownLeft size={13} strokeWidth={2.2} />
              </Keycap>
            </div>
          </div>
          <div
            {...stylex.props([
              localStyles.utilityMinH0,
              localStyles.utilityFlex1,
              localStyles.utilityOverflowAuto,
              localStyles.utilityP2,
            ])}
            ref={listRef}
          >
            {visible.length === 0 ? (
              <div
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityHFull,
                  localStyles.utilityPlaceItemsCenter,
                  localStyles.utilityTextSm,
                  localStyles.utilityFontMedium,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                No commands found
              </div>
            ) : (
              groupedCommands.map((group) =>
                group.items.length > 0 ? (
                  <section
                    {...stylex.props([
                      localStyles.utilityMt2,
                      localStyles.utilityFirstMt0,
                    ])}
                    key={group.label}
                  >
                    <h2
                      {...stylex.props([
                        localStyles.utilityPx2,
                        localStyles.utilityPy1,
                        localStyles.utilityText10px,
                        localStyles.utilityFontSemibold,
                        localStyles.utilityUppercase,
                        localStyles.utilityTracking004em,
                        localStyles.utilityTextFgTertiary,
                      ])}
                    >
                      {group.label}
                    </h2>
                    <div
                      {...stylex.props([
                        localStyles.utilityGrid,
                        localStyles.utilityGapPx,
                      ])}
                    >
                      {group.items.map(({ command, index }) => (
                        <button
                          {...stylex.props(
                            styles.commandItem,
                            index === activeIndex && styles.commandItemActive
                          )}
                          key={command.id}
                          onClick={() => runCommand(command)}
                          type="button"
                        >
                          <CommandIcon id={command.id} theme={theme} />
                          <span
                            {...stylex.props([
                              localStyles.utilityFlex,
                              localStyles.utilityMinW0,
                              localStyles.utilityItemsBaseline,
                              localStyles.utilityGap3,
                              localStyles.utilityMaxSmBlock,
                            ])}
                          >
                            <strong
                              {...stylex.props([
                                localStyles.utilityTruncate,
                                localStyles.utilityTextXs,
                                localStyles.utilityFontSemibold,
                                localStyles.utilityLeadingNone,
                                localStyles.utilityTextFgPrimary,
                                localStyles.utilityMaxSmBlock,
                              ])}
                            >
                              {command.title}
                            </strong>
                            <small
                              {...stylex.props([
                                localStyles.utilityTruncate,
                                localStyles.utilityTextXs,
                                localStyles.utilityFontMedium,
                                localStyles.utilityLeadingNone,
                                localStyles.utilityTextFgTertiary,
                                localStyles.utilityMaxSmMt1,
                                localStyles.utilityMaxSmBlock,
                              ])}
                            >
                              {command.subtitle}
                            </small>
                          </span>
                          <span
                            {...stylex.props([
                              localStyles.utilityText11px,
                              localStyles.utilityFontMedium,
                              localStyles.utilityTextFgTertiary,
                              localStyles.utilityMaxSmHidden,
                            ])}
                          >
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
          <div
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityH10,
              localStyles.utilityItemsCenter,
              localStyles.utilityJustifyBetween,
              localStyles.utilityGap3,
              localStyles.utilityBorderT,
              localStyles.utilityBorderLine,
              localStyles.utilityBgBgPanelHeader,
              localStyles.utilityPx3,
            ])}
          >
            <button
              aria-label="Command options"
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilitySize7,
                localStyles.utilityShrink0,
                localStyles.utilityPlaceItemsCenter,
                localStyles.utilityRoundedVarRadiusControl,
                localStyles.utilityBorder,
                localStyles.utilityBorderLine,
                localStyles.utilityBgBgControl,
                localStyles.utilityTextFgTertiary,
                localStyles.utilityTransitionColors,
                localStyles.utilityHoverBgBgControlHover,
                localStyles.utilityHoverTextFgPrimary,
              ])}
              type="button"
            >
              <Menu size={14} strokeWidth={1.8} />
            </button>
            <div
              {...stylex.props([
                localStyles.utilityFlex,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap2,
                localStyles.utilityText11px,
                localStyles.utilityFontMedium,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              <span {...stylex.props([localStyles.utilityTextFgSecondary])}>
                Open Command
              </span>
              <Keycap>
                <CornerDownLeft size={13} strokeWidth={2.2} />
              </Keycap>
              <span>Actions</span>
              <span
                {...stylex.props([
                  localStyles.utilityFlex,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityGap15,
                ])}
              >
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

function CommandIcon({ id, theme }: { id: string; theme: "dark" | "light" }) {
  const icon = iconForCommand(id, theme);

  return (
    <span
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilitySize7,
        localStyles.utilityPlaceItemsCenter,
        localStyles.utilityRoundedVarRadiusControl,
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgControl,
        localStyles.utilityTextFgSecondary,
      ])}
    >
      {icon}
    </span>
  );
}

function iconForCommand(id: string, theme: "dark" | "light") {
  if (id === "theme-toggle") {
    return <ThemeCommandIcon theme={theme} />;
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

function ThemeCommandIcon({ theme }: { theme: "dark" | "light" }) {
  return (
    <span
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilitySize45,
        localStyles.utilityPlaceItemsCenter,
      ])}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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
    <span
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilitySize7,
        localStyles.utilityShrink0,
        localStyles.utilityPlaceItemsCenter,
        localStyles.utilityRoundedVarRadiusControl,
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgControl,
        localStyles.utilityTextFgTertiary,
      ])}
    >
      <CommandGlyph size={15} strokeWidth={1.9} />
    </span>
  );
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilityMinH5,
        localStyles.utilityMinW5,
        localStyles.utilityPlaceItemsCenter,
        localStyles.utilityRounded4px,
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgControl,
        localStyles.utilityPx1,
        localStyles.utilityFontSans,
        localStyles.utilityText11px,
        localStyles.utilityFontSemibold,
        localStyles.utilityLeadingNone,
        localStyles.utilityTextFgTertiary,
      ])}
    >
      {children}
    </kbd>
  );
}
