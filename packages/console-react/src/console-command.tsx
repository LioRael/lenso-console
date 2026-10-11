import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { Search, X } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { ConsolePageCommand } from "./console-action-scope";
import { ConsoleIconButton } from "./console-icon-button";
import { shellStyles as styles } from "./console-shell.styles";

export interface ConsoleCommandResult {
  id: string;
  label: string;
  disabled?: boolean;
  onInvoke(): void;
}

/** Command temporarily retires Dock panes; restore a live equivalent control. */
export function useConsoleCommandFocus(
  open: boolean,
  dockRef: RefObject<HTMLElement | null>,
  fallback?: () => HTMLElement | null
) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousLabel = useRef<string | null>(null);
  const restore = useRef(false);
  const reset = useCallback(() => {
    restore.current = false;
    previousFocus.current = null;
    previousLabel.current = null;
  }, []);
  const resolve = () => {
    const previous = previousFocus.current;
    if (previous?.isConnected && !previous.closest("[inert], [hidden]")) {
      return previous;
    }
    return (
      Array.from(
        dockRef.current?.querySelectorAll<HTMLElement>("[aria-label]") ?? []
      ).find(
        (node) =>
          node.getAttribute("aria-label") === previousLabel.current &&
          !node.closest("[inert], [hidden]")
      ) ?? null
    );
  };
  useLayoutEffect(() => {
    if (!open && restore.current) {
      restore.current = false;
      (resolve() ?? fallback?.())?.focus({ preventScroll: true });
    }
  });
  return {
    resolve,
    capture() {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      previousLabel.current =
        previousFocus.current?.getAttribute("aria-label") ?? null;
      return previousFocus.current;
    },
    restore() {
      restore.current = true;
    },
    reset,
  };
}

export function ConsoleCommand({
  inputRef,
  destinations,
  presets,
  actions,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  destinations: readonly ConsoleCommandResult[];
  presets: readonly ConsoleCommandResult[];
  actions: readonly ConsolePageCommand[];
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [inputRef]);
  const groups = [
    { label: "Current page", items: actions },
    { label: "Destinations", items: destinations },
    { label: "Dock presets", items: presets },
  ].map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    ),
  }));
  return (
    <div {...stylex.props(styles.directory)}>
      <div {...stylex.props(styles.trayHeader)}>
        <label {...stylex.props(styles.searchField)}>
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Search commands"
            placeholder="Find a destination or action"
            {...stylex.props(styles.search)}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.defaultPrevented) {
                return;
              }
              const first =
                resultsRef.current?.querySelector<HTMLButtonElement>(
                  "button:not(:disabled)"
                );
              if (event.key === "ArrowDown") {
                event.preventDefault();
                first?.focus();
              } else if (event.key === "Enter") {
                event.preventDefault();
                first?.click();
              }
            }}
          />
        </label>
        <ConsoleIconButton
          label="Close Command"
          variant="ghost"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </ConsoleIconButton>
      </div>
      <div ref={resultsRef} {...stylex.props(styles.commandResults)}>
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 {...stylex.props(styles.commandGroup)}>{group.label}</h2>
              <ul {...stylex.props(styles.list, styles.commandList)}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Button
                      variant="ghost"
                      xstyle={styles.commandResult}
                      disabled={item.disabled}
                      onClick={() => item.onInvoke()}
                    >
                      {item.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {!groups.some((group) => group.items.length) && (
          <output>No matching commands.</output>
        )}
      </div>
    </div>
  );
}
